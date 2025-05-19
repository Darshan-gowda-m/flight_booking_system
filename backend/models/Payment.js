const db = require('../config/db')
const { v4: uuidv4 } = require('uuid')
const logger = require('../config/logger')

class Payment {
  static validate(data) {
    const errors = []
    const validMethods = new Set([
      'credit_card',
      'debit_card',
      'upi',
      'net_banking',
      'wallet',
    ])

    if (!Array.isArray(data.ticketIds) || data.ticketIds.length === 0) {
      errors.push('At least one ticket ID required')
    }

    if (!data.method || !validMethods.has(data.method.toLowerCase())) {
      errors.push(
        `Invalid payment method. Valid methods: ${[...validMethods].join(', ')}`
      )
    }

    if (errors.length > 0) {
      throw new Error(`Payment validation failed: ${errors.join(', ')}`)
    }
  }

  static async process(paymentData, conn = db) {
    const connection = conn === db ? await db.getConnection() : conn
    try {
      await connection.beginTransaction()
      const { ticketIds, method } = paymentData
      const transactionId = uuidv4()

      const [tickets] = await connection.query(
        `SELECT t.*, s.price AS seat_price, s.is_booked,
                COALESCE(d.discount_percent, 0) AS discount
         FROM tickets t
         JOIN seats s ON t.seat_id = s.seat_id
         LEFT JOIN discounts d ON t.discount_id = d.discount_id
         WHERE t.ticket_id IN (?)
         FOR UPDATE`,
        [ticketIds]
      )

      if (tickets.length !== ticketIds.length) {
        throw new Error(
          `Missing tickets. Requested: ${ticketIds.length}, Found: ${tickets.length}`
        )
      }

      let totalAmount = 0
      const validTickets = []
      const invalidTickets = []

      for (const ticket of tickets) {
        if (ticket.status !== 'pending') {
          invalidTickets.push(
            `Ticket ${ticket.ticket_id} has invalid status: ${ticket.status}`
          )
          continue
        }
        if (ticket.is_booked) {
          invalidTickets.push(`Seat ${ticket.seat_id} already booked`)
          continue
        }

        const discountedPrice = ticket.seat_price * (1 - ticket.discount / 100)
        totalAmount += discountedPrice
        validTickets.push({
          id: ticket.ticket_id,
          seat_id: ticket.seat_id,
          price: discountedPrice,
        })
      }

      if (invalidTickets.length > 0) {
        throw new Error(invalidTickets.join(', '))
      }

      const [payment] = await connection.query(
        `INSERT INTO payments 
         (ticket_ids, amount, method, status, transaction_id)
         VALUES (?, ?, ?, 'success', ?)`,
        [
          ticketIds.join(','),
          totalAmount.toFixed(2),
          method.toLowerCase(),
          transactionId,
        ]
      )

      await connection.query(
        `UPDATE tickets SET status = 'confirmed'
         WHERE ticket_id IN (?)`,
        [validTickets.map((t) => t.id)]
      )

      await connection.query(
        `UPDATE seats SET is_booked = TRUE
         WHERE seat_id IN (?)`,
        [validTickets.map((t) => t.seat_id)]
      )

      await connection.commit()
      return {
        payment_id: payment.insertId,
        transaction_id: transactionId,
        amount: totalAmount,
        tickets: validTickets,
      }
    } catch (error) {
      await connection.rollback()
      logger.error(`Payment failed: ${error.message}`)
      throw error
    } finally {
      if (conn === db) connection.release()
    }
  }

  static async processSingleTicket(paymentData, conn = db) {
    const connection = conn === db ? await db.getConnection() : conn
    try {
      await connection.beginTransaction()
      const { ticketId, method } = paymentData

      const [tickets] = await connection.query(
        `SELECT t.*, s.price, s.is_booked,
                COALESCE(d.discount_percent, 0) AS discount
         FROM tickets t
         JOIN seats s ON t.seat_id = s.seat_id
         LEFT JOIN discounts d ON t.discount_id = d.discount_id
         WHERE t.ticket_id = ?
         FOR UPDATE`,
        [ticketId]
      )

      if (tickets.length !== 1) {
        throw new Error('Ticket not found')
      }

      const ticket = tickets[0]
      if (ticket.status.toLowerCase() !== 'pending') {
        throw new Error(`Invalid ticket status: ${ticket.status}`)
      }

      const finalPrice = ticket.price * (1 - ticket.discount / 100)
      const transactionId = uuidv4()

      const [payment] = await connection.query(
        `INSERT INTO payments 
         (ticket_id, amount, method, status, transaction_id)
         VALUES (?, ?, ?, 'success', ?)`,
        [ticketId, finalPrice.toFixed(2), method, transactionId]
      )

      await connection.query(
        `UPDATE tickets SET status = 'confirmed'
         WHERE ticket_id = ?`,
        [ticketId]
      )

      await connection.query(
        `UPDATE seats SET is_booked = TRUE
         WHERE seat_id = ?`,
        [ticket.seat_id]
      )

      await connection.commit()
      return {
        payment_id: payment.insertId,
        transaction_id: transactionId,
        amount: finalPrice,
        ticket_id: ticketId,
      }
    } catch (error) {
      await connection.rollback()
      logger.error(`Single ticket payment failed: ${error.message}`)
      throw error
    } finally {
      if (conn === db) connection.release()
    }
  }

