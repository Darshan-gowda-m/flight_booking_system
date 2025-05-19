const express = require('express')
const router = express.Router()
const userController = require('../controllers/userController')

const pool = require('../config/db')

const { authMiddleware } = require('../middleware/authMiddleware')

// ---------------------------
// USER PROFILE MANAGEMENT
// ---------------------------

router.get('/profile', authMiddleware, userController.getProfile)

router.get('/discounts', authMiddleware, userController.getAvailableDiscounts)
router.get(
  'discounts/validate/:id',
  authMiddleware,
  userController.validateDiscount
)

router.post('/seats/prices', authMiddleware, userController.getSeatPrices)
router.get('/', authMiddleware, userController.getActiveDiscounts)

router.put('/profile', authMiddleware, userController.updateProfile)

router.post('/logout', authMiddleware, userController.logout)

// ---------------------------
// FLIGHT SEARCH & BOOKING
// ---------------------------

router.get('/flights', authMiddleware, userController.searchFlights)

router.get('/flights/:id', authMiddleware, userController.getFlightDetails)

router.get(
  '/flights/:id/reviews',
  authMiddleware,
  userController.getFlightReviews
)

router.post('/flights/:id/book', authMiddleware, userController.bookTickets)

// ---------------------------
// PAYMENT PROCESSING
// ---------------------------

router.post('/payments/process', authMiddleware, userController.processPayment)

router.get('/tickets/:id/validate-retry', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.user_id

    // Check if ticket exists and is eligible for retry
    const [tickets] = await pool.query(
      `
      SELECT t.* FROM tickets t
      JOIN passengers p ON t.passenger_id = p.passenger_id
      WHERE t.ticket_id = ? AND p.user_id = ? AND t.status = 'Pending'
    `,
      [id, userId]
    )

    if (tickets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Ticket not found or not eligible for retry',
      })
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
})

router.post('/payments/retry', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const { ticketId, paymentMethod, paymentDetails } = req.body
    const userId = req.user.user_id

    // Verify ticket ownership and status
    const [tickets] = await conn.query(
      `
      SELECT t.* FROM tickets t
      JOIN passengers p ON t.passenger_id = p.passenger_id
      WHERE t.ticket_id = ? AND p.user_id = ? AND t.status = 'Pending'
    `,
      [ticketId, userId]
    )

    if (tickets.length === 0) {
      throw new Error('Ticket not eligible for payment retry')
    }

    const ticket = tickets[0]

    // Process payment (implement your payment gateway integration here)
    const paymentResult = await processPayment({
      amount: ticket.price,
      method: paymentMethod,
      details: paymentDetails,
      reference: `RETRY-${ticket.payment_id}`,
    })

    if (!paymentResult.success) {
      throw new Error(paymentResult.message || 'Payment failed')
    }

    await conn.query(
      `UPDATE tickets SET status = 'Confirmed' WHERE ticket_id = ?`,
      [ticketId]
    )

    await conn.query(
      `INSERT INTO payments (ticket_id, amount, method, transaction_id, status)
       VALUES (?, ?, ?, ?, 'completed')`,
      [ticketId, ticket.price, paymentMethod, paymentResult.transactionId]
    )

    await conn.commit()

    res.json({
      success: true,
      message: 'Payment retry successful',
      ticketId,
      newStatus: 'Confirmed',
    })
  } catch (error) {
    await conn.rollback()
    res.status(400).json({
      success: false,
      message: error.message,
    })
  } finally {
    conn.release()
  }
})

// ---------------------------
// TICKET MANAGEMENT
// ---------------------------

router.get('/tickets', authMiddleware, userController.getTickets)

router.get('/tickets/stats', authMiddleware, userController.getTicketStats)

router.get('/tickets/:id', authMiddleware, userController.getTicketDetails)

router.delete('/tickets/:id', authMiddleware, userController.cancelTicket)

router.get('/tickets/:id/print', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const ticketId = req.params.id
    const userId = req.user.user_id

    const [tickets] = await conn.query(
      `
      SELECT 
        t.ticket_id, 
        t.seat_id, 
        t.price, 
        t.status AS ticket_status,
        s.seat_number,
        s.class,
        p.first_name, 
        p.last_name, 
        f.flight_number, 
        f.departure_time, 
        f.arrival_time,
        da.code AS departure_code,
        aa.code AS arrival_code,
        al.name AS airline_name,
        py.amount AS payment_amount,
        py.status AS payment_status
      FROM tickets t
      JOIN passengers p ON t.passenger_id = p.passenger_id
      JOIN flights f ON t.flight_id = f.flight_id
      JOIN airlines al ON f.airline_id = al.airline_id
      JOIN airports da ON f.departure_airport = da.airport_id
      JOIN airports aa ON f.arrival_airport = aa.airport_id
      JOIN seats s ON t.seat_id = s.seat_id
      LEFT JOIN payments py ON t.ticket_id = py.ticket_id
      WHERE t.ticket_id = ? AND p.user_id = ?
      `,
      [ticketId, userId]
    )

    if (tickets.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' })
    }

    const ticket = tickets[0]

    res.json({
      ticket_id: ticket.ticket_id,
      flight_number: ticket.flight_number,
      departure_time: ticket.departure_time,
      arrival_time: ticket.arrival_time,
      seat_number: ticket.seat_number,
      class: ticket.class,
      departure_code: ticket.departure_code,
      arrival_code: ticket.arrival_code,
      airline_name: ticket.airline_name,
      price: ticket.price,
      status: ticket.ticket_status,
      payment_status: ticket.payment_status,
      passenger: {
        first_name: ticket.first_name,
        last_name: ticket.last_name,
      },
    })
  } catch (error) {
    console.error('Print ticket error:', error)
    res.status(500).json({ error: error.message })
  } finally {
    conn.release()
  }
})

router.put(
  '/tickets/:id/passenger',
  authMiddleware,
  userController.updatePassengerDetails
)

router.post('/tickets/:id/refund', authMiddleware, userController.requestRefund)

// ---------------------------
// REVIEW MANAGEMENT
// ---------------------------

router.post('/reviews', authMiddleware, userController.submitReview)
router.get('/review/:id', authMiddleware, userController.getReview)

router.get('/reviews', authMiddleware, userController.getReviews)

router.put('/reviews/:id', authMiddleware, userController.updateReview)

router.delete('/reviews/:id', authMiddleware, userController.deleteReview)

// ---------------------------
// PASSENGER MANAGEMENT
// ---------------------------

router.get('/passengers', authMiddleware, userController.getPassengers)

// ---------------------------
// CONFIGURATION
// ---------------------------

router.get('/config', authMiddleware, userController.getConfig)

module.exports = router
