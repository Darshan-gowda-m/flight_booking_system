const db = require('../config/db')

class Passenger {
  static validate(data) {
    const errors = []
    const requiredFields = [
      'first_name',
      'last_name',
      'email',
      'passport_number',
    ]

    requiredFields.forEach((field) => {
      if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
    })

    const lengthConstraints = {
      first_name: 50,
      last_name: 50,
      email: 100,
      phone: 15,
      passport_number: 20,
    }

    Object.entries(lengthConstraints).forEach(([field, max]) => {
      if (data[field] && data[field].length > max) {
        errors.push(`${field.replace('_', ' ')} must be ≤${max} characters`)
      }
    })

    if (
      data.email &&
      !/^[\w.%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data.email)
    ) {
      errors.push('Invalid email format')
    }

    if (data.date_of_birth) {
      const dob = new Date(data.date_of_birth)
      if (isNaN(dob)) errors.push('Invalid date format for date of birth')
      if (dob > new Date()) errors.push('Date of birth cannot be in the future')
    }

    if (errors.length > 0) {
      throw new Error(`Passenger validation failed: ${errors.join(', ')}`)
    }
  }

  async create(userId, passengerData) {
    try {
      // First try to find existing passenger
      const [existing] = await db.query(
        `SELECT passenger_id FROM passengers 
             WHERE user_id = ? 
             AND first_name = ? 
             AND last_name = ? 
             AND (email = ? OR ? IS NULL)
             AND (passport_number = ? OR ? IS NULL)
             LIMIT 1`,
        [
          userId,
          passengerData.first_name,
          passengerData.last_name,
          passengerData.email || null,
          passengerData.email || null,
          passengerData.passport_number || null,
          passengerData.passport_number || null,
        ]
      )
      // Create new passenger if not found
      const [result] = await db.query(
        `INSERT INTO passengers 
             (user_id, first_name, last_name, email, phone, passport_number, date_of_birth)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          passengerData.first_name,
          passengerData.last_name,
          passengerData.email,
          passengerData.phone,
          passengerData.passport_number,
          passengerData.date_of_birth,
        ]
      )

      return result.insertId
    } catch (error) {
      console.error('Error in findOrCreatePassenger:', error)
      throw error
    }
  }
  static async bulkCreate(passengers, conn = db) {
    try {
      const query = `
        INSERT INTO passengers (user_id, first_name, last_name, email, phone, passport_number, date_of_birth)
        VALUES ?
      `

      const values = passengers.map((passenger) => [
        passenger.user_id,
        passenger.first_name,
        passenger.last_name,
        passenger.email,
        passenger.phone || null,
        passenger.passport_number,
        passenger.date_of_birth || null,
      ])

      const [result] = await conn.query(query, [values])
      return passengers.map((passenger, index) => ({
        ...passenger,
        passenger_id: result.insertId + index,
      }))
    } catch (error) {
      throw error
    }
  }

  static async update(id, updates) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const current = await this.findById(id, conn)
      this.validate({ ...current, ...updates })

      if (updates.user_id && updates.user_id !== current.user_id) {
        const [user] = await conn.query(
          'SELECT user_id FROM users WHERE user_id = ?',
          [updates.user_id]
        )
        if (!user.length) throw new Error('User not found')
      }

      const updateFields = {
        first_name: updates.first_name || current.first_name,
        last_name: updates.last_name || current.last_name,
        email: updates.email || current.email,
        phone: updates.phone ?? current.phone,
        passport_number: updates.passport_number || current.passport_number,
        date_of_birth: updates.date_of_birth ?? current.date_of_birth,
        user_id: updates.user_id ?? current.user_id,
      }

      const [result] = await conn.query(
        'UPDATE passengers SET ? WHERE passenger_id = ?',
        [updateFields, id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Passenger not found')
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

  static async softDelete(id) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [result] = await conn.query(
        `UPDATE passengers SET is_active = FALSE
         WHERE passenger_id = ?`,
        [id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Passenger not found')
      }

      await conn.commit()
      return true
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  static async hardDelete(id) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [tickets] = await conn.query(
        'SELECT COUNT(*) AS ticket_count FROM tickets WHERE passenger_id = ?',
        [id]
      )

      if (tickets[0].ticket_count > 0) {
        throw new Error('Cannot delete passenger with associated tickets')
      }

      const [result] = await conn.query(
        'DELETE FROM passengers WHERE passenger_id = ?',
        [id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Passenger not found')
      }

      await conn.commit()
      return true
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
        `SELECT p.*, 
          u.username AS user_username,
          (SELECT COUNT(*) FROM tickets WHERE passenger_id = ?) AS total_tickets
         FROM passengers p
         LEFT JOIN users u ON p.user_id = u.user_id
         WHERE p.passenger_id = ?`,
        [id, id]
      )
      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'find passenger by ID')
    }
  }

  static async search(options = {}) {
    const { query = '', activeOnly = true, page = 1, limit = 20 } = options
    const offset = (page - 1) * limit
    const params = []
    const where = []

    if (query) {
      where.push(`(p.first_name LIKE ? 
        OR p.last_name LIKE ? 
        OR p.email LIKE ? 
        OR p.passport_number LIKE ?)`)
      params.push(...Array(4).fill(`%${query}%`))
    }

    try {
      const [count] = await db.query(
        `SELECT COUNT(*) AS total 
         FROM passengers p
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
        params
      )

      const [rows] = await db.query(
        `SELECT p.*, u.username 
         FROM passengers p
         LEFT JOIN users u ON p.user_id = u.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY p.last_name, p.first_name
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
      throw this.handleError(error, 'search passengers')
    }
  }

  static handleError(error, context) {
    console.error(`Passenger Error (${context}):`, error.message)
    switch (error.code) {
      case 'ER_ROW_IS_REFERENCED_2':
        return new Error('Cannot delete passenger with ticket dependencies')
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Invalid user reference')
      default:
        return error
    }
  }
}

module.exports = Passenger
