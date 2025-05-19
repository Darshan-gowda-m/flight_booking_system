const {
  Airline,
  Airport,
  Pricing,
  User,
  Flight,
  Seat,
  Ticket,
  Passenger,
  Payment,
  Refund,
  Review,
  Discount,
  db,
} = require('../models')
const pool = require('../config/db')
const bcrypt = require('bcrypt')
const logger = require('../config/logger')
const PDFDocument = require('pdfkit')
const bwipjs = require('bwip-js')
const path = require('path')

class UserController {
  constructor() {
    this.generateBarcode = this.generateBarcode.bind(this)
    this.printTicket = this.printTicket.bind(this)
  }

  // ---------------------------
  // USER PROFILE MANAGEMENT
  // ---------------------------

  async getProfile(req, res) {
    try {
      console.log(`[PROFILE] GET initiated for user ID: ${req.user.user_id}`)
      const user = await User.findById(req.user.user_id)
      console.log(`[PROFILE] Database response: ${JSON.stringify(user)}`)

      if (!user) {
        console.warn(`[PROFILE] User ${req.user.user_id} not found`)
        return res.status(404).json({ success: false, error: 'User not found' })
      }

      console.log(`[PROFILE] Retrieved user data for ${user.email}`)
      res.json({
        success: true,
        user: {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          created_at: user.created_at,
        },
      })
    } catch (error) {
      console.error(`[PROFILE ERROR] ${error.message}\n${error.stack}`)
      res.status(500).json({ success: false, error: 'Failed to fetch profile' })
    }
  }

