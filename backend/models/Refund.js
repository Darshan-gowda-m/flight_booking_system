const db = require('../config/db')
const logger = require('../config/logger')
const schedule = require('node-schedule')

class Refund {
  static validate(data) {
    const errors = []
    const requiredFields = ['ticket_id', 'amount', 'request_reason']

    requiredFields.forEach((field) => {
      if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
    })

    if (data.amount <= 0) errors.push('Amount must be positive')
    if (data.penalty && (data.penalty < 0.0 || data.penalty > 100.0)) {
      errors.push('Penalty must be between 0.00-100.00%')
    }

    if (errors.length > 0) {
      throw new Error(`Refund validation failed: ${errors.join(', ')}`)
    }
  }

  static async createRequest(refundData, conn = db) {
    this.validate(refundData)
    const connection = conn || (await db.getConnection())
    let shouldRelease = !conn

    try {
      if (!conn) await connection.beginTransaction()

      const [ticket] = await connection.query(
        `SELECT t.*, f.departure_time 
         FROM tickets t
         JOIN flights f ON t.flight_id = f.flight_id
         WHERE t.ticket_id = ? FOR UPDATE`,
        [refundData.ticket_id]
      )

      if (!ticket[0]) {
        throw new Error('Ticket not found')
      }

      if (ticket[0].status !== 'Confirmed') {
        throw new Error('Ticket is not in a refundable state')
      }

      const departureTime = new Date(ticket[0].departure_time)
      const currentTime = new Date()
      const timeDifference = departureTime.getTime() - currentTime.getTime()
      const hoursDifference = timeDifference / (1000 * 60 * 60)

      if (hoursDifference <= 12) {
        throw new Error(
          'Refund requests must be made at least 12 hours before departure'
        )
      }

      const [result] = await connection.query(
        `INSERT INTO refunds SET
        ticket_id = ?,
        amount = ?,
        request_reason = ?,
        penalty = ?,
        status = 'Pending'`,
        [
          refundData.ticket_id,
          refundData.amount,
          refundData.request_reason,
          refundData.penalty || 0.0,
        ]
      )

      await connection.query(
        `UPDATE tickets SET status = 'Refund Requested'
         WHERE ticket_id = ?`,
        [refundData.ticket_id]
      )

      const refund = await this.findById(result.insertId, connection)
      if (!conn) await connection.commit()

      logger.info('Refund request created', {
        refundId: refund.refund_id,
        ticketId: refund.ticket_id,
      })

      return refund
    } catch (error) {
      if (!conn) await connection.rollback()
      logger.error('Refund creation failed', { error: error.message })
      throw this.handleError(error, 'create refund request')
    } finally {
      if (shouldRelease && connection) connection.release()
    }
  }

