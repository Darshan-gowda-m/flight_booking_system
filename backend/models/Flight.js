const db = require('../config/db')
const logger = require('../config/logger')
const schedule = require('node-schedule')

class Flight {
  static validate(data) {
    const errors = []
    const requiredFields = [
      'flight_number',
      'departure_airport',
      'arrival_airport',
      'departure_time',
      'arrival_time',
      'total_seats',
      'airline_id',
      'pricing',
    ]

    requiredFields.forEach((field) => {
      if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
    })

    if (data.departure_airport === data.arrival_airport) {
      errors.push('Departure and arrival airports must be different')
    }

    if (data.departure_time && data.arrival_time) {
      const departure = new Date(data.departure_time)
      const arrival = new Date(data.arrival_time)
      const now = new Date()

      if (departure >= arrival) {
        errors.push('Departure must be before arrival')
      }

      if (departure < new Date(now.setHours(now.getHours() + 48))) {
        errors.push('Departure must be at least 48 hours from now')
      }

      const minDuration = data.minimum_duration_hours || 2
      if ((arrival - departure) / 36e5 < minDuration) {
        errors.push(`Duration must be at least ${minDuration} hours`)
      }
    }

    if (data.total_seats && data.total_seats <= 0) {
      errors.push('Total seats must be positive')
    }

    if (data.pricing) {
      const classes = ['Economy', 'Business', 'First']
      classes.forEach((cls) => {
        if (!data.pricing[cls]?.base_price || !data.pricing[cls]?.ceil_price) {
          errors.push(`Missing pricing for ${cls} class`)
        }
        if (data.pricing[cls].base_price > data.pricing[cls].ceil_price) {
          errors.push(`${cls} base price exceeds ceiling price`)
        }
      })
    }

    if (errors.length > 0) {
      throw new Error(`Flight validation failed: ${errors.join(', ')}`)
    }
  }

