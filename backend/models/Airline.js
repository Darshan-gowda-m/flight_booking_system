const db = require('../config/db')

class Airline {
  // validate incoming data
  static validate(data) {
    if (!this.update) {
      const errors = []
      if (!data.name) errors.push('Name is required')
      if (!data.code) errors.push('Code is required')

      if (data.name && data.name.length > 100) {
        errors.push('Name must be ≤100 characters')
      }
      if (data.code && data.code.length > 5) {
        errors.push('Code must be ≤5 characters')
      }
      if (data.contact && data.contact.length > 15) {
        errors.push('Contact must be ≤15 characters')
      }
      if (
        data.email &&
        !/^[\w.%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data.email)
      ) {
        errors.push('Invalid email format')
      }

      if (errors.length > 0) {
        throw new Error(`Airline validation failed: ${errors.join(', ')}`)
      }
    }
  }
  //create airline
  static async create(airlineData) {
    this.validate(airlineData)
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [existing] = await conn.query(
        'SELECT airline_id FROM airlines WHERE BINARY code = ?',
        [airlineData.code]
      )

      if (existing.length > 0) {
        throw new Error(`Airline code '${airlineData.code}' already exists`)
      }

      const [result] = await conn.query(
        `INSERT INTO airlines (name, code, contact, email, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [
          airlineData.name,
          airlineData.code,
          airlineData.contact || null,
          airlineData.email || null,
          airlineData.is_active ?? true,
        ]
      )

      await conn.commit()
      return result.insertId
    } catch (error) {
      await conn.rollback()
      throw new Error(`Failed to create airline: ${error.message}`)
    } finally {
      conn.release()
    }
  }

  //update airline details
  static async update(id, updates) {
    this.validate(updates)
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [airline] = await conn.query(
        'SELECT * FROM airlines WHERE airline_id = ? FOR UPDATE',
        [id]
      )

      if (!airline.length) {
        throw new Error('Airline not found')
      }

      if (updates.code && updates.code !== airline[0].code) {
        const [existing] = await conn.query(
          'SELECT airline_id FROM airlines WHERE BINARY code = ?',
          [updates.code]
        )

        if (existing.length > 0) {
          throw new Error(`Code '${updates.code}' already exists`)
        }
      }

      const updateFields = {
        name: updates.name || airline[0].name,
        code: updates.code || airline[0].code,
        contact: updates.contact ?? airline[0].contact,
        email: updates.email ?? airline[0].email,
        is_active: updates.is_active ?? airline[0].is_active,
      }

      const [result] = await conn.query(
        'UPDATE airlines SET ? WHERE airline_id = ?',
        [updateFields, id]
      )

      if (result.affectedRows === 0) {
        throw new Error('No changes made to airline record')
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
  // activete/deativate airlines
  static async softDelete(id) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [airline] = await conn.query(
        `SELECT is_active FROM airlines WHERE airline_id = ?`,
        [id]
      )

      if (airline.length === 0) {
        throw new Error('Airline not found')
      }

      const newStatus = !airline[0].is_active

      if (!newStatus) {
        const [flights] = await conn.query(
          `SELECT COUNT(*) AS active_flights 
         FROM flights 
         WHERE airline_id = ? AND status IN ('Scheduled', 'Delayed')`,
          [id]
        )

        if (flights[0].active_flights > 0) {
          throw new Error('Cannot deactivate airline with active flights')
        }
      }

      const [result] = await conn.query(
        `UPDATE airlines SET is_active = ? WHERE airline_id = ?`,
        [newStatus, id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Airline not found')
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
  // hard delete
  static async hardDelete(id) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [flights] = await conn.query(
        'SELECT COUNT(*) AS flight_count FROM flights WHERE airline_id = ?',
        [id]
      )

      if (flights[0].flight_count > 0) {
        throw new Error('Cannot delete airline with associated flights')
      }

      const [result] = await conn.query(
        'DELETE FROM airlines WHERE airline_id = ?',
        [id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Airline not found')
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
  // find airline
  static async findById(id, connection = db) {
    try {
      const [rows] = await connection.query(
        `SELECT *, 
         (SELECT COUNT(*) FROM flights WHERE airline_id = ?) AS total_flights
         FROM airlines 
         WHERE airline_id = ?`,
        [id, id]
      )
      return rows[0] || null
    } catch (error) {
      throw new Error(`Error fetching airline: ${error.message}`)
    }
  }
  //find by code
  static async findByCode(code) {
    try {
      const [rows] = await db.query(
        'SELECT * FROM airlines WHERE BINARY code = ?',
        [code]
      )
      return rows[0] || null
    } catch (error) {
      throw new Error(`Error finding airline by code: ${error.message}`)
    }
  }

  static async getAllPaginated(options = {}) {
    const {
      page = 1,
      limit = 10,
      includeInactive = false,
      searchTerm = '',
    } = options

    const offset = (page - 1) * limit
    const params = []
    let baseQuery = 'FROM airlines'
    let whereClauses = []

    if (!includeInactive) whereClauses.push('is_active = TRUE')
    if (searchTerm) {
      whereClauses.push('(name LIKE ? OR code LIKE ?)')
      params.push(`%${searchTerm}%`, `%${searchTerm}%`)
    }

    if (whereClauses.length) baseQuery += ` WHERE ${whereClauses.join(' AND ')}`

    try {
      const [countResult] = await db.query(
        `SELECT COUNT(*) AS total ${baseQuery}`,
        params
      )
      const total = countResult[0].total
      const totalPages = Math.ceil(total / limit)

      const [rows] = await db.query(
        `SELECT * ${baseQuery}
         ORDER BY name ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      )

      return { data: rows, total, page, limit, totalPages }
    } catch (error) {
      throw new Error(`Error fetching airlines: ${error.message}`)
    }
  }
  // get only active airlines
  static async getAllActive() {
    try {
      const [rows] = await db.query(
        `SELECT airline_id, name, code 
         FROM airlines 
         WHERE is_active = TRUE
         ORDER BY name ASC`
      )
      return rows
    } catch (error) {
      throw new Error(`Error fetching active airlines: ${error.message}`)
    }
  }

  static async getStatistics() {
    try {
      const [result] = await db.query(
        `SELECT 
          COUNT(*) AS total_airlines,
          SUM(is_active) AS active_airlines,
          (SELECT COUNT(*) FROM flights) AS total_flights,
          (SELECT COUNT(*) FROM flights WHERE status = 'Scheduled') AS scheduled_flights
         FROM airlines`
      )
      return result[0]
    } catch (error) {
      throw new Error(`Error fetching statistics: ${error.message}`)
    }
  }
}

module.exports = Airline
