const db = require('../config/db')
const schedule = require('node-schedule')

class Ticket {
  static STATUSES = Object.freeze({
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    REFUND_REQUESTED: 'Refund Requested',
    EXPIRED: 'Expired',
  })

  static initializeScheduler() {
    this.expirationJob = schedule.scheduleJob('*/1 * * * *', async () => {
      try {
        console.log('[Ticket] Running pending tickets expiration check...')
        const result = await this.expirePendingTickets()
        if (result.expired > 0) {
          console.log(
            `[Ticket] Expired ${result.expired} pending tickets and released ${result.seatsReleased} seats`
          )
        }
      } catch (error) {
        console.error('[Ticket] Error in expiration job:', error.message)
      }
    })
    console.log('[Ticket] Initialized pending tickets expiration scheduler')
  }

  static async expirePendingTickets(expiryMinutes = 10, connection = db) {
    const conn = await connection.getConnection()
    try {
      await conn.beginTransaction()

      const [tickets] = await conn.query(
        `SELECT t.ticket_id, t.seat_id, t.passenger_id, t.flight_id
         FROM tickets t
         WHERE t.status = 'Pending'
         AND t.created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
         FOR UPDATE`,
        [expiryMinutes]
      )

      if (tickets.length === 0) {
        await conn.rollback()
        return { expired: 0, seatsReleased: 0 }
      }

      const ticketIds = tickets.map((t) => t.ticket_id)
      const seatIds = tickets.filter((t) => t.seat_id).map((t) => t.seat_id)

      const [updateResult] = await conn.query(
        `UPDATE tickets 
         SET status = 'Expired', 
            expires_at = NOW(), 
            seat_id = NULL,
            updated_at = NOW()
         WHERE ticket_id IN (?)`,
        [ticketIds]
      )

      let seatsReleased = 0
      if (seatIds.length > 0) {
        const [seatResult] = await conn.query(
          `UPDATE seats 
           SET is_booked = 0, 
               updated_at = NOW()
           WHERE seat_id IN (?)`,
          [seatIds]
        )
        seatsReleased = seatResult.affectedRows
      }

      await conn.commit()

      return {
        expired: updateResult.affectedRows,
        seatsReleased: seatsReleased,
      }
    } catch (error) {
      await conn.rollback()
      throw this.handleError(error, 'expire pending tickets')
    } finally {
      conn.release()
    }
  }

  static validate(data) {
    const errors = []
    const requiredFields = ['seat_id', 'passenger_id', 'flight_id']

    requiredFields.forEach((field) => {
      if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
    })

    if (errors.length > 0) {
      throw new Error(`Ticket validation failed: ${errors.join(', ')}`)
    }
  }

  static async bulkCreate(tickets, conn = db) {
    try {
      const query = `
        INSERT INTO tickets (seat_id, passenger_id, flight_id, price, status, expires_at)
        VALUES ?
      `

      const values = tickets.map((ticket) => {
        const price = parseFloat(ticket.price)
        if (isNaN(price)) {
          throw new Error(`Invalid price for ticket: ${JSON.stringify(ticket)}`)
        }

        return [
          ticket.seat_id,
          ticket.passenger_id,
          ticket.flight_id,
          price,
          ticket.status || 'Pending',
          ticket.expires_at || null,
        ]
      })

      const [result] = await conn.query(query, [values])
      return tickets.map((ticket, index) => ({
        ...ticket,
        ticket_id: result.insertId + index,
      }))
    } catch (error) {
      throw error
    }
  }

  static async search({ page = 1, limit = 10, ticketIds = [] }, conn = db) {
    try {
      let query = 'SELECT * FROM tickets'
      let params = []

      if (ticketIds.length > 0) {
        query += ' WHERE ticket_id IN (?)'
        params.push(ticketIds)
      }

      if (ticketIds.length === 0) {
        const offset = (page - 1) * limit
        query += ' LIMIT ? OFFSET ?'
        params.push(limit, offset)
      }

      const [rows] = await conn.query(query, params)

      if (ticketIds.length === 0) {
        const [[{ total }]] = await conn.query(
          'SELECT COUNT(*) AS total FROM tickets'
        )
        return {
          data: rows,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        }
      }

      return rows
    } catch (error) {
      throw error
    }
  }