  static async processDirect(paymentData, conn) {
    const [ticket] = await conn.query(
      'SELECT status, price FROM tickets WHERE ticket_id = ?',
      [paymentData.ticketId]
    )

    if (!ticket[0] || ticket[0].status !== 'Pending') {
      throw new Error('Payment only allowed for Pending tickets')
    }

    const [result] = await conn.query(
      `INSERT INTO payments SET
      ticket_id = ?,
      amount = ?,
      method = ?,
      status = 'Pending',
      transaction_id = ?`,
      [paymentData.ticketId, paymentData.amount, paymentData.method, uuidv4()]
    )

    const paymentStatus = Math.random() > 0.1 ? 'Success' : 'Failed'

    await conn.query('UPDATE payments SET status = ? WHERE payment_id = ?', [
      paymentStatus,
      result.insertId,
    ])

    if (paymentStatus !== 'Success') {
      throw new Error('Payment processing failed')
    }

    return {
      payment_id: result.insertId,
      ...paymentData,
      status: paymentStatus,
    }
  }

  static async findByTicketId(ticketId, conn = db) {
    try {
      const [rows] = await conn.query(
        `SELECT * FROM payments
       WHERE ticket_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
        [ticketId]
      )
      return rows[0] || null
    } catch (error) {
      logger.error(`Failed to find payment by ticket: ${error.message}`)
      throw error
    }
  }
  static async findById(id, conn = db) {
    try {
      const [rows] = await conn.query(
        `SELECT p.*, 
                GROUP_CONCAT(t.ticket_id) AS ticket_ids,
                MIN(f.flight_number) AS flight_number,
                MIN(f.departure_time) AS departure_time
         FROM payments p
         JOIN tickets t ON FIND_IN_SET(t.ticket_id, p.ticket_ids)
         JOIN flights f ON t.flight_id = f.flight_id
         WHERE p.payment_id = ?
         GROUP BY p.payment_id`,
        [id]
      )

      if (!rows.length) return null
      const payment = rows[0]

      return {
        ...payment,
        ticket_ids: payment.ticket_ids
          ? payment.ticket_ids.split(',').map(Number)
          : [],
      }
    } catch (error) {
      logger.error(`Failed to find payment ${id}: ${error.message}`)
      throw error
    }
  }

  static async search(filters = {}, pagination = { page: 1, limit: 20 }) {
    const { status, method, dateFrom, dateTo } = filters
    const { page, limit } = pagination
    const offset = (page - 1) * limit
    const where = []
    const params = []

    if (status) {
      where.push('p.status = ?')
      params.push(status.toLowerCase())
    }
    if (method) {
      where.push('p.method = ?')
      params.push(method.toLowerCase())
    }
    if (dateFrom) {
      where.push('p.created_at >= ?')
      params.push(dateFrom)
    }
    if (dateTo) {
      where.push('p.created_at <= ?')
      params.push(dateTo)
    }

    try {
      const [count] = await db.query(
        `SELECT COUNT(*) AS total
         FROM payments p
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
        params
      )

      const [rows] = await db.query(
        `SELECT p.*,
                GROUP_CONCAT(t.ticket_id) AS ticket_ids
         FROM payments p
         JOIN tickets t ON FIND_IN_SET(t.ticket_id, p.ticket_ids)
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         GROUP BY p.payment_id
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      )

      return {
        data: rows.map((row) => ({
          ...row,
          ticket_ids: row.ticket_ids
            ? row.ticket_ids.split(',').map(Number)
            : [],
        })),
        pagination: {
          total: count[0].total,
          page,
          limit,
          totalPages: Math.ceil(count[0].total / limit),
        },
      }
    } catch (error) {
      logger.error(`Payment search failed: ${error.message}`)
      throw error
    }
  }
}

module.exports = Payment