  static async process(refundId, decision, adminId = null) {
    const validStatuses = ['Approved', 'Rejected']
    const status = decision.status?.trim()
    const conn = await db.getConnection()

    try {
      await conn.beginTransaction()

      const [refundCheck] = await conn.query(
        `SELECT * FROM refunds WHERE refund_id = ? FOR UPDATE`,
        [refundId]
      )

      if (!refundCheck[0]) throw new Error('Refund request not found')

      const [refundData] = await conn.query(
        `SELECT r.*, 
          t.flight_id,
          t.seat_id,
          t.price AS ticket_price,
          t.status AS ticket_status,
          p.payment_id,
          f.departure_time
         FROM refunds r
         JOIN tickets t ON r.ticket_id = t.ticket_id
         LEFT JOIN payments p ON t.ticket_id = p.ticket_id
         JOIN flights f ON t.flight_id = f.flight_id
         WHERE r.refund_id = ?`,
        [refundId]
      )

      const refund = refundData[0]

      if (refund.status !== 'Pending') {
        throw new Error('Refund already processed')
      }

      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`)
      }

      await conn.query(
        `UPDATE refunds SET
          status = ?,
          admin_comment = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE refund_id = ?`,
        [status, decision.admin_comment?.trim() || null, refundId]
      )

      if (status === 'Approved') {
        if (refund.ticket_status !== 'Refund Requested') {
          throw new Error('Ticket not in refundable state')
        }

        if (new Date(refund.departure_time) < new Date()) {
          throw new Error('Cannot refund ticket for a flight that has departed')
        }

        const refundAmount = refund.ticket_price * (1 - refund.penalty / 100)

        await conn.query(
          `UPDATE seats SET is_booked = FALSE WHERE seat_id = ?`,
          [refund.seat_id]
        )

        await conn.query(
          `UPDATE flights 
           SET available_seats = available_seats + 1 
           WHERE flight_id = ?`,
          [refund.flight_id]
        )

        await conn.query(
          `UPDATE tickets SET status = 'Cancelled' WHERE ticket_id = ?`,
          [refund.ticket_id]
        )

        if (refund.payment_id) {
          await conn.query(
            `UPDATE payments SET status = 'Refunded' WHERE payment_id = ?`,
            [refund.payment_id]
          )
        }

        logger.info(`Processed refund ${refundId}`, {
          amount: refundAmount.toFixed(2),
          ticketId: refund.ticket_id,
          penalty: refund.penalty,
        })
      } else if (status === 'Rejected') {
        await conn.query(
          `UPDATE tickets SET status = 'Cancelled' WHERE ticket_id = ?`,
          [refund.ticket_id]
        )
      }

      await conn.commit()
      return this.findById(refundId, conn)
    } catch (error) {
      await conn.rollback()
      logger.error(`Refund processing failed: ${error.message}`, { refundId })
      throw error
    } finally {
      conn.release()
    }
  }

  static async processAutoApprovals() {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const [pendingRefunds] = await conn.query(
        `SELECT r.*, t.flight_id, t.seat_id, t.price AS ticket_price, 
         t.status AS ticket_status, p.payment_id, f.departure_time
         FROM refunds r
         JOIN tickets t ON r.ticket_id = t.ticket_id
         LEFT JOIN payments p ON t.ticket_id = p.ticket_id
         JOIN flights f ON t.flight_id = f.flight_id
         WHERE r.status = 'Pending' 
         AND r.created_at < DATE_SUB(NOW(), INTERVAL 12 HOUR)
         FOR UPDATE`
      )

      for (const refund of pendingRefunds) {
        try {
          // if (new Date(refund.departure_time) < new Date()) {
          //   logger.warn(
          //     `Skipping auto-approval for ticket ${refund.ticket_id} - flight has departed`
          //   )
          //   continue
          // }

          await conn.query(
            `UPDATE refunds SET
              status = 'Approved',
              admin_comment = 'Automatically approved after 24 hours',
              updated_at = CURRENT_TIMESTAMP
             WHERE refund_id = ?`,
            [refund.refund_id]
          )

          if (refund.ticket_status !== 'Refund Requested') {
            logger.warn(
              `Skipping auto-approval for ticket ${refund.ticket_id} - invalid state`
            )
            continue
          }

          const refundAmount = refund.ticket_price * (1 - refund.penalty / 100)

          await conn.query(
            `UPDATE seats SET is_booked = FALSE WHERE seat_id = ?`,
            [refund.seat_id]
          )

          await conn.query(
            `UPDATE flights 
             SET available_seats = available_seats + 1 
             WHERE flight_id = ?`,
            [refund.flight_id]
          )

          await conn.query(
            `UPDATE tickets SET status = 'Cancelled' WHERE ticket_id = ?`,
            [refund.ticket_id]
          )

          if (refund.payment_id) {
            await conn.query(
              `UPDATE payments SET status = 'Refunded' WHERE payment_id = ?`,
              [refund.payment_id]
            )
          }

          logger.info(`Auto-approved refund ${refund.refund_id}`, {
            amount: refundAmount.toFixed(2),
            ticketId: refund.ticket_id,
            penalty: refund.penalty,
          })
        } catch (error) {
          logger.error(`Failed to auto-approve refund ${refund.refund_id}`, {
            error: error.message,
          })
        }
      }

      await conn.commit()
      return pendingRefunds.length
    } catch (error) {
      await conn.rollback()
      logger.error(`Auto-approval process failed: ${error.message}`)
      throw error
    } finally {
      conn.release()
    }
  }
  static async search(filters = {}) {
    const { status, passengerId, flightId, dateFrom, dateTo } = filters
    const params = []
    const where = []

    if (status) {
      where.push('r.status = ?')
      params.push(status)
    }
    if (passengerId) {
      where.push('p.passenger_id = ?')
      params.push(passengerId)
    }
    if (flightId) {
      where.push('f.flight_id = ?')
      params.push(flightId)
    }
    if (dateFrom) {
      where.push('r.created_at >= ?')
      params.push(dateFrom)
    }
    if (dateTo) {
      where.push('r.created_at <= ?')
      params.push(dateTo)
    }

    try {
      const [rows] = await db.query(
        `SELECT r.*,
           t.flight_id,
           f.flight_number,
           p.passenger_id,
           CONCAT(p.first_name, ' ', p.last_name) AS passenger_name
         FROM refunds r
         JOIN tickets t ON r.ticket_id = t.ticket_id
         JOIN passengers p ON t.passenger_id = p.passenger_id
         JOIN flights f ON t.flight_id = f.flight_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY r.created_at DESC`,
        params
      )

      return {
        data: rows,
      }
    } catch (error) {
      throw this.handleError(error, 'search refunds')
    }
  }

  static async findById(id, connection = db) {
    const conn = connection || (await db.getConnection())
    let shouldRelease = !connection

    try {
      const [rows] = await conn.query(
        `SELECT r.*,
          t.flight_id,
          t.price AS ticket_price,
          f.flight_number,
          f.departure_time,
          p.passenger_id,
          CONCAT(p.first_name, ' ', p.last_name) AS passenger_name
         FROM refunds r
         JOIN tickets t ON r.ticket_id = t.ticket_id
         JOIN passengers p ON t.passenger_id = p.passenger_id
         JOIN flights f ON t.flight_id = f.flight_id
         WHERE r.refund_id = ?`,
        [id]
      )
      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'find refund by ID')
    } finally {
      if (shouldRelease) conn.release()
    }
  }

  static async findByTicketId(ticketId, conn = db) {
    const connection = conn || (await db.getConnection())
    let shouldRelease = !conn

    try {
      const [rows] = await connection.query(
        `SELECT r.*,
          t.flight_id,
          t.price AS ticket_price,
          f.flight_number,
          f.departure_time,
          p.passenger_id,
          CONCAT(p.first_name, ' ', p.last_name) AS passenger_name
         FROM refunds r
         JOIN tickets t ON r.ticket_id = t.ticket_id
         JOIN passengers p ON t.passenger_id = p.passenger_id
         JOIN flights f ON t.flight_id = f.flight_id
         WHERE r.ticket_id = ?
         ORDER BY r.created_at DESC
         LIMIT 1`,
        [ticketId]
      )
      return rows[0] || null
    } catch (error) {
      throw this.handleError(error, 'find refund by ticket ID')
    } finally {
      if (shouldRelease) connection.release()
    }
  }

  static async findAllPending(connection = db) {
    const conn = connection || (await db.getConnection())
    let shouldRelease = !connection

    try {
      const [rows] = await conn.query(
        `SELECT r.*,
          t.flight_id,
          t.price AS ticket_price,
          f.flight_number,
          f.departure_time,
          p.passenger_id,
          CONCAT(p.first_name, ' ', p.last_name) AS passenger_name
         FROM refunds r
         JOIN tickets t ON r.ticket_id = t.ticket_id
         JOIN passengers p ON t.passenger_id = p.passenger_id
         JOIN flights f ON t.flight_id = f.flight_id
         WHERE r.status = 'Pending'
         ORDER BY r.created_at ASC`
      )
      return rows
    } catch (error) {
      throw this.handleError(error, 'find all pending refunds')
    } finally {
      if (shouldRelease) conn.release()
    }
  }

  static handleError(error, context) {
    logger.error(`Refund Error (${context}): ${error.message}`)
    switch (error.code) {
      case 'ER_NO_REFERENCED_ROW_2':
        return new Error('Invalid ticket reference')
      case 'ER_DUP_ENTRY':
        return new Error('Duplicate refund request')
      case 'ER_ROW_IS_REFERENCED_2':
        return new Error('Cannot process refund - referenced data exists')
      default:
        return error
    }
  }
}

schedule.scheduleJob('*/5 * * * *', async () => {
  try {
    const processed = await Refund.processAutoApprovals()
    if (processed > 0) {
      logger.info(`Auto-processed ${processed} refund requests`)
    }
  } catch (error) {
    logger.error('Error in refund auto-approval cron job', {
      error: error.message,
    })
  }
})

module.exports = Refund