  static async create(flightData) {
    this.validate(flightData)
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [departureAirport] = await conn.query(
        `SELECT is_active FROM airports WHERE airport_id = ?`,
        [flightData.departure_airport]
      )
      if (!departureAirport.length || !departureAirport[0].is_active) {
        throw new Error('Departure airport is not active')
      }

      const [arrivalAirport] = await conn.query(
        `SELECT is_active FROM airports WHERE airport_id = ?`,
        [flightData.arrival_airport]
      )
      if (!arrivalAirport.length || !arrivalAirport[0].is_active) {
        throw new Error('Arrival airport is not active')
      }

      const [airline] = await conn.query(
        `SELECT is_active FROM airlines WHERE airline_id = ?`,
        [flightData.airline_id]
      )
      if (!airline.length || !airline[0].is_active) {
        throw new Error('Airline is not active')
      }

      const [result] = await conn.query(
        `INSERT INTO flights SET
          flight_number = ?,
          departure_airport = ?,
          arrival_airport = ?,
          departure_time = ?,
          arrival_time = ?,
          total_seats = ?,
          available_seats = ?,
          airline_id = ?,
          minimum_duration_hours = ?,
          status = 'Scheduled'`,
        [
          flightData.flight_number,
          flightData.departure_airport,
          flightData.arrival_airport,
          flightData.departure_time,
          flightData.arrival_time,
          flightData.total_seats,
          flightData.total_seats,
          flightData.airline_id,
          flightData.minimum_duration_hours || 2,
        ]
      )

      const flightId = result.insertId

      const pricingData = flightData.pricing
      await this.createPricing(conn, flightId, pricingData)

      await this.createSeats(
        conn,
        flightId,
        flightData.total_seats,
        pricingData
      )

      await conn.commit()
      return flightId
    } catch (error) {
      await conn.rollback()
      logger.error('Flight creation failed', { error: error.message })
      throw error
    } finally {
      conn.release()
    }
  }

  static async createPricing(conn, flightId, pricing) {
    const classes = ['Economy', 'Business', 'First']

    for (const cls of classes) {
      if (!pricing[cls]?.base_price || !pricing[cls]?.ceil_price) {
        throw new Error(`Missing pricing for ${cls} class`)
      }

      if (pricing[cls].base_price > pricing[cls].ceil_price) {
        throw new Error(`${cls} base price exceeds ceiling price`)
      }

      await conn.query(
        `INSERT INTO pricing (flight_id, class, base_price, ceil_price)
         VALUES (?, ?, ?, ?)`,
        [flightId, cls, pricing[cls].base_price, pricing[cls].ceil_price]
      )
    }
  }

  static async createSeats(conn, flightId, totalSeats, pricing) {
    const distribution = {
      Economy: Math.floor(totalSeats * 0.7),
      Business: Math.floor(totalSeats * 0.2),
      First:
        totalSeats -
        (Math.floor(totalSeats * 0.7) + Math.floor(totalSeats * 0.2)),
    }

    const seats = []
    const prefixes = { Economy: 'E', Business: 'B', First: 'F' }

    for (const [cls, count] of Object.entries(distribution)) {
      const { base_price, ceil_price } = pricing[cls]

      if (typeof base_price !== 'number' || typeof ceil_price !== 'number') {
        throw new Error(`Invalid pricing for ${cls} class`)
      }

      for (let i = 1; i <= count; i++) {
        const price = parseFloat(
          (base_price + Math.random() * (ceil_price - base_price)).toFixed(2)
        )

        if (isNaN(price) || price < base_price || price > ceil_price) {
          throw new Error(
            `Invalid price calculation for ${cls} class seat ${i}`
          )
        }

        seats.push([`${prefixes[cls]}${i}`, cls, flightId, price])
      }
    }

    await conn.query(
      `INSERT INTO seats (seat_number, class, flight_id, price)
       VALUES ?`,
      [seats]
    )
  }

  static async cancel(flightId) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [flight] = await conn.query(
        `SELECT * FROM flights 
         WHERE flight_id = ? 
         AND status IN ('Scheduled', 'Delayed')
         FOR UPDATE`,
        [flightId]
      )

      if (!flight[0]) throw new Error('Flight not found or already completed')

      await conn.query(
        `UPDATE flights 
         SET status = 'Canceled', available_seats = total_seats
         WHERE flight_id = ?`,
        [flightId]
      )

      const [tickets] = await conn.query(
        `SELECT ticket_id, price FROM tickets
         WHERE flight_id = ? AND status = 'Confirmed'
         FOR UPDATE`,
        [flightId]
      )

      await conn.query(
        `UPDATE tickets SET status = 'Cancelled'
         WHERE flight_id = ?`,
        [flightId]
      )

      await conn.query(
        `UPDATE seats SET is_booked = FALSE
         WHERE flight_id = ?`,
        [flightId]
      )

      if (tickets.length > 0) {
        const refunds = tickets.map((t) => [
          t.ticket_id,
          t.price,
          'Approved',
          'Flight cancellation',
          0.0,
        ])

        await conn.query(
          `INSERT INTO refunds 
           (ticket_id, amount, status, request_reason, penalty)
           VALUES ?`,
          [refunds]
        )
      }

      await conn.commit()
      return true
    } catch (error) {
      await conn.rollback()
      logger.error('Flight cancellation failed', {
        flightId,
        error: error.message,
      })
      throw error
    } finally {
      conn.release()
    }
  }

  static async updateFlightStatuses() {
    const conn = await db.getConnection()
    const now = new Date()

    try {
      await conn.beginTransaction()

      const [departResult] = await conn.query(
        `UPDATE flights 
         SET status = 'Departed'
         WHERE status IN ('Scheduled', 'Delayed')
         AND departure_time <= ?
         AND arrival_time > ?`,
        [now, now]
      )

      const [arriveResult] = await conn.query(
        `UPDATE flights 
         SET status = 'Arrived'
         WHERE status IN ('Scheduled', 'Delayed', 'Departed')
         AND arrival_time <= ?`,
        [now]
      )

      if (arriveResult.affectedRows > 0) {
        const [arrivedFlights] = await conn.query(
          `SELECT flight_id FROM flights 
           WHERE status = 'Arrived'
           AND arrival_time <= ?`,
          [now]
        )

        for (const flight of arrivedFlights) {
          await conn.query(
            `UPDATE seats SET is_booked = FALSE
             WHERE flight_id = ?`,
            [flight.flight_id]
          )
        }
      }

      await conn.commit()

      logger.info('Flight status updates completed', {
        departed: departResult.affectedRows,
        arrived: arriveResult.affectedRows,
      })

      return {
        departed: departResult.affectedRows,
        arrived: arriveResult.affectedRows,
      }
    } catch (error) {
      await conn.rollback()
      logger.error('Failed to update flight statuses', { error: error.message })
      throw error
    } finally {
      conn.release()
    }
  }

  static startStatusUpdateJob() {
    this.updateFlightStatuses().catch((error) => {
      logger.error('Initial flight status update failed', {
        error: error.message,
      })
    })

    const job = schedule.scheduleJob('* * * * *', async () => {
      try {
        await this.updateFlightStatuses()
      } catch (error) {
        logger.error('Scheduled flight status update failed', {
          error: error.message,
        })
      }
    })

    process.on('SIGTERM', () => {
      job.cancel()
      logger.info('Flight status job stopped (SIGTERM)')
    })

    process.on('SIGINT', () => {
      job.cancel()
      logger.info('Flight status job stopped (SIGINT)')
    })

    logger.info('Flight status update job started')
  }

  static async findById(id, connection = db) {
    const conn = connection || (await db.getConnection())
    let shouldRelease = !connection

    try {
      const [rows] = await conn.query(
        `SELECT f.*, 
          a.name AS airline_name,
          dep.name AS departure_airport_name,
          dep.code AS departure_airport_code,
          arr.name AS arrival_airport_name,
          arr.code AS arrival_airport_code,
          (SELECT COUNT(*) FROM seats WHERE flight_id = f.flight_id AND is_booked = FALSE) AS available_seats_count
         FROM flights f
         JOIN airlines a ON f.airline_id = a.airline_id
         JOIN airports dep ON f.departure_airport = dep.airport_id
         JOIN airports arr ON f.arrival_airport = arr.airport_id
         WHERE f.flight_id = ?`,
        [id]
      )
      return rows[0] || null
    } catch (error) {
      logger.error('Failed to find flight by ID', {
        flightId: id,
        error: error.message,
      })
      throw this.handleError(error, 'find flight by ID')
    } finally {
      if (shouldRelease) conn.release()
    }
  }

  static async getAll({
    page = 1,
    limit = 10,
    sortBy = 'departure_time',
    sortOrder = 'asc',
    status = null,
  } = {}) {
    const offset = (page - 1) * limit
    const validSortColumns = [
      'departure_time',
      'arrival_time',
      'flight_number',
      'status',
    ]
    const validSortOrders = ['asc', 'desc']

    if (!validSortColumns.includes(sortBy)) {
      throw new Error('Invalid sort column')
    }
    if (!validSortOrders.includes(sortOrder)) {
      throw new Error('Invalid sort order')
    }

    const whereClause = status ? 'WHERE f.status = ?' : ''
    const params = status ? [status, limit, offset] : [limit, offset]

    try {
      const [count] = await db.query(
        `SELECT COUNT(*) AS total FROM flights f ${whereClause}`,
        status ? [status] : []
      )

      const [rows] = await db.query(
        `SELECT f.*, 
          a.name AS airline_name,
          dep.name AS departure_airport_name,
          arr.name AS arrival_airport_name,
          (SELECT COUNT(*) FROM seats WHERE flight_id = f.flight_id AND is_booked = FALSE) AS available_seats_count
         FROM flights f
         JOIN airlines a ON f.airline_id = a.airline_id
         JOIN airports dep ON f.departure_airport = dep.airport_id
         JOIN airports arr ON f.arrival_airport = arr.airport_id
         ${whereClause}
         ORDER BY f.${sortBy} ${sortOrder}
         LIMIT ? OFFSET ?`,
        params
      )

      return {
        data: rows,
        pagination: {
          total: count[0].total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count[0].total / limit),
        },
      }
    } catch (error) {
      logger.error('Failed to get all flights', { error: error.message })
      throw this.handleError(error, 'get all flights')
    }
  }

  static async search(filters = {}, pagination = { page: 1, limit: 20 }) {
    const { origin, destination, date, airline } = filters
    const { page, limit } = pagination
    const offset = (page - 1) * limit
    const params = []
    const where = []

    if (origin) {
      where.push('dep.code = ?')
      params.push(origin.toUpperCase())
    }
    if (destination) {
      where.push('arr.code = ?')
      params.push(destination.toUpperCase())
    }
    if (date) {
      where.push('DATE(f.departure_time) = ?')
      params.push(date)
    }
    if (airline) {
      where.push('a.code = ?')
      params.push(airline.toUpperCase())
    }

    where.push('f.status IN (?, ?)')
    params.push('Scheduled', 'Delayed')

    try {
      const [count] = await db.query(
        `SELECT COUNT(*) AS total
         FROM flights f
         JOIN airports dep ON f.departure_airport = dep.airport_id
         JOIN airports arr ON f.arrival_airport = arr.airport_id
         JOIN airlines a ON f.airline_id = a.airline_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
        params
      )

      const [rows] = await db.query(
        `SELECT f.*, 
           a.name AS airline_name,
           a.code AS airline_code,
           dep.code AS origin,
           arr.code AS destination,
           (SELECT COUNT(*) FROM seats WHERE flight_id = f.flight_id AND is_booked = FALSE) AS available_seats_count
         FROM flights f
         JOIN airlines a ON f.airline_id = a.airline_id
         JOIN airports dep ON f.departure_airport = dep.airport_id
         JOIN airports arr ON f.arrival_airport = arr.airport_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY f.departure_time
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      )

      return {
        data: rows,
        pagination: {
          total: count[0].total,
          page,
          limit,
          totalPages: Math.ceil(count[0].total / limit),
        },
      }
    } catch (error) {
      logger.error('Flight search failed', { filters, error: error.message })
      throw this.handleError(error, 'search flights')
    }
  }

  static async rescheduleCancelledFlight(flightId, newData) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [flight] = await conn.query(
        `SELECT * FROM flights 
         WHERE flight_id = ? 
         FOR UPDATE`,
        [flightId]
      )

      if (!flight.length) {
        throw new Error('Flight not found')
      }

      const currentStatus = flight[0].status

      if (currentStatus !== 'Canceled') {
        throw new Error('Only canceled flights can be rescheduled')
      }

      const {
        departure_airport,
        arrival_airport,
        departure_time,
        arrival_time,
      } = newData

      const prevDeparture = new Date(flight[0].departure_time)
      const prevArrival = new Date(flight[0].arrival_time)
      const newDeparture = new Date(departure_time)
      const newArrival = new Date(arrival_time)

      if (newDeparture >= newArrival) {
        throw new Error('Departure must be before arrival')
      }

      const minDuration = flight[0].minimum_duration_hours || 2
      if ((newArrival - newDeparture) / 36e5 < minDuration) {
        throw new Error(`Duration must be at least ${minDuration} hours`)
      }

      const [depAirport] = await conn.query(
        `SELECT is_active FROM airports WHERE airport_id = ?`,
        [departure_airport]
      )
      if (!depAirport.length || !depAirport[0].is_active) {
        throw new Error('Departure airport is not active')
      }

      const [arrAirport] = await conn.query(
        `SELECT is_active FROM airports WHERE airport_id = ?`,
        [arrival_airport]
      )
      if (!arrAirport.length || !arrAirport[0].is_active) {
        throw new Error('Arrival airport is not active')
      }

      await conn.query(
        `UPDATE flights
         SET departure_airport = ?, 
             arrival_airport = ?, 
             departure_time = ?, 
             arrival_time = ?, 
             status = 'Scheduled',
             previous_departure = ?,
             available_seats = total_seats
         WHERE flight_id = ?`,
        [
          departure_airport,
          arrival_airport,
          departure_time,
          arrival_time,
          flight[0].departure_time,
          flightId,
        ]
      )

      await conn.query(
        `UPDATE seats SET is_booked = FALSE
         WHERE flight_id = ?`,
        [flightId]
      )

      await conn.commit()
      return { success: true, message: 'Flight rescheduled successfully' }
    } catch (error) {
      await conn.rollback()
      logger.error('Flight rescheduling failed', {
        flightId,
        error: error.message,
      })
      throw error
    } finally {
      conn.release()
    }
  }

  static async updateStatus(
    flightId,
    newStatus,
    newDepartureTime = null,
    newArrivalTime = null
  ) {
    const validStatuses = ['Scheduled', 'Delayed', 'Canceled']

    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`)
    }

    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [flight] = await conn.query(
        `SELECT * FROM flights 
         WHERE flight_id = ? 
         FOR UPDATE`,
        [flightId]
      )

      if (!flight.length) {
        throw new Error('Flight not found')
      }

      if (flight[0].status === 'Arrived') {
        throw new Error('Cannot modify status of completed flights')
      }

      let updateQuery = `UPDATE flights SET status = ?`
      const params = [newStatus]

      if (newStatus === 'Delayed' && newDepartureTime && newArrivalTime) {
        if (new Date(newDepartureTime) >= new Date(newArrivalTime)) {
          throw new Error('New departure must be before new arrival')
        }
        updateQuery += `, departure_time = ?, arrival_time = ?`
        params.push(newDepartureTime, newArrivalTime)
      }

      updateQuery += ` WHERE flight_id = ?`
      params.push(flightId)

      await conn.query(updateQuery, params)

      await conn.commit()
      return { success: true, message: 'Flight status updated successfully' }
    } catch (error) {
      await conn.rollback()
      logger.error('Flight status update failed', {
        flightId,
        error: error.message,
      })
      throw error
    } finally {
      conn.release()
    }
  }

  static async getUpcomingDepartures(hours = 2) {
    try {
      const [rows] = await db.query(
        `SELECT f.*, 
          a.name AS airline_name,
          dep.name AS departure_airport_name,
          dep.code AS departure_airport_code,
          arr.name AS arrival_airport_name,
          arr.code AS arrival_airport_code,
          (SELECT COUNT(*) FROM seats WHERE flight_id = f.flight_id AND is_booked = FALSE) AS available_seats_count
         FROM flights f
         JOIN airlines a ON f.airline_id = a.airline_id
         JOIN airports dep ON f.departure_airport = dep.airport_id
         JOIN airports arr ON f.arrival_airport = arr.airport_id
         WHERE f.status IN ('Scheduled', 'Delayed')
         AND f.departure_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? HOUR)
         ORDER BY f.departure_time ASC`,
        [hours]
      )
      return rows
    } catch (error) {
      logger.error('Failed to fetch upcoming departures', {
        error: error.message,
      })
      throw error
    }
  }

  static async getRecentArrivals(hours = 1) {
    try {
      const [rows] = await db.query(
        `SELECT f.*, 
          a.name AS airline_name,
          dep.name AS departure_airport_name,
          dep.code AS departure_airport_code,
          arr.name AS arrival_airport_name,
          arr.code AS arrival_airport_code
         FROM flights f
         JOIN airlines a ON f.airline_id = a.airline_id
         JOIN airports dep ON f.departure_airport = dep.airport_id
         JOIN airports arr ON f.arrival_airport = arr.airport_id
         WHERE f.status = 'Arrived'
         AND f.arrival_time BETWEEN DATE_SUB(NOW(), INTERVAL ? HOUR) AND NOW()
         ORDER BY f.arrival_time DESC`,
        [hours]
      )
      return rows
    } catch (error) {
      logger.error('Failed to fetch recent arrivals', { error: error.message })
      throw error
    }
  }

  static handleError(error, context) {
    logger.error(`Flight Error (${context}): ${error.message}`)
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        return new Error('Flight number already exists')
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Invalid airport or airline reference')
      case 'ER_TRIGGER_DOES_NOT_EXIST':
        return new Error('Database configuration error')
      case 'ER_DATA_TOO_LONG':
        return new Error('Data exceeds column limit')
      case 'ER_LOCK_WAIT_TIMEOUT':
        return new Error('Database operation timed out - please try again')
      case 'ER_LOCK_DEADLOCK':
        return new Error('Database deadlock occurred - please try again')
      default:
        return error
    }
  }
}

Flight.startStatusUpdateJob()

module.exports = Flight
