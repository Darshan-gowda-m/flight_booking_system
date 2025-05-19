const db = require('../config/db')

class Review {
  static validate(data) {
    const errors = []
    const requiredFields = ['user_id', 'flight_id', 'rating']

    requiredFields.forEach((field) => {
      if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
    })

    if (data.rating) {
      if (!Number.isInteger(data.rating)) {
        errors.push('Rating must be an integer')
      }
      if (data.rating < 1 || data.rating > 5) {
        errors.push('Rating must be between 1-5')
      }
    }

    if (data.comment && data.comment.length > 500) {
      errors.push('Comment cannot exceed 500 characters')
    }

    if (errors.length > 0) {
      throw new Error(`Review validation failed: ${errors.join(', ')}`)
    }
  }

  static async create(reviewData, conn = db) {
    try {
      await conn.beginTransaction()

      // Check flight eligibility
      const [flight] = await conn.query(
        `SELECT status FROM flights WHERE flight_id = ?`,
        [reviewData.flight_id]
      )

      if (!flight.length || flight[0].status !== 'Arrived') {
        throw new Error('Flight has not arrived yet')
      }

      // Check ticket eligibility
      const [tickets] = await conn.query(
        `SELECT t.ticket_id 
       FROM tickets t
       JOIN passengers p ON t.passenger_id = p.passenger_id
       WHERE p.user_id = ?
         AND t.flight_id = ?
         AND t.status = 'Confirmed'`,
        [reviewData.user_id, reviewData.flight_id]
      )

      if (!tickets.length) {
        throw new Error('User not eligible to review this flight')
      }

      // Check for existing review
      const [existing] = await conn.query(
        'SELECT review_id FROM reviews WHERE user_id = ? AND flight_id = ?',
        [reviewData.user_id, reviewData.flight_id]
      )

      if (existing.length > 0) {
        // Update existing review instead of throwing error
        const [result] = await conn.query(
          `UPDATE reviews SET
         rating = ?,
         comment = ?,
         updated_at = NOW()
         WHERE review_id = ?`,
          [reviewData.rating, reviewData.comment || null, existing[0].review_id]
        )

        await conn.commit()
        return this.findById(existing[0].review_id, conn)
      }

      // Create new review
      const [result] = await conn.query(
        `INSERT INTO reviews SET
       user_id = ?,
       flight_id = ?,
       rating = ?,
       comment = ?`,
        [
          reviewData.user_id,
          reviewData.flight_id,
          reviewData.rating,
          reviewData.comment || null,
        ]
      )

      await conn.commit()
      return this.findById(result.insertId, conn)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }
  static async update(id, userId, updates) {
    this.validate(updates)
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [result] = await conn.query(
        `UPDATE reviews SET
          rating = ?,
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE review_id = ? AND user_id = ?`,
        [updates.rating, updates.comment || null, id, userId]
      )

      if (result.affectedRows === 0) {
        throw new Error('Review not found or unauthorized')
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
  static async findOne(conditions, conn = db) {
    try {
      const whereClauses = []
      const params = []

      // Build WHERE clause from conditions
      for (const [key, value] of Object.entries(conditions)) {
        if (value !== undefined && value !== null) {
          // Only add if value is defined
          whereClauses.push(`${key} = ?`)
          params.push(value)
        }
      }

      // If no valid conditions were provided
      if (whereClauses.length === 0) {
        throw new Error('No valid conditions provided for findOne')
      }

      const [rows] = await conn.query(
        `SELECT * FROM reviews WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
        params
      )

      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'findOne review')
    }
  }
  static async delete(id, conn = db) {
    const [result] = await db.query('DELETE FROM reviews WHERE review_id = ?', [
      id,
    ])

    if (result.affectedRows === 0) {
      throw new Error('Review not found')
    }

    return true
  }

  static async search({ userId, flightId, page = 1, limit = 10 }, conn = db) {
    const offset = (page - 1) * limit

    if (!conn || !conn.query) {
      throw new Error('Database connection is undefined')
    }

    // Base query parameters
    const queryParams = [userId]
    let whereClause = 'WHERE user_id = ?'

    // Add flightId filter if provided
    if (flightId) {
      whereClause += ' AND flight_id = ?'
      queryParams.push(flightId)
    }

    // Get paginated reviews
    const [rows] = await conn.query(
      `SELECT r.*, 
     f.flight_number,
     dep.code AS departure_code,
     arr.code AS arrival_code,
     a.name AS airline_name
     FROM reviews r
     JOIN flights f ON r.flight_id = f.flight_id
     JOIN airlines a ON f.airline_id = a.airline_id
     JOIN airports dep ON f.departure_airport = dep.airport_id
     JOIN airports arr ON f.arrival_airport = arr.airport_id
     ${whereClause}
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    )

    // Get total count
    const [countResult] = await conn.query(
      `SELECT COUNT(*) AS total FROM reviews ${whereClause}`,
      queryParams
    )

    return {
      data: rows,
      total: countResult[0].total,
      page,
      limit,
    }
  }
  static async findById(id, connection = db) {
    try {
      const [rows] = await connection.query(
        `SELECT r.*,
         u.username,
         f.flight_number,
         a.name AS airline_name,
         dep.code AS departure_airport,
         arr.code AS arrival_airport
       FROM reviews r
       JOIN users u ON r.user_id = u.user_id
       JOIN flights f ON r.flight_id = f.flight_id
       JOIN airlines a ON f.airline_id = a.airline_id
       JOIN airports dep ON f.departure_airport = dep.airport_id
       JOIN airports arr ON f.arrival_airport = arr.airport_id
       WHERE r.review_id = ?`,
        [id]
      )
      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'find review by ID')
    }
  }

  static async getFlightReviews(flightId, options = {}) {
    const { minRating = 1, maxRating = 5, page = 1, limit = 10 } = options
    const offset = (page - 1) * limit
    const params = [flightId]
    const where = ['r.flight_id = ?']

    if (minRating) {
      where.push('r.rating >= ?')
      params.push(minRating)
    }
    if (maxRating) {
      where.push('r.rating <= ?')
      params.push(maxRating)
    }

    try {
      const [count] = await db.query(
        `SELECT COUNT(*) AS total
         FROM reviews r
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
        params
      )

      const [rows] = await db.query(
        `SELECT r.*,
           u.username,
           p.first_name,
           p.last_name
         FROM reviews r
         JOIN users u ON r.user_id = u.user_id
         JOIN passengers p ON u.user_id = p.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY r.created_at DESC
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
      throw this.handleError(error, 'get flight reviews')
    }
  }

  static async getFlightStats(flightId) {
    try {
      const [rows] = await db.query(
        `SELECT 
           COUNT(*) AS total_reviews,
           AVG(rating) AS average_rating,
           SUM(rating = 1) AS one_star,
           SUM(rating = 2) AS two_star,
           SUM(rating = 3) AS three_star,
           SUM(rating = 4) AS four_star,
           SUM(rating = 5) AS five_star
         FROM reviews
         WHERE flight_id = ?`,
        [flightId]
      )

      const stats = rows[0]
      stats.average_rating = parseFloat(stats.average_rating || 0).toFixed(1)

      return stats
    } catch (error) {
      throw this.handleError(error, 'get flight stats')
    }
  }

  static handleError(error, context) {
    console.error(`Review Error (${context}):`, error.message)
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        return new Error('User already reviewed this flight')
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Invalid user or flight reference')
      case 'ER_DATA_TOO_LONG':
        return new Error('Data exceeds column limit')
      case 'ER_TRIGGER_DOES_NOT_EXIST':
        return new Error('Database configuration error')
      default:
        return error
    }
  }
}

module.exports = Review
