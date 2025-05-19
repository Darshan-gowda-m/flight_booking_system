const db = require('../config/db')
const schedule = require('node-schedule')

class Discount {
  static validate(data, isEdit = false) {
    const errors = []

    const requiredFields = [
      'code',
      'discount_percent',
      'valid_from',
      'valid_until',
    ]

    if (!isEdit) {
      requiredFields.forEach((field) => {
        if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
      })
    }

    if (data.discount_percent !== undefined) {
      if (data.discount_percent < 0 || data.discount_percent > 100) {
        errors.push('Discount must be between 0-100%')
      }
    }

    if (data.valid_from && data.valid_until) {
      if (new Date(data.valid_from) >= new Date(data.valid_until)) {
        errors.push('Valid from date must be before valid until')
      }
    }

    if (data.code && !/^[A-Z0-9_-]{4,20}$/.test(data.code)) {
      errors.push(
        'Code must be 4-20 alphanumeric characters with underscores/dashes'
      )
    }

    if (errors.length > 0) {
      throw new Error(`Discount validation failed: ${errors.join(', ')}`)
    }
  }
  static async hardDelete(id) {
    const conn = await db.getConnection()

    try {
      console.log(`🗑️ Attempting to hard delete discount ID: ${id}`)
      await conn.beginTransaction()

      const [tickets] = await conn.query(
        `SELECT ticket_id FROM tickets WHERE discount_id = ? FOR UPDATE`,
        [id]
      )

      if (tickets.length > 0) {
        throw new Error('Cannot delete discount: Referenced by active tickets')
      }

      const [result] = await conn.query(
        `DELETE FROM discounts WHERE discount_id = ?`,
        [id]
      )

      if (result.affectedRows === 0) {
        throw new Error('No discount found or already deleted')
      }

      await conn.commit()
      return { success: true, message: 'Discount deleted successfully' }
    } catch (error) {
      await conn.rollback()
      throw this.handleError(error, 'hard delete discount')
    } finally {
      conn.release()
    }
  }
  static async create(discountData) {
    this.validate(discountData)
    discountData.code = discountData.code.toUpperCase()
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [existing] = await conn.query(
        'SELECT code FROM discounts WHERE code = ? FOR UPDATE',
        [discountData.code]
      )

      if (existing.length > 0) {
        throw new Error(`Discount code ${discountData.code} already exists`)
      }

      const [result] = await conn.query(
        `INSERT INTO discounts SET
          code = ?,
          description = ?,
          discount_percent = ?,
          max_uses = ?,
          valid_from = ?,
          valid_until = ?,
          is_active = ?`,
        [
          discountData.code,
          discountData.description || null,
          discountData.discount_percent,
          discountData.max_uses || null,
          discountData.valid_from,
          discountData.valid_until,
          discountData.is_active ?? true,
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
  static async applyToTickets(ticketIds, discountCode, conn = db) {
    if (!Array.isArray(ticketIds)) {
      throw new Error('Ticket IDs must be an array')
    }

    const [discount] = await conn.query(
      `SELECT * FROM discounts 
       WHERE code = ? AND valid_until > NOW()`,
      [discountCode]
    )

    if (!discount.length) {
      throw new Error('Invalid or expired discount code')
    }

    await conn.query(
      `UPDATE tickets
       SET discount_id = ?
       WHERE ticket_id IN (?)`,
      [discount[0].discount_id, ticketIds]
    )
  }

  static async findByCode(code, conn) {
    const [rows] = await conn.query(
      `SELECT * FROM discounts 
       WHERE code = ?`,
      [code.toUpperCase()]
    )
    return rows[0] || null
  }

  static async update(id, discountData) {
    const conn = await db.getConnection()

    try {
      console.log(`🔍 Updating discount ID: ${id}`)
      await conn.beginTransaction()

      this.validate(discountData, true)

      if (discountData.code) {
        const [existing] = await conn.query(
          `SELECT discount_id FROM discounts 
           WHERE code = ? AND discount_id != ?`,
          [discountData.code.toUpperCase(), id]
        )

        if (existing.length > 0) {
          throw new Error(`Discount code ${discountData.code} already exists`)
        }
      }

      const updates = []
      const params = []

      if (discountData.code) {
        updates.push('code = ?')
        params.push(discountData.code.toUpperCase())
      }
      if (discountData.description !== undefined) {
        updates.push('description = ?')
        params.push(discountData.description || null)
      }
      if (discountData.discount_percent !== undefined) {
        updates.push('discount_percent = ?')
        params.push(discountData.discount_percent)
      }
      if (discountData.max_uses !== undefined) {
        updates.push('max_uses = ?')
        params.push(discountData.max_uses || null)
      }
      if (discountData.valid_from) {
        updates.push('valid_from = ?')
        params.push(discountData.valid_from)
      }
      if (discountData.valid_until) {
        updates.push('valid_until = ?')
        params.push(discountData.valid_until)
      }
      if (discountData.is_active !== undefined) {
        updates.push('is_active = ?')
        params.push(discountData.is_active)
      }

      if (updates.length === 0) {
        throw new Error('No fields provided for update')
      }

      params.push(id)

      const [result] = await conn.query(
        `UPDATE discounts
         SET ${updates.join(', ')}
         WHERE discount_id = ?`,
        params
      )

      if (result.affectedRows === 0) {
        throw new Error('No discount found or no changes made')
      }

      await conn.commit()
      return { success: true, message: 'Discount updated successfully' }
    } catch (error) {
      await conn.rollback()
      throw this.handleError(error, 'update discount')
    } finally {
      conn.release()
    }
  }

  static async updateExpiredStatus() {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const [result] = await conn.query(
        `UPDATE discounts 
         SET is_active = FALSE 
         WHERE valid_until < UTC_TIMESTAMP() 
           AND is_active = TRUE`
      )

      await conn.commit()
      return result.affectedRows
    } catch (error) {
      await conn.rollback()
      throw this.handleError(error, 'update expired status')
    } finally {
      conn.release()
    }
  }
  static async search({ query = '', page = 1, limit = 10, status = 'all' }) {
    const conn = await db.getConnection()
    try {
      const offset = (page - 1) * limit

      let sql = `
      SELECT 
        d.*,
        COUNT(t.ticket_id) AS times_used
      FROM discounts d
      LEFT JOIN tickets t ON d.discount_id = t.discount_id
    `

      const conditions = []
      const params = []

      if (query) {
        conditions.push(`(d.code LIKE ? OR d.description LIKE ?)`)
        params.push(`%${query}%`, `%${query}%`)
      }

      if (status === 'active') {
        conditions.push(
          `d.is_active = TRUE AND d.valid_until > UTC_TIMESTAMP()`
        )
      } else if (status === 'expired') {
        conditions.push(
          `(d.is_active = FALSE OR d.valid_until <= UTC_TIMESTAMP())`
        )
      } else if (status === 'upcoming') {
        conditions.push(`d.valid_from > UTC_TIMESTAMP()`)
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`
      }

      sql += `
      GROUP BY d.discount_id
      ORDER BY d.valid_until DESC
      LIMIT ? OFFSET ?
    `
      params.push(limit, offset)

      const [discounts] = await conn.query(sql, params)

      let countSql = `SELECT COUNT(*) AS total FROM discounts d`
      if (conditions.length > 0) {
        countSql += ` WHERE ${conditions.join(' AND ')}`
      }
      const [[{ total }]] = await conn.query(countSql, params.slice(0, -2))

      return {
        data: discounts,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      }
    } catch (error) {
      throw this.handleError(error, 'search discounts')
    } finally {
      conn.release()
    }
  }
  static async findById(id, connection = db) {
    const conn = connection || db
    try {
      await conn.query(
        `UPDATE discounts 
         SET is_active = FALSE 
         WHERE discount_id = ? 
           AND valid_until < UTC_TIMESTAMP()`,
        [id]
      )

      const [rows] = await conn.query(
        `SELECT *, 
         (SELECT COUNT(*) FROM tickets WHERE discount_id = ?) AS times_used
         FROM discounts 
         WHERE discount_id = ?`,
        [id, id]
      )
      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'find discount by ID')
    }
  }

  static handleError(error, context) {
    console.error(`Discount Error (${context}):`, error.message)
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        return new Error('Discount code already exists')
      case 'ER_ROW_IS_REFERENCED_2':
        return new Error('Cannot modify discount with active tickets')
      case 'ER_DATA_TOO_LONG':
        return new Error('Data exceeds column length limit')
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Referenced discount not found')
      default:
        return error
    }
  }
}

schedule.scheduleJob('0 * * * *', async () => {
  try {
    const count = await Discount.updateExpiredStatus()
    console.log(`Deactivated ${count} expired discounts`)
  } catch (error) {
    console.error('Failed to update discount statuses:', error)
  }
})

module.exports = Discount
