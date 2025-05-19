const bcrypt = require('bcrypt')
const db = require('../config/db')
const logger = require('../config/logger')

class User {
  static validate(data) {
    const errors = []
    const requiredFields = ['username', 'email', 'password']

    requiredFields.forEach((field) => {
      if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
    })

    if (data.username && data.username.length > 50) {
      errors.push('Username must be ≤50 characters')
    }

    if (data.password && data.password.length < 8) {
      errors.push('Password must be ≥8 characters')
    }
    if (
      data.password &&
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(
        data.password
      )
    ) {
      errors.push(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      )
    }

    if (
      data.email &&
      !/^[\w.%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data.email)
    ) {
      errors.push('Invalid email format')
    }

    if (data.role && !['user', 'admin'].includes(data.role)) {
      errors.push('Invalid role')
    }

    if (errors.length > 0) {
      throw new Error(`User validation failed: ${errors.join(', ')}`)
    }
  }

  static async create(userData, connection = null) {
    this.validate(userData)
    const conn = connection || (await db.getConnection())

    try {
      await conn.beginTransaction()

      const [existing] = await conn.query(
        `SELECT user_id FROM users WHERE email = LOWER(?)`,
        [userData.email.toLowerCase()]
      )

      if (existing.length > 0) {
        throw new Error('Email already exists')
      }

      const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10
      const passwordHash = await bcrypt.hash(userData.password, saltRounds)

      const [result] = await conn.query(
        `INSERT INTO users SET
       username = ?,
       email = LOWER(?),
       password_hash = ?,
       role = ?,
       is_active = TRUE`,
        [
          userData.username,
          userData.email.toLowerCase(),
          passwordHash,
          userData.role || 'user',
        ]
      )

      await conn.commit()
      logger.info(`User created with ID: ${result.insertId}`)
      return result.insertId
    } catch (error) {
      if (conn) await conn.rollback()
      logger.error(`User creation failed: ${error.message}`)
      throw this.handleError(error, 'create user')
    } finally {
      if (!connection && conn) conn.release()
    }
  }

  static async update(userId, updates, conn = db) {
    try {
      const { username, password } = updates
      const updateFields = []

      if (username) updateFields.push(`username = ?`)
      if (password) updateFields.push(`password_hash = ?`)

      if (updateFields.length === 0) {
        throw new Error('No fields to update')
      }

      const query = `UPDATE users SET ${updateFields.join(', ')} WHERE user_id = ?`
      const values = []

      if (username) values.push(username)
      if (password) values.push(await bcrypt.hash(password, 10))

      values.push(userId)

      const [result] = await conn.query(query, values)
      if (result.affectedRows === 0) {
        throw new Error('User not found or no changes applied')
      }

      return { success: true, message: 'User updated successfully' }
    } catch (error) {
      console.error('Update error:', error.message)
      throw new Error('Failed to update user: ' + error.message)
    }
  }

  static async softDelete(id) {
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [user] = await conn.query(
        `SELECT is_active FROM users WHERE user_id = ?`,
        [id]
      )

      if (user.length === 0) {
        throw new Error('User not found')
      }

      const newStatus = !user[0].is_active

      const [result] = await conn.query(
        `UPDATE users SET is_active = ? WHERE user_id = ?`,
        [newStatus, id]
      )

      if (result.affectedRows === 0) {
        throw new Error('User not found')
      }

      await conn.commit()
      logger.info(
        `User status toggled to ${newStatus ? 'active' : 'inactive'} with ID: ${id}`
      )

      return { success: true, newStatus }
    } catch (error) {
      await conn.rollback()
      logger.error(`User status toggle failed: ${error.message}`)
      throw this.handleError(error, 'toggle user status')
    } finally {
      conn.release()
    }
  }

  static async hardDelete(id, connection = db) {
    const conn = connection || (await db.getConnection())

    try {
      await conn.beginTransaction()

      const [dependencies] = await conn.query(
        `SELECT COUNT(*) AS count FROM passengers
         WHERE user_id = ?`,
        [id]
      )

      if (dependencies[0].count > 0) {
        throw new Error('Cannot delete user with passenger records')
      }

      const [result] = await conn.query('DELETE FROM users WHERE user_id = ?', [
        id,
      ])

      if (result.affectedRows === 0) {
        throw new Error('User not found')
      }

      await conn.commit()
      logger.info(`User hard deleted with ID: ${id}`)
      return true
    } catch (error) {
      await conn.rollback()
      logger.error(`User hard delete failed: ${error.message}`)
      throw this.handleError(error, 'hard delete user')
    } finally {
      if (!connection) conn.release()
    }
  }

  static async findById(id, connection = db) {
    const conn = connection || (await db.getConnection())

    try {
      const [rows] = await conn.query(
        `SELECT *, 
          (SELECT COUNT(*) FROM passengers WHERE user_id = ?) AS passenger_count
         FROM users 
         WHERE user_id = ?`,
        [id, id]
      )
      return rows[0] || null
    } catch (error) {
      logger.error(`Error finding user by ID: ${error.message}`)
      throw this.handleError(error, 'find user by ID')
    } finally {
      if (!connection) conn.release()
    }
  }

  static async search(filters = {}, pagination = { page: 1, limit: 20 }) {
    const { query = '', role, activeOnly = true } = filters
    const { page, limit } = pagination
    const offset = (page - 1) * limit
    const params = []
    const where = []

    if (activeOnly) where.push('is_active = TRUE')
    if (role) {
      if (!['user', 'admin'].includes(role)) {
        throw new Error('Invalid role')
      }
      where.push('role = ?')
      params.push(role)
    }
    if (query) {
      where.push('(username LIKE ? OR email LIKE ?)')
      params.push(`%${query}%`, `%${query}%`)
    }

    try {
      const [count] = await db.query(
        `SELECT COUNT(*) AS total FROM users
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
        params
      )

      const [rows] = await db.query(
        `SELECT user_id, username, email, role, created_at 
         FROM users
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY created_at DESC
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
      logger.error(`User search failed: ${error.message}`)
      throw this.handleError(error, 'search users')
    }
  }

  static async verifyCredentials(email, password) {
    try {
      const user = await this.findByEmail(email)
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return null
      }
      return user
    } catch (error) {
      logger.error(`Credential verification failed: ${error.message}`)
      throw this.handleError(error, 'verify credentials')
    }
  }

  static async findByEmail(email) {
    try {
      const [rows] = await db.query(
        'SELECT * FROM users WHERE email = LOWER(?)',
        [email.toLowerCase()]
      )
      return rows[0] || null
    } catch (error) {
      logger.error(`Error finding user by email: ${error.message}`)
      throw new Error(`Error finding user by email: ${error.message}`)
    }
  }

  static handleError(error, context) {
    console.error(`User Error (${context}):`, error.message)
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        return new Error('Email already exists')
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Invalid user reference')
      case 'ER_DATA_TOO_LONG':
        return new Error('Data exceeds column limit')
      case 'ER_TRIGGER_DOES_NOT_EXIST':
        return new Error('Database configuration error')
      default:
        return error
    }
  }
}

module.exports = User
