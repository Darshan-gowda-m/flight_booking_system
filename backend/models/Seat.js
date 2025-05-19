const db = require('../config/db')

class Seat {
  static validate(data) {
    const errors = []
    const requiredFields = ['seat_number', 'class', 'flight_id']

    requiredFields.forEach((field) => {
      if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
    })

    const validClasses = ['Economy', 'Business', 'First']
    if (data.class && !validClasses.includes(data.class)) {
      errors.push(`Invalid seat class: ${data.class}`)
    }

    if (data.seat_number && !/^[A-Z0-9_-]{1,10}$/.test(data.seat_number)) {
      errors.push('Seat number must be 1-10 alphanumeric characters')
    }

    if (errors.length > 0) {
      throw new Error(`Seat validation failed: ${errors.join(', ')}`)
    }
  }

  static async book(seatId, ticketId) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const [seat] = await conn.query(
        `SELECT s.*, f.status AS flight_status
       FROM seats s
       JOIN flights f ON s.flight_id = f.flight_id
       WHERE s.seat_id = ?
       FOR UPDATE`,
        [seatId]
      )

      if (!seat[0]) throw new Error('Seat not found')
      const seatData = seat[0]

      if (seatData.is_booked) throw new Error('Seat already booked')
      if (seatData.flight_status !== 'Scheduled') {
        throw new Error('Cannot book seat for completed/canceled flight')
      }

      await conn.query(
        `UPDATE seats SET is_booked = TRUE
       WHERE seat_id = ?`,
        [seatId]
      )

      const [flightUpdate] = await conn.query(
        `UPDATE flights 
       SET available_seats = available_seats - 1
       WHERE flight_id = ?`,
        [seatData.flight_id]
      )

      if (flightUpdate.affectedRows === 0) {
        throw new Error('Failed to update flight availability')
      }

      if (ticketId) {
        await conn.query(
          `UPDATE tickets SET seat_id = ?
         WHERE ticket_id = ?`,
          [seatId, ticketId]
        )
      }

      await conn.commit()
      return this.findById(seatId, conn)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  static async update(id, updates) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [current] = await conn.query(
        `SELECT s.*, f.status AS flight_status
         FROM seats s
         JOIN flights f ON s.flight_id = f.flight_id
         WHERE s.seat_id = ?
         FOR UPDATE`,
        [id]
      )

      if (!current[0]) throw new Error('Seat not found')
      const currentData = current[0]

      if (currentData.flight_status !== 'Scheduled') {
        throw new Error('Cannot modify seats for completed flight')
      }

      if (currentData.is_booked) {
        const prohibited = ['seat_number', 'class', 'flight_id']
        if (prohibited.some((field) => updates[field] !== undefined)) {
          throw new Error('Cannot modify booked seat details')
        }
      }

      if (updates.class && updates.class !== currentData.class) {
        const [pricing] = await conn.query(
          `SELECT base_price, ceil_price
           FROM pricing
           WHERE flight_id = ? AND class = ?`,
          [currentData.flight_id, updates.class]
        )

        if (!pricing[0]) {
          throw new Error('Pricing not found for seat class')
        }

        const base = Number(pricing[0].base_price)
        const ceil = Number(pricing[0].ceil_price)
        updates.price = parseFloat(
          (base + Math.random() * (ceil - base)).toFixed(2)
        )
      }

      const [result] = await conn.query(
        'UPDATE seats SET ? WHERE seat_id = ?',
        [updates, id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Seat update failed')
      }

      await conn.commit()
      return this.findById(id, conn)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  static async findById(id, connection = db) {
    try {
      const [rows] = await connection.query(
        `SELECT s.*,
          f.flight_number,
          a.name AS airline_name,
          dep.code AS departure_airport,
          arr.code AS arrival_airport,
          p.base_price,
          p.ceil_price
         FROM seats s
         JOIN flights f ON s.flight_id = f.flight_id
         JOIN airlines a ON f.airline_id = a.airline_id
         JOIN airports dep ON f.departure_airport = dep.airport_id
         JOIN airports arr ON f.arrival_airport = arr.airport_id
         JOIN pricing p ON f.flight_id = p.flight_id AND s.class = p.class
         WHERE s.seat_id = ?`,
        [id]
      )
      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'find seat by ID')
    }
  }

  static async getAvailable(flightId, options = {}, connection = db) {
    const { seatClass } = options
    const params = [flightId]
    const where = ['s.flight_id = ? AND s.is_booked = FALSE']

    if (seatClass) {
      where.push('s.class = ?')
      params.push(seatClass)
    }

    try {
      const [rows] = await connection.query(
        `SELECT s.*,
         p.base_price,
         p.ceil_price,
         f.flight_number,
         a.name AS airline_name
       FROM seats s
       JOIN pricing p ON s.flight_id = p.flight_id AND s.class = p.class
       JOIN flights f ON s.flight_id = f.flight_id
       JOIN airlines a ON f.airline_id = a.airline_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.class, s.seat_number`,
        params
      )

      return {
        data: rows,
      }
    } catch (error) {
      throw this.handleError(error, 'get available seats')
    }
  }

  static async search({ flightId, seatIds = [] }, conn = db) {
    try {
      let query = 'SELECT * FROM seats WHERE flight_id = ?'
      const params = [flightId]

      if (seatIds.length > 0) {
        query += ' AND seat_id IN (?)'
        params.push(seatIds)
      }

      const [rows] = await conn.query(query, params)
      return rows
    } catch (error) {
      throw error
    }
  }
  static async bulkUpdate(updates, conn = db) {
    try {
      await conn.beginTransaction()

      const results = []
      for (const update of updates) {
        const { seat_id, ...updateData } = update
        const [result] = await conn.query(
          'UPDATE seats SET ? WHERE seat_id = ?',
          [updateData, seat_id]
        )
        results.push(result)
      }

      await conn.commit()
      return results
    } catch (error) {
      await conn.rollback()
      throw error
    }
  }

  static handleError(error, context) {
    console.error(`Seat Error (${context}):`, error.message)
    switch (error.code) {
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Invalid flight reference')
      case 'ER_DUP_ENTRY':
        return error.sqlMessage.includes('seat_number')
          ? new Error('Seat number already exists for this flight')
          : new Error('Duplicate entry')
      case 'ER_DATA_TOO_LONG':
        return new Error('Data exceeds column limit')
      case 'ER_TRIGGER_DOES_NOT_EXIST':
        return new Error('Database configuration error')
      case 'ER_BAD_NULL_ERROR':
        return new Error('Missing required field')
      default:
        return error
    }
  }
}

module.exports = Seat