  async getAvailableDiscounts(req, res) {
    try {
      const [discounts] = await pool.query(`
        SELECT 
          discount_id, 
          code, 
          description,
          discount_percent,
          max_uses,
          valid_from,
          valid_until,
          is_active
        FROM discounts 
        WHERE is_active = TRUE 
        AND valid_from <= NOW() 
        AND valid_until >= NOW()
        ORDER BY discount_percent DESC
      `)

      res.setHeader('Cache-Control', 'no-cache')
      res.json({
        success: true,
        discounts: discounts || [],
      })
    } catch (error) {
      console.error('[DISCOUNTS ERROR]', error)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch discounts',
      })
    }
  }

  async validateDiscount(req, res) {
    const { id } = req.params
    const startTime = Date.now()
    const requestId = req.headers['x-request-id'] || crypto.randomUUID()

    try {
      // Validate ID is a positive integer
      if (!Number.isInteger(Number(id)) || id <= 0) {
        logger.warn(`Invalid discount ID format`, { requestId, id })
        return res.status(400).send(`
                <div class="discount-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Invalid Discount ID</h3>
                    <p>Discount ID must be a positive number</p>
                </div>
            `)
      }

      const [discounts] = await pool.query(
        `SELECT 
                discount_id,
                code,
                description,
                discount_percent,
                max_uses,
                (SELECT COUNT(*) FROM discount_redemptions WHERE discount_id = ?) AS uses_count,
                valid_from,
                valid_until,
                is_active
             FROM discounts 
             WHERE discount_id = ? 
             LIMIT 1`,
        [id, id] // Same ID for both subquery and main query
      )

      if (!discounts?.length) {
        logger.warn(`Discount ID not found`, { requestId, id })
        return res.status(404).send(`
                <div class="discount-error">
                    <i class="fas fa-search"></i>
                    <h3>Discount Not Found</h3>
                    <p>No discount exists with ID: ${id}</p>
                </div>
            `)
      }

      const discount = discounts[0]
      const currentTime = new Date()

      // ... (rest of validation logic remains the same as previous examples)
      // Return HTML responses as shown in earlier examples
    } catch (error) {
      logger.error(`Discount validation failed`, { requestId, error })
      return res.status(500).send(`
            <div class="discount-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Server Error</h3>
                <p>Failed to validate discount</p>
            </div>
        `)
    }
  }
  async getActiveDiscounts(req, res) {
    try {
      logger.info('Fetching active discounts')

      const [discounts] = await pool.query(`
        SELECT 
          discount_id as id,
          code,
          description,
          discount_percent as percent,
          max_uses,
          uses_count,
          valid_from,
          valid_until,
          is_active
        FROM discounts 
        WHERE is_active = TRUE 
        AND valid_from <= NOW() 
        AND valid_until >= NOW()
        ORDER BY discount_percent DESC
      `)

      res.json({
        success: true,
        discounts: discounts || [],
      })
    } catch (error) {
      logger.error(
        `Failed to fetch discounts: ${error.message}\n${error.stack}`
      )
      res.status(500).json({
        success: false,
        error: 'Failed to fetch discounts',
      })
    }
  }

  async updateProfile(req, res) {
    const conn = await pool.getConnection()
    try {
      console.log(
        `[PROFILE UPDATE] Starting transaction for user ${req.user.user_id}`
      )
      await conn.beginTransaction()

      console.log('Received update data:', JSON.stringify(req.body))
      const { username, currentPassword, newPassword } = req.body
      const updates = {}

      if (username) {
        console.log(`Updating username to: ${username}`)
        updates.username = username
      }

      if (newPassword) {
        console.log('[PASSWORD UPDATE] Initiating password change')
        const user = await User.findById(req.user.user_id, conn)

        console.log('[PASSWORD] Comparing password hashes')
        const isMatch = await bcrypt.compare(
          currentPassword,
          user.password_hash
        )
        if (!isMatch) {
          console.warn('[PASSWORD] Current password mismatch')
          throw new Error('Current password is incorrect')
        }

        console.log('[PASSWORD] Generating new hash')
        const salt = await bcrypt.genSalt(10)
        updates.password_hash = await bcrypt.hash(newPassword, salt)
      }

      console.log('Final update payload:', JSON.stringify(updates))
      const [result] = await conn.query(
        'UPDATE users SET ? WHERE user_id = ?',
        [updates, req.user.user_id]
      )
      console.log(`Database update result: ${JSON.stringify(result)}`)

      if (result.affectedRows === 0) {
        console.warn('[PROFILE] No rows affected in update')
        throw new Error('No changes made to profile')
      }

      await conn.commit()
      console.log('[PROFILE] Transaction committed successfully')

      const updatedUser = await User.findById(req.user.user_id)
      console.log('Updated user record:', JSON.stringify(updatedUser))

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          user_id: updatedUser.user_id,
          username: updatedUser.username,
          email: updatedUser.email,
          created_at: updatedUser.created_at,
        },
      })
    } catch (error) {
      console.error(`[PROFILE UPDATE ERROR] ${error.message}\n${error.stack}`)
      await conn.rollback()
      res.status(400).json({ success: false, error: error.message })
    } finally {
      conn.release()
      console.log('[PROFILE] Database connection released')
    }
  }

  async logout(req, res) {
    try {
      console.log(`[LOGOUT] User ${req.user.user_id} logging out`)
      res.json({ success: true, message: 'Logged out successfully' })
    } catch (error) {
      console.error(`[LOGOUT ERROR] ${error.message}\n${error.stack}`)
      res.status(500).json({ success: false, error: 'Failed to log out' })
    }
  }

  // ---------------------------
  // FLIGHT SEARCH & BOOKING
  // ---------------------------

  async searchFlights(req, res) {
    try {
      console.log('[FLIGHT SEARCH] New search request')
      const { origin, destination, date, page = 1, limit = 10 } = req.query
      console.log(`Search parameters: ${JSON.stringify(req.query)}`)

      const result = await Flight.search({
        origin,
        destination,
        date,
        page: parseInt(page),
        limit: parseInt(limit),
        statuses: ['Scheduled', 'Delayed'], // Changed parameter name to 'statuses' for clarity
      })

      console.log(
        `Found ${result.total} flights, returning ${result.data.length}`
      )
      res.json({
        success: true,
        data: result.data.map((f) => ({
          flight_id: f.flight_id,
          flight_number: f.flight_number,
          origin: f.origin,
          destination: f.destination,
          departure_time: f.departure_time,
          arrival_time: f.arrival_time,
          base_price: f.base_price,
          available_seats: f.available_seats,
          status: f.status,
          ...(f.status === 'Delayed' && {
            previous_departure: f.previous_departure,
          }),
        })),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      })
    } catch (error) {
      console.error(`[FLIGHT SEARCH ERROR] ${error.message}\n${error.stack}`)
      res
        .status(500)
        .json({ success: false, error: 'Failed to search flights' })
    }
  }

  async getFlightDetails(req, res) {
    try {
      const flightId = req.params.id
      console.log(`[FLIGHT DETAILS] Request for flight ${flightId}`)

      const flight = await Flight.findById(flightId)
      console.log(`Flight data: ${JSON.stringify(flight)}`)

      if (!flight) {
        console.warn(`Flight ${flightId} not found`)
        return res
          .status(404)
          .json({ success: false, error: 'Flight not found' })
      }

      const seats = await Seat.getAvailable(flightId)
      console.log(`Found ${seats.data.length} available seats`)

      res.json({
        success: true,
        flight: {
          ...flight,
          seats: seats.data.map((s) => ({
            seat_id: s.seat_id,
            seat_number: s.seat_number,
            class: s.class,
            price: s.price,
            is_booked: s.is_booked,
          })),
        },
      })
    } catch (error) {
      console.error(`[FLIGHT DETAILS ERROR] ${error.message}\n${error.stack}`)
      res
        .status(500)
        .json({ success: false, error: 'Failed to get flight details' })
    }
  }

  async getFlightReviews(req, res) {
    try {
      const flightId = req.params.id
      console.log(`[FLIGHT REVIEWS] Request for flight ${flightId}`)
      const { page = 1, limit = 10, minRating, maxRating } = req.query

      const reviews = await Review.getFlightReviews(flightId, {
        page: parseInt(page),
        limit: parseInt(limit),
        minRating: minRating ? parseInt(minRating) : undefined,
        maxRating: maxRating ? parseInt(maxRating) : undefined,
      })

      console.log(`Found ${reviews.total} reviews`)
      res.json(reviews)
    } catch (error) {
      console.error(`[FLIGHT REVIEWS ERROR] ${error.message}\n${error.stack}`)
      res
        .status(500)
        .json({ success: false, error: 'Failed to get flight reviews' })
    }
  }

  // ---------------------------
  // PAYMENT PROCESSING and TICKET
  // ---------------------------

  async bookTickets(req, res) {
    const conn = await pool.getConnection()
    try {
      console.log('[BOOKING] Starting transaction for user:', req.user.user_id)
      await conn.beginTransaction()

      const { passengers, seatIds } = req.body
      console.log('Received booking request:', { passengers, seatIds })

      // ========== VALIDATION SECTION ==========
      // Validate input structure
      if (!Array.isArray(passengers) || !Array.isArray(seatIds)) {
        throw new Error('Passengers and seatIds must be arrays')
      }

      if (passengers.length !== seatIds.length) {
        throw new Error('Number of passengers must match number of seats')
      }

      if (passengers.length === 0) {
        throw new Error('At least one passenger and seat required')
      }

      // Validate passenger data
      const requiredPassengerFields = [
        'first_name',
        'last_name',
        'email',
        'passport_number',
        'date_of_birth',
      ]
      const invalidPassengers = passengers.filter((p) => {
        return (
          !requiredPassengerFields.every((field) => p[field]) ||
          !/^\S+@\S+\.\S+$/.test(p.email) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(p.date_of_birth)
        )
      })

      if (invalidPassengers.length > 0) {
        throw new Error(
          'All passengers must have valid first_name, last_name, email, passport_number, and date_of_birth (YYYY-MM-DD)'
        )
      }

      // Validate seat IDs
      if (seatIds.some((id) => isNaN(id) || id <= 0)) {
        throw new Error('All seat IDs must be positive numbers')
      }

      // ========== SEAT AVAILABILITY CHECK ==========
      const [seats] = await conn.query(
        `SELECT s.seat_id, s.flight_id, s.class, s.price, f.departure_time
         FROM seats s
         JOIN flights f ON s.flight_id = f.flight_id
         WHERE s.seat_id IN (?)
         AND s.is_booked = FALSE
         AND f.departure_time > DATE_ADD(NOW(), INTERVAL 2 HOUR)
         FOR UPDATE`,
        [seatIds]
      )

      if (seats.length !== seatIds.length) {
        const bookedSeats = seatIds.filter(
          (id) => !seats.some((s) => s.seat_id === id)
        )
        throw new Error(
          bookedSeats.length > 0
            ? `Seats already booked or flight departing soon: ${bookedSeats.join(', ')}`
            : 'Some seats not found'
        )
      }

      // Verify all seats belong to the same flight
      const uniqueFlightIds = [...new Set(seats.map((s) => s.flight_id))]
      if (uniqueFlightIds.length > 1) {
        throw new Error('All seats must be from the same flight')
      }

      // ========== PASSENGER CREATION ==========
      const passengerIds = []
      for (const passenger of passengers) {
        try {
          // Removed check for existing passengers
          const [result] = await conn.query(
            `INSERT INTO passengers 
             (user_id, first_name, last_name, email, passport_number, date_of_birth) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              req.user.user_id,
              passenger.first_name,
              passenger.last_name,
              passenger.email,
              passenger.passport_number,
              passenger.date_of_birth,
            ]
          )
          passengerIds.push(result.insertId)
        } catch (err) {
          throw new Error(
            `Failed to create passenger ${passenger.first_name} ${passenger.last_name}: ${err.message}`
          )
        }
      }

      // ========== TICKET CREATION ==========
      const tickets = []
      const now = new Date()
      const expiryTime = new Date(now.getTime() + 15 * 60000) // 15 minutes from now

      for (let i = 0; i < seats.length; i++) {
        const [result] = await conn.query(
          `INSERT INTO tickets 
           (passenger_id, seat_id, flight_id, status, price, created_at) 
           VALUES (?, ?, ?, 'Pending', ?, ?)`,
          [
            passengerIds[i],
            seats[i].seat_id,
            seats[i].flight_id,
            seats[i].price,
            now,
            expiryTime,
          ]
        )
        tickets.push({
          ticket_id: result.insertId,
          seat_id: seats[i].seat_id,
          flight_id: seats[i].flight_id,
          price: seats[i].price,
          class: seats[i].class,
        })
      }

      // ========== SEAT RESERVATION ==========
      await conn.query(
        `UPDATE seats 
         SET is_booked = TRUE,
             created_at = NOW()
         WHERE seat_id IN (?)`,
        [seatIds]
      )

      // ========== FLIGHT SEAT COUNT UPDATE ==========
      await conn.query(
        `UPDATE flights 
         SET available_seats = available_seats - ? 
         WHERE flight_id = ?`,
        [seats.length, uniqueFlightIds[0]]
      )

      await conn.commit()
      console.log('[BOOKING] Transaction committed successfully')

      res.json({
        success: true,
        tickets,
        message: 'Tickets reserved. Proceed to payment within 15 minutes.',
        expires_at: expiryTime.toISOString(),
      })
    } catch (error) {
      await conn.rollback()
      console.error('[BOOKING ERROR]', error.message)

      res.status(400).json({
        success: false,
        error: error.message,
        code: 'BOOKING_ERROR',
      })
    } finally {
      conn.release()
      console.log('[BOOKING] Connection released')
    }
  }
  async processPayment(req, res) {
    const conn = await pool.getConnection()
    try {
      console.log('[PAYMENT] Starting payment transaction')
      await conn.beginTransaction()

      // Destructure with default values
      const {
        ticketIds = [],
        method: paymentMethod = 'Credit', // Default to Credit if not provided
        discountCode,
      } = req.body

      console.log(
        `Processing payment for ${ticketIds.length} tickets with method: ${paymentMethod}`
      )

      // Validate payment method exists
      if (!paymentMethod) {
        throw new Error('Payment method is required')
      }

      const paymentResults = []
      const failedTickets = []

      for (const ticketId of ticketIds) {
        try {
          console.log(`Processing ticket ${ticketId}`)
          const [ticket] = await conn.query(
            'SELECT * FROM tickets WHERE ticket_id = ? FOR UPDATE',
            [ticketId]
          )

          if (!ticket || ticket.length === 0) {
            console.warn(`Ticket ${ticketId} not found`)
            failedTickets.push({ ticketId, error: 'Ticket not found' })
            continue
          }

          const [passenger] = await conn.query(
            'SELECT user_id FROM passengers WHERE passenger_id = ?',
            [ticket[0].passenger_id]
          )

          if (!passenger || passenger[0].user_id !== req.user.user_id) {
            console.warn(`Unauthorized access attempt on ticket ${ticketId}`)
            failedTickets.push({ ticketId, error: 'Unauthorized access' })
            continue
          }

          if (discountCode) {
            console.log(
              `Applying discount code ${discountCode} to ticket ${ticketId}`
            )
            await Discount.applyToTickets([ticketId], discountCode, conn)
          }

          const payment = await Payment.processSingleTicket(
            {
              ticketId,
              method: paymentMethod, // Ensure method is passed
            },
            conn
          )
          console.log(`Payment processed: ${JSON.stringify(payment)}`)

          paymentResults.push({
            ticketId,
            amount: payment.amount,
            transactionId: payment.transaction_id,
            status: 'success',
          })
        } catch (error) {
          console.error(`Ticket ${ticketId} failed: ${error.message}`)
          failedTickets.push({ ticketId, error: error.message })
        }
      }

      await conn.commit()
      console.log(`Processed ${paymentResults.length} payments successfully`)

      res.json({
        success: true,
        processed: paymentResults,
        failed: failedTickets,
        message:
          failedTickets.length > 0
            ? 'Partial payment processed'
            : 'Payment processed successfully',
      })
    } catch (error) {
      console.error(`[PAYMENT ERROR] ${error.message}\n${error.stack}`)
      await conn.rollback()
      res.status(400).json({
        success: false,
        error: error.message,
        code: 'PAYMENT_ERROR',
      })
    } finally {
      conn.release()
      console.log('[PAYMENT] Connection released')
    }
  }
  async getSeatPrices(req, res) {
    try {
      const { seatIds } = req.body

      if (!seatIds || !Array.isArray(seatIds)) {
        throw new Error('Invalid seat IDs provided')
      }

      const [seats] = await pool.query(
        'SELECT seat_id, price FROM seats WHERE seat_id IN (?)',
        [seatIds]
      )

      const prices = {}
      seats.forEach((seat) => {
        prices[seat.seat_id] = seat.price
      })

      res.json({
        success: true,
        prices,
      })
    } catch (error) {
      console.error('[SEAT PRICES ERROR]', error.message)
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to get seat prices',
      })
    }
  }
  async retryPayment(req, res) {
    const conn = await pool.getConnection()
    try {
      const ticketId = req.params.id
      const userId = req.user.user_id

      await conn.beginTransaction()

      // 1. Verify ticket exists and belongs to user
      const [tickets] = await conn.query(
        `SELECT t.*, p.user_id 
       FROM tickets t
       JOIN passengers p ON t.passenger_id = p.passenger_id
       WHERE t.ticket_id = ?`,
        [ticketId]
      )

      if (tickets.length === 0) {
        throw new Error('Ticket not found')
      }

      const ticket = tickets[0]
      if (ticket.user_id !== userId) {
        throw new Error('Unauthorized to retry payment for this ticket')
      }

      // 2. Check if ticket is eligible for retry
      if (ticket.status !== 'Pending') {
        throw new Error(`Cannot retry payment for ${ticket.status} ticket`)
      }

      // 3. Get original payment details
      const [payments] = await conn.query(
        `SELECT * FROM payments WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1`,
        [ticketId]
      )

      if (payments.length === 0) {
        throw new Error('Original payment record not found')
      }

      const payment = payments[0]

      // 4. Process the retry (mock implementation)
      const paymentResult = {
        success: true, // In real app, this would come from payment gateway
        transaction_id: `retry_${Date.now()}`,
        status: 'completed',
      }

      // 5. Update payment record instead of creating new one
      await conn.query(
        `UPDATE payments SET
        transaction_id = ?,
        status = ?,
        updated_at = NOW(),
        retry_count = retry_count + 1
       WHERE payment_id = ?`,
        [paymentResult.transaction_id, paymentResult.status, payment.payment_id]
      )

      // 6. Update ticket status
      await conn.query(`UPDATE tickets SET status = ? WHERE ticket_id = ?`, [
        paymentResult.success ? 'Confirmed' : 'Pending',
        ticketId,
      ])

      await conn.commit()

      res.json({
        success: true,
        message: 'Payment retried successfully',
        transactionId: paymentResult.transaction_id,
        ticketStatus: paymentResult.success ? 'Confirmed' : 'Pending',
      })
    } catch (error) {
      await conn.rollback()
      console.error(`Payment retry error: ${error.message}`)
      res.status(400).json({
        success: false,
        error: error.message,
      })
    } finally {
      conn.release()
    }
  }
  // ---------------------------
  // TICKET MANAGEMENT
  // ---------------------------
  async getTickets(req, res) {
    try {
      console.log(`[TICKETS] Fetching tickets for user ${req.user.user_id}`)
      const { status, page = 1, limit = 10 } = req.query

      // First get all passenger IDs for this user
      const [passengers] = await pool.query(
        `SELECT passenger_id FROM passengers WHERE user_id = ?`,
        [req.user.user_id]
      )

      if (!passengers.length) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: 0,
          },
        })
      }

      const passengerIds = passengers.map((p) => p.passenger_id)

      // Main ticket query with authorization built in
      let query = `
      SELECT 
        t.ticket_id,
        t.status,
        t.price,
        t.created_at,
        t.expires_at,
        t.flight_id,
        
        -- Passenger details
        p.first_name,
        p.last_name,
        p.passport_number,
        
        -- Flight details
        f.flight_number,
        f.departure_time,
        f.arrival_time,
        f.status AS flight_status,
        
        -- Airport details
        dep.code AS departure_airport,
        dep.name AS departure_airport_name,
        arr.code AS arrival_airport,
        arr.name AS arrival_airport_name,
        
        -- Seat details
        s.seat_number,
        s.class AS seat_class
      FROM tickets t
      JOIN passengers p ON t.passenger_id = p.passenger_id
      JOIN flights f ON t.flight_id = f.flight_id
      JOIN airports dep ON f.departure_airport = dep.airport_id
      JOIN airports arr ON f.arrival_airport = arr.airport_id
      LEFT JOIN seats s ON t.seat_id = s.seat_id
      WHERE t.passenger_id IN (?)
      `

      let params = [passengerIds]

      // Add status filter if provided
      if (status) {
        query += ' AND t.status = ?'
        params.push(status)
      }

      // Add pagination
      query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?'
      params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit))

      const [tickets] = await pool.query(query, params)

      // Count query
      const [[count]] = await pool.query(
        `SELECT COUNT(*) as total 
         FROM tickets 
         WHERE passenger_id IN (?) 
         ${status ? 'AND status = ?' : ''}`,
        status ? [passengerIds, status] : [passengerIds]
      )

      res.json({
        success: true,
        data: tickets,
        pagination: {
          total: count.total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count.total / parseInt(limit)),
        },
      })
    } catch (error) {
      console.error(`[TICKETS ERROR] ${error.message}\n${error.stack}`)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch tickets',
        systemError:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      })
    }
  }

  async getTicketDetails(req, res) {
    try {
      const ticketId = req.params.id
      console.log(`[TICKET DETAILS] Request for ticket ${ticketId}`)

      // Validate ticket ID
      if (!ticketId || isNaN(ticketId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ticket ID format',
        })
      }

      // Get ticket with complete details
      const ticket = await Ticket.findById(ticketId)
      if (!ticket) {
        return res.status(404).json({
          success: false,
          error: 'Ticket not found',
        })
      }

      // Verify ownership
      const passenger = await Passenger.findById(ticket.passenger_id)
      if (!passenger) {
        return res.status(404).json({
          success: false,
          error: 'Passenger not found',
        })
      }

      if (passenger.user_id !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized access to ticket',
        })
      }

      // Get payment details
      const payment =
        ticket.status === 'Confirmed' || 'Cancelled'
          ? await Payment.findByTicketId(ticketId)
          : null

      // Get refund details if exists
      let refund = null
      if (
        ticket.status === 'Refund Requested' ||
        ticket.status === 'Cancelled'
      ) {
        refund = await Refund.findByTicketId(ticketId)
      }

      // Prepare response
      const response = {
        success: true,
        ticket: {
          ticket_id: ticket.ticket_id,
          flight_id: ticket.flight_id,
          flight_number: ticket.flight_number,
          departure_time: ticket.departure_time,
          arrival_time: ticket.arrival_time,
          seat_number: ticket.seat_number,
          class: ticket.seat_class,
          status: ticket.status,
          price: ticket.price,
          flight_status: ticket.flight_status,
          passenger: {
            first_name: ticket.first_name,
            last_name: ticket.last_name,
            passport_number: ticket.passport_number,
            email: passenger.email,
            phone: passenger.phone,
          },
          departure: {
            code: ticket.departure_code,
            airport: ticket.departure_airport_name,
            city: ticket.departure_city,
            country: ticket.departure_country,
          },
          arrival: {
            code: ticket.arrival_code,
            airport: ticket.arrival_airport_name,
            city: ticket.arrival_city,
            country: ticket.arrival_country,
          },
          airline: {
            name: ticket.airline_name,
            code: ticket.airline_code,
            logo_url: ticket.airline_logo_url,
          },
          payment: payment
            ? {
                payment_id: payment.payment_id,
                amount: payment.amount,
                method: payment.method,
                status: payment.status,
                transaction_id: payment.transaction_id,
                created_at: payment.created_at,
                updated_at: payment.updated_at,
              }
            : null,

          refund: refund
            ? {
                refund_id: refund.refund_id,
                amount: refund.amount,
                status: refund.status,
                request_reason: refund.request_reason,
                admin_comment: refund.admin_comment,
                penalty: refund.penalty,
                created_at: refund.created_at,
                updated_at: refund.updated_at,
                estimated_processing_time:
                  refund.status === 'Pending' ? '7-10 business days' : null,
              }
            : null,
          actions: {
            can_cancel:
              ['Confirmed', 'Pending'].includes(ticket.status) &&
              ['Scheduled', 'Delayed'].includes(ticket.flight_status),
            can_check_in:
              ticket.status === 'Confirmed' &&
              ticket.flight_status === 'Scheduled' &&
              new Date(ticket.departure_time) - Date.now() <
                24 * 60 * 60 * 1000,
            can_request_refund:
              ticket.status === 'Confirmed' &&
              ['Scheduled', 'Delayed'].includes(ticket.flight_status),
          },
        },
      }

      res.json(response)
    } catch (error) {
      console.error(`[TICKET DETAILS ERROR] ${error.message}\n${error.stack}`)
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve ticket details',
        system_error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      })
    }
  }
  // userController.js
  async checkUserReview(req, res) {
    try {
      const { flight_id } = req.query
      const userId = req.user.id

      if (!flight_id) {
        return res.status(400).json({
          success: false,
          message: 'flight_id query parameter is required',
        })
      }

      // Check flight eligibility (must be arrived)
      const [flight] = await pool.query(
        `SELECT status FROM flights 
       WHERE flight_id = ? AND status = 'Arrived'`,
        [flight_id]
      )

      if (!flight.length) {
        return res.status(400).json({
          success: false,
          message: 'Flight has not arrived yet',
        })
      }

      const [ticket] = await pool.query(
        `SELECT ticket_id FROM tickets 
       WHERE flight_id = ? AND passenger_id = ? AND status = 'Confirmed'`,
        [flight_id, userId]
      )

      if (!ticket.length) {
        return res.status(403).json({
          success: false,
          message: 'No confirmed ticket found for this flight',
        })
      }

      // Check for existing review
      const [review] = await pool.query(
        `SELECT * FROM reviews 
       WHERE flight_id = ? AND user_id = ?`,
        [flight_id, userId]
      )

      res.status(200).json({
        success: true,
        exists: review.length > 0,
        review: review[0] || null,
      })
    } catch (error) {
      console.error('Error checking user review:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to check review status',
      })
    }
  }

  async cancelTicket(req, res) {
    const conn = await pool.getConnection()
    try {
      const ticketId = req.params.id
      await conn.beginTransaction()

      // 1. Get ticket with minimal locking
      const ticket = await conn.query(
        `SELECT t.*, f.departure_time 
       FROM tickets t
       JOIN flights f ON t.flight_id = f.flight_id
       WHERE t.ticket_id = ?
       FOR UPDATE SKIP LOCKED`, // MySQL 8+ syntax
        [ticketId]
      )

      if (!ticket[0].length) {
        throw new Error('Ticket not found')
      }

      // 2. Validate cancellation eligibility
      if (new Date(ticket[0][0].departure_time) < new Date()) {
        throw new Error('Flight already departed')
      }

      // 3. Fast update operations
      await conn.query(
        `UPDATE tickets SET status = 'Cancelled' 
       WHERE ticket_id = ?`,
        [ticketId]
      )

      await conn.query(
        `UPDATE seats SET is_booked = 0 
       WHERE seat_id = ?`,
        [ticket[0][0].seat_id]
      )

      if (ticket[0][0].price > 0) {
        await conn.query(
          `INSERT INTO refunds 
         (ticket_id, amount, status)
         VALUES (?, ?, 'Pending')`,
          [ticketId, ticket[0][0].price * 0.9] // 10% penalty
        )
      }

      await conn.commit()
      res.json({ success: true })
    } catch (error) {
      await conn.rollback()
      console.error(`Cancellation error: ${error.message}`)
      res.status(400).json({ success: false, error: error.message })
    } finally {
      conn.release()
    }
  }
  async getTicketStats(req, res) {
    try {
      console.log(`[STATS] Request from user ${req.user.user_id}`)
      const stats = await Ticket.getUserStats(req.user.user_id)
      console.log('Stats result:', JSON.stringify(stats))

      res.json({
        success: true,
        stats: {
          total: stats?.total || 0,
          confirmed: stats?.confirmed || 0,
          cancelled: stats?.cancelled || 0,
          pending: stats?.pending || 0,
          total_spent: stats?.total_spent || 0,
          unique_flights: stats?.unique_flights || 0,
        },
      })
    } catch (error) {
      console.error(`[STATS ERROR] ${error.message}\n${error.stack}`)
      res.status(500).json({ success: false, error: 'Failed to get stats' })
    }
  }

  async printTicket(req, res) {
    try {
      const ticketId = req.params.id
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' })
      }

      const ticket = await Ticket.findById(ticketId)
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' })
      }

      // Generate barcode
      const barcodeOptions = {
        bcid: 'code128',
        text: ticket.ticket_id.toString(),
        scale: 3,
        height: 10,
        includetext: true,
      }
      const pngBuffer = await bwipjs.toBuffer(barcodeOptions)

      // Create PDF
      const pdfDoc = new PDFDocument()
      pdfDoc.pipe(res)

      pdfDoc.fontSize(25).text('Flight Ticket', 100, 80)
      pdfDoc.fontSize(12).text(`Ticket ID: ${ticket.ticket_id}`, 100, 120)
      pdfDoc.image(pngBuffer, 100, 150, { width: 200 })

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=ticket-${ticketId}.pdf`
      )
      pdfDoc.end()
    } catch (error) {
      console.error(`Print error: ${error.message}`)
      res.status(500).json({ error: 'Failed to generate ticket' })
    }
  }

  generateBarcode = async (ticketId) => {
    console.log(`[BARCODE] Generating for ticket ${ticketId}`)
    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(
        {
          bcid: 'code128',
          text: ticketId.toString(),
          scale: 3,
          height: 10,
          includetext: true,
        },
        (err, png) => {
          if (err) {
            console.error(`[BARCODE ERROR] ${err.message}`)
            reject(err)
          } else {
            console.log('Barcode created successfully')
            resolve(png)
          }
        }
      )
    })
  }

  // ---------------------------
  // REFUND MANAGEMENT
  // ---------------------------

  async requestRefund(req, res) {
    const conn = await pool.getConnection()
    try {
      console.log(
        `[REFUND] Starting refund request for ticket ${req.params.id}`
      )
      await conn.beginTransaction()
      const ticketId = req.params.id

      console.log(`[REFUND] Validating ticket ownership`)
      const ticket = await Ticket.findById(ticketId, conn)
      const passenger = await Passenger.findById(ticket.passenger_id, conn)
      console.log(`User ${req.user.user_id} vs Passenger ${passenger?.user_id}`)

      if (!passenger || passenger.user_id !== req.user.user_id) {
        console.warn('[REFUND] Unauthorized refund attempt')
        throw new Error('Unauthorized refund request')
      }

      console.log('[REFUND] Calculating refund parameters')
      const flight = await Flight.findById(ticket.flight_id, conn)
      const hoursToDeparture = Math.abs(
        (new Date(flight.departure_time) - new Date()) / 36e5
      )
      const penalty = hoursToDeparture < 48 ? 30 : 10
      const refundAmount = ticket.price * (1 - penalty / 100)
      console.log(`Calculated refund: $${refundAmount} (${penalty}% penalty)`)

      console.log('[REFUND] Creating refund request')
      const refund = await Refund.createRequest(
        {
          ticket_id: ticketId,
          amount: refundAmount,
          request_reason: req.body.reason || 'User request',
          penalty: penalty,
        },
        conn
      )
      console.log(`Refund ID ${refund.refund_id} created`)

      await conn.commit()
      console.log('[REFUND] Transaction committed')

      res.json({
        success: true,
        refund: {
          id: refund.refund_id,
          amount: refund.amount,
          status: refund.status,
        },
      })
    } catch (error) {
      console.error(`[REFUND ERROR] ${error.message}\n${error.stack}`)
      await conn.rollback()
      res.status(400).json({ success: false, error: error.message })
    } finally {
      conn.release()
      console.log('[REFUND] Connection released')
    }
  }

  async getRefunds(req, res) {
    try {
      console.log(`[REFUNDS] Fetching for user ${req.user.user_id}`)
      const { page = 1, limit = 10 } = req.query
      console.log(`Pagination: page ${page}, limit ${limit}`)

      const result = await Refund.getByUser(req.user.user_id, {
        page: parseInt(page),
        limit: parseInt(limit),
      })

      console.log(
        `Found ${result.total} refunds, showing ${result.data.length}`
      )
      res.json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      })
    } catch (error) {
      console.error(`[REFUNDS ERROR] ${error.message}\n${error.stack}`)
      res.status(500).json({ success: false, error: 'Failed to get refunds' })
    }
  }

  // ---------------------------
  // REVIEW MANAGEMENT
  // ---------------------------
  async submitReview(req, res) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const { flight_id, rating, comment } = req.body
      const user_id = req.user.user_id

      // 1. Validate flight status
      const [flight] = await conn.query(
        `SELECT status, departure_time FROM flights 
       WHERE flight_id = ? AND status = 'Arrived'`,
        [flight_id]
      )

      if (!flight.length) {
        throw new Error("Cannot review flight that hasn't arrived")
      }

      // 2. Verify flight occurred in the past
      if (new Date(flight[0].departure_time) > new Date()) {
        throw new Error('Cannot review flight before departure')
      }

      // 3. Check ticket ownership
      const [tickets] = await conn.query(
        `SELECT t.ticket_id FROM tickets t
       JOIN passengers p ON t.passenger_id = p.passenger_id
       WHERE p.passenger_id = ? AND t.flight_id = ? 
       AND t.status = 'Confirmed'
       LIMIT 1`,
        [user_id, flight_id]
      )

      // 5. Create new review with explicit check
      const [result] = await conn.query(
        `INSERT INTO reviews 
       (user_id, flight_id, rating, comment)
       VALUES (?, ?, ?, ?)`,
        [user_id, flight_id, rating, comment || null]
      )

      await conn.commit()
      res.json({
        success: true,
        message: 'Review submitted successfully',
        review_id: result.insertId,
      })
    } catch (error) {
      await conn.rollback()

      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code || 'REVIEW_ERROR',
      })
    } finally {
      conn.release()
    }
  }

  async updateReview(req, res) {
    const conn = await pool.getConnection()
    try {
      console.log(`[REVIEW] Updating review ${req.params.id}`)
      await conn.beginTransaction()
      const reviewId = req.params.id
      const { rating, comment } = req.body

      console.log(
        `New values - Rating: ${rating}, Comment: ${comment?.length || 0} chars`
      )
      const review = await Review.findById(reviewId, conn)
      console.log(`Original review: ${JSON.stringify(review)}`)

      if (review.user_id !== req.user.user_id) {
        console.warn(
          `User ${req.user.user_id} != Review author ${review.user_id}`
        )
        throw new Error('Unauthorized update')
      }

      const updatedReview = await Review.update(
        reviewId,
        req.user.user_id,
        { rating, comment },
        conn
      )
      console.log(`Updated review: ${JSON.stringify(updatedReview)}`)

      await conn.commit()
      res.json({
        success: true,
        review: {
          id: updatedReview.review_id,
          rating: updatedReview.rating,
          comment: updatedReview.comment,
        },
      })
    } catch (error) {
      console.error(`[REVIEW UPDATE ERROR] ${error.message}\n${error.stack}`)
      await conn.rollback()
      res.status(400).json({ success: false, error: error.message })
    } finally {
      conn.release()
    }
  }

  async deleteReview(req, res) {
    const conn = await pool.getConnection()
    try {
      console.log(`[REVIEW] Deleting review ${req.params.id}`)
      await conn.beginTransaction()
      const reviewId = req.params.id

      // const review = await Review.findById(reviewId, conn)

      // if (!review) {
      //   throw new Error('Review not found')
      // }

      // console.log(
      //   `Review author: ${review.user_id}, Current user: ${req.user.user_id}`
      // )

      // if (review.user_id !== req.user.user_id) {
      //   throw new Error('Unauthorized deletion')
      // }

      await Review.delete(reviewId, req.user.user_id, conn)
      console.log(`Review ${reviewId} deleted`)

      await conn.commit()
      res.json({ success: true, message: 'Review deleted successfully' })
    } catch (error) {
      console.error(`[REVIEW DELETE ERROR] ${error.message}\n${error.stack}`)
      await conn.rollback()
      res.status(400).json({ success: false, error: error.message })
    } finally {
      conn.release()
    }
  }

  async getReviews(req, res) {
    try {
      console.log(`[REVIEWS] Fetching for user ${req.user.user_id}`)
      const { page = 1, limit = 10 } = req.query
      console.log(`Pagination: page ${page}, limit ${limit}`)

      const result = await Review.search({
        userId: req.user.user_id,
        page: parseInt(page),
        limit: parseInt(limit),
      })

      console.log(`Found ${result.total} reviews`)
      res.json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      })
    } catch (error) {
      console.error(`[REVIEWS ERROR] ${error.message}\n${error.stack}`)
      res
        .status(500)
        .json({ success: false, error: 'Failed to retrieve reviews' })
    }
  }
  async getReview(req, res) {
    const conn = await pool.getConnection()
    try {
      const reviewId = req.params.id
      console.log(`[REVIEW] Fetching review ID ${reviewId}`)

      const review = await Review.findById(reviewId, conn)

      if (!review) {
        return res.status(404).json({
          success: false,
          error: 'Review not found',
        })
      }

      // Optional: restrict access to the owner
      if (review.user_id !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized to view this review',
        })
      }

      res.json({
        success: true,
        review,
      })
    } catch (error) {
      console.error(`[GET REVIEW ERROR] ${error.message}\n${error.stack}`)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch review',
      })
    } finally {
      conn.release()
    }
  }

  // ---------------------------
  // PASSENGER MANAGEMENT
  // ---------------------------

  async updatePassengerDetails(req, res) {
    const conn = await pool.getConnection()
    try {
      console.log(`[PASSENGER] Updating details for ticket ${req.params.id}`)
      await conn.beginTransaction()
      const ticketId = req.params.id
      const updates = req.body
      console.log(`Update payload: ${JSON.stringify(updates)}`)

      const ticket = await Ticket.findById(ticketId, conn)
      console.log(`Ticket details: ${JSON.stringify(ticket)}`)

      const passenger = await Passenger.findById(ticket.passenger_id, conn)
      console.log(
        `Passenger ownership: ${passenger.user_id} vs ${req.user.user_id}`
      )

      if (passenger.user_id !== req.user.user_id) {
        throw new Error('Unauthorized update')
      }

      const flight = await Flight.findById(ticket.flight_id, conn)
      const hoursToDeparture = Math.abs(
        (new Date(flight.departure_time) - new Date()) / 36e5
      )
      console.log(`Hours to departure: ${hoursToDeparture.toFixed(1)}`)

      if (hoursToDeparture < 48) {
        throw new Error('Update window closed')
      }

      const allowedFields = ['first_name', 'last_name', 'passport_number']
      const invalidFields = Object.keys(updates).filter(
        (f) => !allowedFields.includes(f)
      )
      console.log(`Invalid fields detected: ${invalidFields.join(', ')}`)

      if (invalidFields.length > 0) {
        throw new Error(`Invalid fields: ${invalidFields.join(', ')}`)
      }

      console.log('[PASSENGER] Performing update')
      await Passenger.update(ticket.passenger_id, updates, conn)

      await conn.commit()
      res.json({ success: true, message: 'Passenger details updated' })
    } catch (error) {
      console.error(`[PASSENGER ERROR] ${error.message}\n${error.stack}`)
      await conn.rollback()
      res.status(400).json({ success: false, error: error.message })
    } finally {
      conn.release()
    }
  }

  async getPassengers(req, res) {
    try {
      console.log(`[PASSENGERS] Fetching for user ${req.user.user_id}`)
      const { page = 1, limit = 10 } = req.query
      console.log(`Pagination: page ${page}, limit ${limit}`)

      const result = await Passenger.search({
        userId: req.user.user_id,
        page: parseInt(page),
        limit: parseInt(limit),
      })

      console.log(`Found ${result.total} passengers`)
      res.json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      })
    } catch (error) {
      console.error(`[PASSENGERS ERROR] ${error.message}\n${error.stack}`)
      res
        .status(500)
        .json({ success: false, error: 'Failed to get passengers' })
    }
  }

  // ---------------------------
  // CONFIGURATION
  // ---------------------------

  async getConfig(req, res) {
    try {
      console.log('[CONFIG] Loading system configuration')

      console.log('[CONFIG] Fetching active airports')
      const [airports] = await pool.query(`
        SELECT airport_id, name, code, city, country 
        FROM airports 
        WHERE is_active = TRUE
      `)
      console.log(`Found ${airports.length} active airports`)

      console.log('[CONFIG] Fetching active airlines')
      const [airlines] = await pool.query(`
        SELECT airline_id, name, code 
        FROM airlines 
        WHERE is_active = TRUE
      `)
      console.log(`Found ${airlines.length} active airlines`)

      res.json({
        success: true,
        config: {
          airports,
          airlines,
        },
      })
    } catch (error) {
      console.error(`[CONFIG ERROR] ${error.message}\n${error.stack}`)
      res.status(500).json({
        success: false,
        error: 'Configuration load failed',
        details:
          process.env.NODE_ENV === 'development'
            ? {
                message: error.message,
                sqlError: error.code,
              }
            : undefined,
      })
    }
  }
}

module.exports = new UserController()
