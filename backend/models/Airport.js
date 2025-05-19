const db = require('../config/db')

class Airport {
  static validate(data, isUpdate = false) {
    const errors = []

    if (!isUpdate) {
      const requiredFields = ['name', 'code', 'city', 'country']
      requiredFields.forEach((field) => {
        if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
      })
    }

    const lengthConstraints = {
      name: 100,
      code: 5,
      city: 50,
      country: 50,
    }

    Object.entries(lengthConstraints).forEach(([field, max]) => {
      if (data[field] && data[field].length > max) {
        errors.push(`${field.replace('_', ' ')} must be ≤${max} characters`)
      }
    })

    if (data.code && !/^[A-Z0-9]{3,5}$/.test(data.code)) {
      errors.push('Code must be 3-5 uppercase alphanumeric characters')
    }

    if (errors.length > 0) {
      throw new Error(`Airport validation failed: ${errors.join(', ')}`)
    }
  }

  static async create(airportData) {
    this.validate(airportData)
    const code = airportData.code.toUpperCase().trim()
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [existing] = await conn.query(
        'SELECT airport_id FROM airports WHERE code = ? FOR UPDATE',
        [code]
      )

      if (existing.length > 0) {
        throw new Error(`Airport code ${code} already exists`)
      }

      const [result] = await conn.query(
        `INSERT INTO airports (name, code, city, country, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [
          airportData.name,
          code,
          airportData.city,
          airportData.country,
          airportData.is_active ?? true,
        ]
      )

      await conn.commit()
      return result.insertId
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  static async update(id, updates) {
    this.validate(updates)
    if (updates.code) updates.code = updates.code.toUpperCase().trim()
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [current] = await conn.query(
        'SELECT * FROM airports WHERE airport_id = ? FOR UPDATE',
        [id]
      )

      if (!current.length) {
        throw new Error('Airport not found')
      }

      if (updates.code && updates.code !== current[0].code) {
        const [existing] = await conn.query(
          'SELECT airport_id FROM airports WHERE code = ?',
          [updates.code]
        )

        if (existing.length > 0) {
          throw new Error(`Code ${updates.code} already exists`)
        }
      }

      const updateFields = {
        name: updates.name || current[0].name,
        code: updates.code || current[0].code,
        city: updates.city || current[0].city,
        country: updates.country || current[0].country,
        is_active: updates.is_active ?? current[0].is_active,
      }

      const [result] = await conn.query(
        'UPDATE airports SET ? WHERE airport_id = ?',
        [updateFields, id]
      )

      if (result.affectedRows === 0) {
        throw new Error('No changes made to airport record')
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

      const [airport] = await conn.query(
        `SELECT is_active FROM airports WHERE airport_id = ?`,
        [id]
      )

      if (airport.length === 0) {
        throw new Error('Airport not found')
      }

      const newStatus = !airport[0].is_active

      if (!newStatus) {
        const [flights] = await conn.query(
          `SELECT COUNT(*) AS count FROM flights
         WHERE (departure_airport = ? OR arrival_airport = ?)
         AND status IN ('Scheduled', 'Delayed')`,
          [id, id]
        )

        if (flights[0].count > 0) {
          throw new Error('Cannot deactivate airport with active flights')
        }
      }

      const [result] = await conn.query(
        `UPDATE airports SET is_active = ? WHERE airport_id = ?`,
        [newStatus, id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Airport not found')
      }

      await conn.commit()
      return { success: true, newStatus }
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

      const [flights] = await conn.query(
        `SELECT COUNT(*) AS count FROM flights
         WHERE departure_airport = ? OR arrival_airport = ?`,
        [id, id]
      )

      if (flights[0].count > 0) {
        throw new Error('Cannot delete airport with flight associations')
      }

      const [result] = await conn.query(
        'DELETE FROM airports WHERE airport_id = ?',
        [id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Airport not found')
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
        `SELECT *, 
         (SELECT COUNT(*) FROM flights WHERE departure_airport = ?) AS departure_flights,
         (SELECT COUNT(*) FROM flights WHERE arrival_airport = ?) AS arrival_flights
         FROM airports WHERE airport_id = ?`,
        [id, id, id]
      )
      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'find airport by ID')
    }
  }

  static async search(options = {}) {
    const { query = '', page = 1, limit = 20, activeOnly = true } = options
    const offset = (page - 1) * limit
    const params = []
    const whereClauses = []

    if (activeOnly) whereClauses.push('is_active = TRUE')
    if (query) {
      whereClauses.push(
        '(name LIKE ? OR code LIKE ? OR city LIKE ? OR country LIKE ?)'
      )
      params.push(...Array(4).fill(`%${query}%`))
    }

    try {
      const [count] = await db.query(
        `SELECT COUNT(*) AS total FROM airports
         ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}`,
        params
      )

      const [rows] = await db.query(
        `SELECT * FROM airports
         ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
         ORDER BY city, name
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
      throw this.handleError(error, 'search airports')
    }
  }

  static async getStatistics() {
    try {
      const [result] = await db.query(
        `SELECT 
          COUNT(*) AS total_airports,
          SUM(is_active) AS active_airports,
          COUNT(DISTINCT country) AS countries_served,
          (SELECT COUNT(*) FROM flights) AS total_flights
         FROM airports`
      )
      return result[0]
    } catch (error) {
      throw this.handleError(error, 'get statistics')
    }
  }

  static handleError(error, context) {
    console.error(`Airport Error (${context}):`, error.message)
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        return new Error('Airport code already exists')
      case 'ER_ROW_IS_REFERENCED_2':
        return new Error('Cannot modify airport with flight dependencies')
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Invalid airport reference')
      default:
        return error
    }
  }
}

module.exports = Airport