  static async create(ticketData) {
    this.validate(ticketData)
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const [seat] = await conn.query(
        `SELECT s.*, f.status AS flight_status
         FROM seats s
         JOIN flights f ON s.flight_id = f.flight_id
         WHERE s.seat_id = ? AND s.is_booked = 0
         FOR UPDATE`,
        [ticketData.seat_id]
      )

      if (!seat[0]) throw new Error('Seat not available')
      if (
        seat[0].flight_status !== 'Scheduled' ||
        seat[0].flight_status !== 'Delayed'
      ) {
        throw new Error('Cannot book ticket for completed/canceled flight')
      }

      const [passenger] = await conn.query(
        'SELECT 1 FROM passengers WHERE passenger_id = ?',
        [ticketData.passenger_id]
      )
      if (!passenger.length) throw new Error('Invalid passenger')

      let finalPrice = seat[0].price
      let discountUsed = null
      if (ticketData.discount_id) {
        const [discount] = await conn.query(
          `SELECT * FROM discounts 
           WHERE discount_id = ?
             AND valid_from <= NOW()
             AND valid_until >= NOW()
             AND (max_uses IS NULL OR max_uses > 0)
           FOR UPDATE`,
          [ticketData.discount_id]
        )
        if (!discount.length) throw new Error('Invalid or expired discount')
        finalPrice *= 1 - discount[0].discount_percent / 100
        discountUsed = discount[0].discount_id
      }

      await conn.query(
        `UPDATE seats SET is_booked = 1
         WHERE seat_id = ?`,
        [ticketData.seat_id]
      )

      const [result] = await conn.query(
        `INSERT INTO tickets SET
         seat_id = ?,
         passenger_id = ?,
         flight_id = ?,
         price = ?,
         discount_id = ?,
         status = 'Pending',
         expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE)`,
        [
          ticketData.seat_id,
          ticketData.passenger_id,
          seat[0].flight_id,
          finalPrice,
          discountUsed,
        ]
      )

      if (discountUsed) {
        await conn.query(
          `UPDATE discounts 
           SET max_uses = IFNULL(max_uses - 1, NULL)
           WHERE discount_id = ?`,
          [discountUsed]
        )
      }

      await conn.commit()
      return this.findById(result.insertId, conn)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  static async cancel(id, conn = db) {
    try {
      const [ticket] = await conn.query(
        `SELECT t.*, f.departure_time
         FROM tickets t
         JOIN flights f ON t.flight_id = f.flight_id
         WHERE t.ticket_id = ?
         FOR UPDATE`,
        [id]
      )

      if (!ticket[0]) throw new Error('Ticket not found')
      if (ticket[0].status !== 'Confirmed') {
        throw new Error('Only confirmed tickets can be cancelled')
      }

      if (ticket[0].seat_id) {
        await conn.query(
          `UPDATE seats SET is_booked = 0
           WHERE seat_id = ?`,
          [ticket[0].seat_id]
        )
      }

      await conn.query(
        `UPDATE tickets 
         SET status = 'Cancelled', 
            seat_id = NULL,
            updated_at = NOW()
         WHERE ticket_id = ?`,
        [id]
      )

      return { success: true, ticket_id: id }
    } catch (error) {
      throw this.handleError(error, 'cancel ticket')
    }
  }

  static async updateStatus(ticketId, newStatus, conn = db) {
    try {
      const [result] = await conn.query(
        `UPDATE tickets SET status = ?
         WHERE ticket_id = ?`,
        [newStatus, ticketId]
      )
      if (result.affectedRows === 0) {
        throw new Error('Ticket not found')
      }
      return this.findById(ticketId, conn)
    } catch (error) {
      throw this.handleError(error, 'update ticket status')
    }
  }

  static async getByUser(
    userId,
    { status, page = 1, limit = 10 },
    connection = db
  ) {
    const offset = (page - 1) * limit
    const conn = await connection.getConnection()

    try {
      let query = `
      SELECT 
          t.ticket_id,
          t.status,
          t.price,
          t.discount_id,
          t.created_at,
          t.expires_at,
      
          p.passenger_id,
          p.first_name,
          p.last_name,
          p.passport_number,
          p.email AS passenger_email,
          p.phone AS passenger_phone,
          f.flight_id,
          f.flight_number,
          f.departure_time,
          f.arrival_time,
          f.status AS flight_status,
          dep.airport_id AS departure_airport_id,
          dep.code AS departure_airport,
          dep.name AS departure_airport_name,
          dep.city AS departure_city,
          arr.airport_id AS arrival_airport_id,
          arr.code AS arrival_airport,
          arr.name AS arrival_airport_name,
          arr.city AS arrival_city,
          a.airline_id,
          a.name AS airline_name,

          s.seat_id,
          s.seat_number,
          s.class,
          d.code AS discount_code,
          d.discount_percent,
          pm.method AS payment_method,
          pm.status AS payment_status,
          pm.transaction_id,
          pm.amount AS payment_amount,
          r.refund_id,
          r.status AS refund_status,
          r.amount AS refund_amount,
          r.request_reason,
          r.admin_comment,
          r.penalty
      FROM tickets t
      JOIN passengers p ON t.passenger_id = p.passenger_id
      JOIN flights f ON t.flight_id = f.flight_id
      JOIN airlines a ON f.airline_id = a.airline_id
      JOIN airports dep ON f.departure_airport = dep.airport_id
      JOIN airports arr ON f.arrival_airport = arr.airport_id
      LEFT JOIN seats s ON t.seat_id = s.seat_id
      LEFT JOIN discounts d ON t.discount_id = d.discount_id
      LEFT JOIN payments pm ON t.ticket_id = pm.ticket_id
      LEFT JOIN refunds r ON t.ticket_id = r.ticket_id
      WHERE p.user_id = ?
    `

      let params = [userId]

      // Add status filter if provided
      if (status) {
        query += ' AND t.status = ?'
        params.push(status)
      }

      // Add sorting (newest first)
      query += ' ORDER BY t.created_at DESC'

      // Add pagination
      query += ' LIMIT ? OFFSET ?'
      params.push(limit, offset)

      // Execute the query
      const [data] = await conn.query(query, params)

      // Count query for pagination
      let countQuery = `
      SELECT COUNT(*) as count
      FROM tickets t
      JOIN passengers p ON t.passenger_id = p.passenger_id
      WHERE p.user_id = ?
    `
      let countParams = [userId]

      if (status) {
        countQuery += ' AND t.status = ?'
        countParams.push(status)
      }

      const [[countResult]] = await conn.query(countQuery, countParams)

      // Process data to ensure all required fields for frontend
      const processedData = data.map((ticket) => ({
        ...ticket,
        // Ensure all required fields have proper values
        departure_airport: ticket.departure_airport || 'N/A',
        arrival_airport: ticket.arrival_airport || 'N/A',
        departure_airport_name: ticket.departure_airport_name || '',
        arrival_airport_name: ticket.arrival_airport_name || '',
        class: ticket.class || 'Unknown',
        status: ticket.status || 'Unknown',
        price: ticket.price || 0,
        discount: ticket.discount_percent || null,
        seat_number: ticket.seat_number || null,
        // Calculate derived fields
        isPending: ticket.status === 'Pending',
        isCancelled: ticket.status === 'Cancelled',
        isConfirmed: ticket.status === 'Confirmed',
        isRefundRequested: ticket.status === 'Refund Requested',
      }))

      return {
        data: processedData,
        total: countResult.count,
        page,
        limit,
        totalPages: Math.ceil(countResult.count / limit),
      }
    } catch (error) {
      console.error('[Ticket] Error in getByUser:', error)
      throw this.handleError(error, 'get tickets by user')
    } finally {
      conn.release()
    }
  }
  // static async findById(ticketId) {
  //   return db('tickets')
  //     .join('passengers', 'tickets.passenger_id', 'passengers.passenger_id')
  //     .where('tickets.ticket_id', ticketId)
  //     .select(
  //       'tickets.*',
  //       'passengers.first_name',
  //       'passengers.last_name',
  //       'passengers.passport_number',
  //       'passengers.user_id'
  //     )
  //     .first()
  // }
  static async requestRefund(ticketId, refundData, connection = db) {
    const conn = await connection.getConnection()
    try {
      await conn.beginTransaction()

      const [current] = await conn.query(
        `SELECT status FROM tickets WHERE ticket_id = ? FOR UPDATE`,
        [ticketId]
      )

      if (current[0].status !== this.STATUSES.CONFIRMED) {
        throw new Error('Ticket not in refundable state')
      }

      const [refund] = await conn.query(`INSERT INTO refunds SET ?`, [
        {
          ticket_id: ticketId,
          amount: refundData.amount,
          request_reason: refundData.reason,
          status: 'Pending',
        },
      ])

      await conn.query(
        `UPDATE tickets SET 
          status = ? 
         WHERE ticket_id = ?`,
        [this.STATUSES.REFUND_REQUESTED, ticketId]
      )

      await conn.commit()
      return refund.insertId
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  static async findById(id, connection = db) {
    if (isNaN(Number(id))) {
      throw new Error('Invalid ticket ID format')
    }

    try {
      const [rows] = await connection.query(
        `SELECT t.*,
         s.seat_number,
         s.class AS seat_class,
         f.flight_number,
         f.departure_time,
         f.arrival_time,
         f.status AS flight_status,
         dep.code AS departure_code,
         arr.code AS arrival_code,
         a.name AS airline_name,
         p.first_name,
         p.last_name,
         p.passport_number,
         d.code AS discount_code,
         d.discount_percent
         FROM tickets t
         LEFT JOIN seats s ON t.seat_id = s.seat_id
         JOIN flights f ON t.flight_id = f.flight_id
         JOIN airlines a ON f.airline_id = a.airline_id
         JOIN airports dep ON f.departure_airport = dep.airport_id
         JOIN airports arr ON f.arrival_airport = arr.airport_id
         JOIN passengers p ON t.passenger_id = p.passenger_id
         LEFT JOIN discounts d ON t.discount_id = d.discount_id
         WHERE t.ticket_id = ?`,
        [id]
      )
      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'find ticket by ID')
    }
  }

  static async getUserStats(userId) {
    const [rows] = await db.query(
      `SELECT 
         COUNT(*) AS total,
         SUM(t.status = 'Confirmed') AS confirmed,
      SUM(t.status = 'Cancelled' OR t.status = 'Refund Requested') AS cancelled,
         SUM(t.status = 'Pending') AS pending,
         SUM(t.status = 'Expired') AS expired,
         SUM(CASE WHEN t.status = 'Confirmed' THEN t.price ELSE 0 END) AS total_spent,
         COUNT(DISTINCT t.flight_id) AS unique_flights,
         MIN(f.departure_time) AS first_flight,
         MAX(f.departure_time) AS last_flight
       FROM tickets t
       JOIN passengers p ON t.passenger_id = p.passenger_id
       JOIN flights f ON t.flight_id = f.flight_id
       WHERE p.user_id = ?`,
      [userId]
    )

    return rows[0]
  }

  static handleError(error, context) {
    console.error(`Ticket Error (${context}):`, error.message)
    switch (error.code) {
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Invalid seat, passenger, or flight reference')
      case 'ER_DUP_ENTRY':
        return new Error('Duplicate ticket entry')
      case 'ER_DATA_TOO_LONG':
        return new Error('Data exceeds column limit')
      case 'ER_TRIGGER_DOES_NOT_EXIST':
        return new Error('Database configuration error')
      default:
        return error
    }
  }
}

Ticket.initializeScheduler()
module.exports = Ticket
