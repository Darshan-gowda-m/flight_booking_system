const {
  Airline,
  Airport,
  Flight,
  User,
  Discount,
  Seat,
  Refund,
  Pricing,
  Payment,
  Passenger,
  Ticket,
  Review,
  db,
} = require('../models')
const pool = require('../config/db')
const {
  adminMiddleware,
  tokenBlacklist,
} = require('../middleware/authMiddleware')
const Joi = require('joi')
const csv = require('csv-writer').createObjectCsvWriter
const exceljs = require('exceljs')
const logger = require('../config/logger')
const jwt = require('jsonwebtoken')
const client = require('../config/redis')

class AdminController {
  // ---------------------------
  // DASHBOARD OPERATIONS
  // ---------------------------

  async getDashboardStats(req, res) {
    try {
      const [
        [totals],
        statusDistribution,
        recentBookings,
        revenueTrends,
        popularRoutes,
        userSignups,
        userActivity,
        airlineStats,
        airportStats,
        [activeUsers],
        ticketStatusStats,
        reviewStats,
      ] = await Promise.all([
        // Stats Overview
        pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM airports) AS total_airports,
        (SELECT COUNT(*) FROM airlines) AS total_airlines,
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM flights) AS total_flights,
        (SELECT COUNT(*) FROM tickets WHERE status = 'confirmed') AS total_tickets_sold,
        (SELECT SUM(amount) FROM payments WHERE status = 'Success') AS total_revenue,
        (SELECT COUNT(*) FROM refunds WHERE status = 'Approved') AS total_refunds
    `),

        // Flight status distribution
        pool.query(
          `SELECT status, COUNT(*) AS count FROM flights GROUP BY status`
        ),

        // Recent bookings
        pool.query(`
      SELECT t.ticket_id, f.flight_number, p.first_name AS passenger_name, t.price, t.status
      FROM tickets t
      JOIN flights f ON t.flight_id = f.flight_id
      JOIN passengers p ON t.passenger_id = p.passenger_id
      ORDER BY t.created_at DESC 
      LIMIT 5
    `),

        // Revenue trends
        pool.query(`
      SELECT DATE(p.created_at) AS date, SUM(p.amount) AS revenue
      FROM payments p
      WHERE p.status = 'Success'
      GROUP BY DATE(p.created_at)
      ORDER BY date DESC 
      LIMIT 7
    `),

        // Popular routes
        pool.query(`
      SELECT dep.city AS departure, arr.city AS arrival, COUNT(*) AS bookings
      FROM flights f
      JOIN tickets t ON f.flight_id = t.flight_id
      JOIN airports dep ON f.departure_airport = dep.airport_id
      JOIN airports arr ON f.arrival_airport = arr.airport_id
      WHERE t.status = 'confirmed'
      GROUP BY departure, arrival
      ORDER BY bookings DESC 
      LIMIT 5
    `),

        // User signups
        pool.query(`
      SELECT 
        DATE(created_at) AS signup_date,
        COUNT(*) AS user_count
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY signup_date ASC
    `),

        // User activity
        pool.query(`
      SELECT 
        u.user_id, 
        u.username, 
        COUNT(t.ticket_id) AS bookings
      FROM users u
      LEFT JOIN passengers p ON u.user_id = p.user_id
      LEFT JOIN tickets t ON p.passenger_id = t.passenger_id
      GROUP BY u.user_id
      ORDER BY bookings DESC 
      LIMIT 5
    `),

        // Airline stats
        pool.query(`
      SELECT 
        a.name, 
        COUNT(f.flight_id) AS total_flights,
        AVG(r.rating) AS avg_rating
      FROM airlines a
      LEFT JOIN flights f ON a.airline_id = f.airline_id
      LEFT JOIN reviews r ON f.flight_id = r.flight_id
      GROUP BY a.name
      ORDER BY total_flights DESC 
      LIMIT 5
    `),

        // Airport stats
        pool.query(`
      SELECT 
        ap.name, 
        COUNT(f.flight_id) AS total_flights
      FROM airports ap
      LEFT JOIN flights f ON ap.airport_id = f.departure_airport
      GROUP BY ap.name
      ORDER BY total_flights DESC 
      LIMIT 5
    `),

        // Active users
        pool.query(
          `SELECT COUNT(*) AS active_users FROM users WHERE is_active = TRUE`
        ),

        // Ticket status stats
        pool.query(`
      SELECT 
        status,
        COUNT(*) AS count,
        SUM(price) AS total_value
      FROM tickets
      GROUP BY status
    `),

        // Review stats
        pool.query(`
      SELECT 
        AVG(rating) AS avg_rating,
        COUNT(*) AS total_reviews,
        (SELECT COUNT(DISTINCT flight_id) FROM reviews) AS flights_reviewed
      FROM reviews
    `),
      ])

      return res.json({
        success: true,
        stats: {
          totalAirports: totals[0].total_airports,
          totalAirlines: totals[0].total_airlines,
          totalUsers: totals[0].total_users,
          totalFlights: totals[0].total_flights,
          totalTicketsSold: totals[0].total_tickets_sold,
          totalRevenue: totals[0].total_revenue,
          totalRefunds: totals[0].total_refunds || 0,
          activeUsers: activeUsers.active_users,
          avgRating: reviewStats[0][0]?.avg_rating || 0,
          totalReviews: reviewStats[0][0]?.total_reviews || 0,
          flightsReviewed: reviewStats[0][0]?.flights_reviewed || 0,
        },
        statusDistribution,
        recentBookings,
        revenueTrends,
        popularRoutes,
        userSignups,
        userActivity,
        airlineStats,
        airportStats,
        ticketStatusStats,
        reviewStats: reviewStats[0][0],
      })
    } catch (error) {
      console.error(`Dashboard Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'DASHBOARD_ERROR',
          message: 'Failed to load dashboard',
        },
      })
    }
  }

  async getCombinedDashboardStats(req, res) {
    try {
      const { period = 'month' } = req.query

      let dateRange
      const now = new Date()

      switch (period.toLowerCase()) {
        case 'day':
          dateRange = {
            start: new Date(now.setHours(0, 0, 0, 0)),
            end: new Date(now.setHours(23, 59, 59, 999)),
          }
          break
        case 'week':
          const startOfWeek = new Date(now)
          startOfWeek.setDate(now.getDate() - now.getDay())
          dateRange = {
            start: new Date(startOfWeek.setHours(0, 0, 0, 0)),
            end: new Date(
              new Date(startOfWeek).setDate(startOfWeek.getDate() + 6)
            ),
          }
          break
        case 'month':
          dateRange = {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
          }
          break
        case 'year':
          dateRange = {
            start: new Date(now.getFullYear(), 0, 1),
            end: new Date(now.getFullYear(), 11, 31),
          }
          break
        default: // 'all'
          dateRange = {
            start: new Date(0),
            end: new Date(),
          }
      }

      const [
        [totals],
        statusDistribution,
        recentBookings,
        revenueTrends,
        popularRoutes,
        userSignups,
        userActivity,
        airlineStats,
        airportStats,
        [activeUsers],
        ticketStatusStats,
        reviewStats,
        [flightStats],
        [airportDetailedStats],
        revenueByFlight,
        revenueByAirport,
        [passengerStats],
        flightStatusStats,
        topFlights,
        topAirports,
        bookingTrends,
        revenueByClass,
        refundTrends,
        userDemographics,
        flightOccupancy,
      ] = await Promise.all([
        // Basic totals - filtered by period
        pool.query(
          `SELECT 
            (SELECT COUNT(*) FROM airports WHERE is_active = TRUE) AS total_airports,
            (SELECT COUNT(*) FROM airlines WHERE is_active = TRUE) AS total_airlines,
            (SELECT COUNT(*) FROM users WHERE is_active = TRUE) AS total_users,
            (SELECT COUNT(*) FROM flights WHERE departure_time BETWEEN ? AND ?) AS total_flights,
            (SELECT COUNT(*) FROM tickets WHERE status = 'Confirmed' AND created_at BETWEEN ? AND ?) AS total_tickets_sold,
            (SELECT SUM(amount) FROM payments WHERE status = 'Success' AND created_at BETWEEN ? AND ?) AS total_revenue,
            (SELECT COUNT(*) FROM refunds WHERE status = 'Approved' AND created_at BETWEEN ? AND ?) AS total_refunds,
            (SELECT COUNT(DISTINCT country) FROM airports) AS countries_served
          `,
          [
            dateRange.start,
            dateRange.end,
            dateRange.start,
            dateRange.end,
            dateRange.start,
            dateRange.end,
            dateRange.start,
            dateRange.end,
          ]
        ),

        // Flight status distribution - filtered by period
        pool.query(
          `SELECT status, COUNT(*) AS count FROM flights 
           WHERE departure_time BETWEEN ? AND ?
           GROUP BY status`,
          [dateRange.start, dateRange.end]
        ),

        // Recent bookings - filtered by period
        pool.query(
          `SELECT 
            t.ticket_id, 
            f.flight_number, 
            CONCAT(p.first_name, ' ', p.last_name) AS passenger_name, 
            t.price, 
            t.status
          FROM tickets t
          JOIN flights f ON t.flight_id = f.flight_id
          JOIN passengers p ON t.passenger_id = p.passenger_id
          WHERE t.created_at BETWEEN ? AND ?
          ORDER BY t.created_at DESC 
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // Revenue trends - filtered by period
        pool.query(
          `SELECT 
            DATE(p.created_at) AS date, 
            SUM(p.amount) AS revenue,
            COUNT(DISTINCT t.ticket_id) AS bookings_count
          FROM payments p
          JOIN tickets t ON p.ticket_id = t.ticket_id
          WHERE p.status = 'Success'
            AND p.created_at BETWEEN ? AND ?
          GROUP BY DATE(p.created_at)
          ORDER BY date ASC`,
          [dateRange.start, dateRange.end]
        ),

        // Popular routes - filtered by period
        pool.query(
          `SELECT 
            dep.city AS departure, 
            arr.city AS arrival, 
            COUNT(*) AS bookings,
            SUM(t.price) AS total_revenue
          FROM flights f
          JOIN tickets t ON f.flight_id = t.flight_id
          JOIN airports dep ON f.departure_airport = dep.airport_id
          JOIN airports arr ON f.arrival_airport = arr.airport_id
          WHERE t.status = 'Confirmed'
            AND f.departure_time BETWEEN ? AND ?
          GROUP BY departure, arrival
          ORDER BY bookings DESC 
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // User signups - filtered by period
        pool.query(
          `SELECT 
            DATE(created_at) AS signup_date,
            COUNT(*) AS user_count,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin_count
          FROM users
          WHERE created_at BETWEEN ? AND ?
          GROUP BY DATE(created_at)
          ORDER BY signup_date ASC`,
          [dateRange.start, dateRange.end]
        ),

        // User activity - filtered by period
        pool.query(
          `SELECT 
            u.user_id, 
            u.username, 
            u.email,
            COUNT(t.ticket_id) AS bookings,
            SUM(t.price) AS total_spent,
            MAX(t.created_at) AS last_booking_date
          FROM users u
          LEFT JOIN passengers p ON u.user_id = p.user_id
          LEFT JOIN tickets t ON p.passenger_id = t.passenger_id
          WHERE t.status = 'Confirmed'
            AND t.created_at BETWEEN ? AND ?
          GROUP BY u.user_id
          ORDER BY total_spent DESC 
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // Airline stats - filtered by period
        pool.query(
          `SELECT 
            a.airline_id,
            a.name, 
            COUNT(f.flight_id) AS total_flights,
            AVG(r.rating) AS avg_rating,
            SUM(CASE WHEN f.status = 'Arrived' THEN 1 ELSE 0 END) AS completed_flights,
            SUM(CASE WHEN f.status = 'Canceled' THEN 1 ELSE 0 END) AS canceled_flights
          FROM airlines a
          LEFT JOIN flights f ON a.airline_id = f.airline_id
          LEFT JOIN reviews r ON f.flight_id = r.flight_id
          WHERE f.departure_time BETWEEN ? AND ?
          GROUP BY a.airline_id
          ORDER BY total_flights DESC 
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // Airport stats - filtered by period
        pool.query(
          `SELECT 
            ap.airport_id,
            ap.name, 
            ap.city,
            ap.country,
            COUNT(f.flight_id) AS total_flights,
            SUM(CASE WHEN f.status = 'Arrived' THEN 1 ELSE 0 END) AS arrivals,
            SUM(CASE WHEN f.status = 'Departed' THEN 1 ELSE 0 END) AS departures
          FROM airports ap
          LEFT JOIN flights f ON ap.airport_id = f.departure_airport
          WHERE f.departure_time BETWEEN ? AND ?
          GROUP BY ap.airport_id
          ORDER BY total_flights DESC 
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // Active users (not time-based)
        pool.query(
          `SELECT COUNT(*) AS active_users FROM users WHERE is_active = TRUE`
        ),

        // Ticket status stats - filtered by period
        pool.query(
          `SELECT 
            status,
            COUNT(*) AS count,
            SUM(price) AS total_value,
            AVG(price) AS avg_price
          FROM tickets
          WHERE created_at BETWEEN ? AND ?
          GROUP BY status`,
          [dateRange.start, dateRange.end]
        ),

        // Review stats - filtered by period
        pool.query(
          `SELECT 
            AVG(rating) AS avg_rating,
            COUNT(*) AS total_reviews,
            (SELECT COUNT(DISTINCT flight_id) FROM reviews WHERE created_at BETWEEN ? AND ?) AS flights_reviewed,
            (SELECT COUNT(DISTINCT user_id) FROM reviews WHERE created_at BETWEEN ? AND ?) AS unique_reviewers
          FROM reviews
          WHERE created_at BETWEEN ? AND ?`,
          [
            dateRange.start,
            dateRange.end,
            dateRange.start,
            dateRange.end,
            dateRange.start,
            dateRange.end,
          ]
        ),

        // Flight stats - filtered by period
        pool.query(
          `SELECT 
            COUNT(*) AS total_flights,
            SUM(CASE WHEN status = 'Arrived' THEN 1 ELSE 0 END) AS flights_arrived,
            SUM(CASE WHEN status = 'Departed' THEN 1 ELSE 0 END) AS flights_departed,
            SUM(CASE WHEN status = 'Scheduled' THEN 1 ELSE 0 END) AS flights_scheduled,
            SUM(CASE WHEN status = 'Canceled' THEN 1 ELSE 0 END) AS flights_canceled,
            SUM(CASE WHEN status = 'Delayed' THEN 1 ELSE 0 END) AS flights_delayed,
            AVG(TIMESTAMPDIFF(MINUTE, departure_time, arrival_time)) AS avg_flight_duration_minutes,
            MIN(departure_time) AS earliest_flight,
            MAX(arrival_time) AS latest_flight
          FROM flights
          WHERE departure_time BETWEEN ? AND ?`,
          [dateRange.start, dateRange.end]
        ),

        // Detailed airport stats - filtered by period
        pool.query(
          `SELECT 
            COUNT(DISTINCT airport_id) AS total_airports,
            COUNT(DISTINCT country) AS countries_served,
            COUNT(DISTINCT city) AS cities_served,
            (SELECT name FROM airports 
             WHERE airport_id = (
               SELECT departure_airport 
               FROM flights 
               WHERE departure_time BETWEEN ? AND ?
               GROUP BY departure_airport 
               ORDER BY COUNT(*) DESC 
               LIMIT 1
             )) AS busiest_airport,
            (SELECT COUNT(*) FROM flights 
             WHERE departure_airport = (
               SELECT departure_airport 
               FROM flights 
               WHERE departure_time BETWEEN ? AND ?
               GROUP BY departure_airport 
               ORDER BY COUNT(*) DESC 
               LIMIT 1
             )) AS busiest_airport_flights,
            (SELECT name FROM airports
             WHERE airport_id = (
               SELECT arrival_airport
               FROM flights
               WHERE departure_time BETWEEN ? AND ?
               GROUP BY arrival_airport
               ORDER BY COUNT(*) DESC
               LIMIT 1
             )) AS most_popular_destination
          FROM airports`,
          [
            dateRange.start,
            dateRange.end,
            dateRange.start,
            dateRange.end,
            dateRange.start,
            dateRange.end,
          ]
        ),

        // Revenue by flight - filtered by period
        pool.query(
          `SELECT 
            f.flight_id,
            f.flight_number,
            a.name AS airline_name,
            dep.name AS departure_airport,
            arr.name AS arrival_airport,
            COUNT(t.ticket_id) AS tickets_sold,
            SUM(t.price) AS total_revenue,
            AVG(t.price) AS avg_ticket_price,
            AVG(r.rating) AS avg_rating
          FROM flights f
          JOIN airlines a ON f.airline_id = a.airline_id
          JOIN airports dep ON f.departure_airport = dep.airport_id
          JOIN airports arr ON f.arrival_airport = arr.airport_id
          JOIN tickets t ON f.flight_id = t.flight_id
          LEFT JOIN reviews r ON f.flight_id = r.flight_id
          WHERE t.status = 'Confirmed'
            AND f.departure_time BETWEEN ? AND ?
          GROUP BY f.flight_id
          ORDER BY total_revenue DESC
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // Revenue by airport - filtered by period
        pool.query(
          `SELECT 
            ap.airport_id,
            ap.name AS airport_name,
            ap.city,
            ap.country,
            COUNT(DISTINCT f.flight_id) AS total_flights,
            COUNT(t.ticket_id) AS tickets_sold,
            SUM(t.price) AS total_revenue,
            AVG(t.price) AS avg_ticket_price
          FROM airports ap
          LEFT JOIN flights f ON ap.airport_id = f.departure_airport
          LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
          WHERE f.departure_time BETWEEN ? AND ?
          GROUP BY ap.airport_id
          ORDER BY total_revenue DESC
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // Passenger stats - filtered by period
        pool.query(
          `SELECT 
            COUNT(DISTINCT p.passenger_id) AS total_passengers,
            COUNT(DISTINCT p.user_id) AS registered_passengers,
            COUNT(DISTINCT t.ticket_id) AS tickets_issued,
            AVG(t.price) AS avg_ticket_price,
            MIN(p.date_of_birth) AS oldest_passenger_dob,
            MAX(p.date_of_birth) AS youngest_passenger_dob
          FROM passengers p
          LEFT JOIN tickets t ON p.passenger_id = t.passenger_id
          LEFT JOIN flights f ON t.flight_id = f.flight_id
          WHERE t.status = 'Confirmed'
            AND f.departure_time BETWEEN ? AND ?`,
          [dateRange.start, dateRange.end]
        ),

        // Flight status stats - filtered by period
        pool.query(
          `SELECT 
            status,
            COUNT(*) AS count,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM flights WHERE departure_time BETWEEN ? AND ?), 2) AS percentage
          FROM flights
          WHERE departure_time BETWEEN ? AND ?
          GROUP BY status`,
          [dateRange.start, dateRange.end, dateRange.start, dateRange.end]
        ),

        // Top flights - filtered by period
        pool.query(
          `SELECT 
            f.flight_id,
            f.flight_number,
            a.name AS airline_name,
            dep.name AS departure_airport,
            arr.name AS arrival_airport,
            COUNT(t.ticket_id) AS passengers,
            SUM(t.price) AS revenue,
            AVG(r.rating) AS avg_rating,
            COUNT(r.review_id) AS review_count
          FROM flights f
          JOIN airlines a ON f.airline_id = a.airline_id
          JOIN airports dep ON f.departure_airport = dep.airport_id
          JOIN airports arr ON f.arrival_airport = arr.airport_id
          LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
          LEFT JOIN reviews r ON f.flight_id = r.flight_id
          WHERE f.departure_time BETWEEN ? AND ?
          GROUP BY f.flight_id
          ORDER BY revenue DESC
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // Top airports - filtered by period
        pool.query(
          `SELECT 
            ap.airport_id,
            ap.name,
            ap.city,
            ap.country,
            COUNT(DISTINCT f.flight_id) AS total_flights,
            COUNT(DISTINCT CASE WHEN f.status = 'Arrived' THEN f.flight_id END) AS arrivals,
            COUNT(DISTINCT CASE WHEN f.status = 'Departed' THEN f.flight_id END) AS departures,
            COUNT(t.ticket_id) AS passengers_served,
            SUM(t.price) AS total_revenue
          FROM airports ap
          LEFT JOIN flights f ON ap.airport_id IN (f.departure_airport, f.arrival_airport)
          LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
          WHERE f.departure_time BETWEEN ? AND ?
          GROUP BY ap.airport_id
          ORDER BY total_revenue DESC
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),

        // Booking trends by hour of day - filtered by period
        pool.query(
          `SELECT 
            HOUR(t.created_at) AS hour_of_day,
            COUNT(*) AS bookings_count,
            SUM(t.price) AS total_revenue
          FROM tickets t
          WHERE t.created_at BETWEEN ? AND ?
          GROUP BY HOUR(t.created_at)
          ORDER BY hour_of_day ASC`,
          [dateRange.start, dateRange.end]
        ),

        // Revenue by class - filtered by period
        pool.query(
          `SELECT 
            s.class,
            COUNT(*) AS tickets_sold,
            SUM(t.price) AS total_revenue,
            AVG(t.price) AS avg_price
          FROM tickets t
          JOIN seats s ON t.seat_id = s.seat_id
          WHERE t.status = 'Confirmed'
            AND t.created_at BETWEEN ? AND ?
          GROUP BY s.class
          ORDER BY total_revenue DESC`,
          [dateRange.start, dateRange.end]
        ),

        // Refund trends - filtered by period
        pool.query(
          `SELECT 
            DATE(r.created_at) AS refund_date,
            COUNT(*) AS refund_count,
            SUM(r.amount) AS total_refunded,
            AVG(r.penalty) AS avg_penalty
          FROM refunds r
          WHERE r.created_at BETWEEN ? AND ?
          GROUP BY DATE(r.created_at)
          ORDER BY refund_date ASC`,
          [dateRange.start, dateRange.end]
        ),

        // User demographics - filtered by period
        pool.query(
          `SELECT 
            CASE
            WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 0 AND 17 THEN '0-17'
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 18 AND 24 THEN '18-24'
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 25 AND 34 THEN '25-34'
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 35 AND 44 THEN '35-44'
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 45 AND 54 THEN '45-54'
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) >= 55 THEN '55+'
              ELSE 'Unknown'
            END AS age_group,
            COUNT(DISTINCT p.passenger_id) AS passenger_count,
            SUM(t.price) AS total_spending
          FROM passengers p
          LEFT JOIN tickets t ON p.passenger_id = t.passenger_id
          WHERE t.status = 'Confirmed'
            AND t.created_at BETWEEN ? AND ?
          GROUP BY age_group
          ORDER BY age_group`,
          [dateRange.start, dateRange.end]
        ),

        // Flight occupancy rates - filtered by period
        pool.query(
          `SELECT 
            f.flight_id,
            f.flight_number,
            a.name AS airline_name,
            COUNT(s.seat_id) AS total_seats,
            SUM(CASE WHEN s.is_booked = TRUE THEN 1 ELSE 0 END) AS booked_seats,
            ROUND(SUM(CASE WHEN s.is_booked = TRUE THEN 1 ELSE 0 END) * 100.0 / COUNT(s.seat_id), 2) AS occupancy_rate
          FROM flights f
          JOIN airlines a ON f.airline_id = a.airline_id
          LEFT JOIN seats s ON f.flight_id = s.flight_id
          WHERE f.departure_time BETWEEN ? AND ?
          GROUP BY f.flight_id
          ORDER BY occupancy_rate DESC
          LIMIT 10`,
          [dateRange.start, dateRange.end]
        ),
      ])

      // Format the combined response
      return res.json({
        success: true,
        period,
        dateRange: {
          start: dateRange.start,
          end: dateRange.end,
        },
        stats: {
          // Basic stats
          totalAirports: totals[0].total_airports,
          totalAirlines: totals[0].total_airlines,
          totalUsers: totals[0].total_users,
          totalFlights: totals[0].total_flights,
          totalTicketsSold: totals[0].total_tickets_sold,
          totalRevenue: totals[0].total_revenue,
          totalRefunds: totals[0].total_refunds || 0,
          countriesServed: totals[0].countries_served,
          activeUsers: activeUsers.active_users,
          avgRating: reviewStats[0][0]?.avg_rating || 0,
          totalReviews: reviewStats[0][0]?.total_reviews || 0,
          flightsReviewed: reviewStats[0][0]?.flights_reviewed || 0,
          uniqueReviewers: reviewStats[0][0]?.unique_reviewers || 0,

          // Enhanced stats
          flights: flightStats[0],
          airports: airportDetailedStats[0],
          passengers: passengerStats[0],
          statusDistribution: flightStatusStats,
          revenueByFlight,
          revenueByAirport,
          topFlights,
          topAirports,
          bookingTrends,
          revenueByClass,
          refundTrends,
          userDemographics,
          flightOccupancy,
        },
        // Data arrays for charts
        statusDistribution,
        recentBookings,
        revenueTrends,
        popularRoutes,
        userSignups,
        userActivity,
        airlineStats,
        airportStats,
        ticketStatusStats,
        reviewStats: reviewStats[0][0],
      })
    } catch (error) {
      console.error(`Combined Dashboard Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'DASHBOARD_ERROR',
          message: 'Failed to load dashboard data',
          details: error.message,
        },
      })
    }
  }

  async getAirportPerformance(req, res) {
    try {
      const { airportId } = req.params
      const { period = 'month' } = req.query

      let dateRange
      const now = new Date()

      switch (period.toLowerCase()) {
        case 'day':
          dateRange = {
            start: new Date(now.setHours(0, 0, 0, 0)),
            end: new Date(now.setHours(23, 59, 59, 999)),
          }
          break
        case 'week':
          const startOfWeek = new Date(now)
          startOfWeek.setDate(now.getDate() - now.getDay())
          dateRange = {
            start: new Date(startOfWeek.setHours(0, 0, 0, 0)),
            end: new Date(
              new Date(startOfWeek).setDate(startOfWeek.getDate() + 6)
            ),
          }
          break
        case 'month':
          dateRange = {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
          }
          break
        case 'year':
          dateRange = {
            start: new Date(now.getFullYear(), 0, 1),
            end: new Date(now.getFullYear(), 11, 31),
          }
          break
        default: // 'all'
          dateRange = {
            start: new Date(0),
            end: new Date(),
          }
      }

      const [
        [airportDetails],
        [performanceStats],
        [flightStats],
        [revenueTrends],
        [topAirlines],
        [topRoutes],
      ] = await Promise.all([
        // Airport details query
        pool.query(
          `
      SELECT * FROM airports WHERE airport_id = ?
    `,
          [airportId]
        ),

        // Performance statistics query
        pool.query(
          `
      SELECT
        COUNT(DISTINCT f.flight_id) AS total_flights,
        COUNT(DISTINCT CASE WHEN f.status = 'Arrived' THEN f.flight_id END) AS arrivals,
        COUNT(DISTINCT CASE WHEN f.status = 'Departed' THEN f.flight_id END) AS departures,
        COUNT(DISTINCT t.ticket_id) AS passengers_served,
        SUM(t.price) AS total_revenue,
        COUNT(DISTINCT a.airline_id) AS airlines_served,
        COUNT(DISTINCT CASE WHEN f.arrival_airport = ? THEN f.departure_airport ELSE f.arrival_airport END) AS connected_airports
      FROM flights f
      LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
      LEFT JOIN airlines a ON f.airline_id = a.airline_id
      WHERE (f.departure_airport = ? OR f.arrival_airport = ?)
        AND f.departure_time BETWEEN ? AND ?
    `,
          [airportId, airportId, airportId, dateRange.start, dateRange.end]
        ),

        // Flight statistics query
        pool.query(
          `
      SELECT
        f.status,
        COUNT(*) AS count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM flights
                                 WHERE (departure_airport = ? OR arrival_airport = ?)
                                 AND departure_time BETWEEN ? AND ?), 2) AS percentage
      FROM flights f
      WHERE (f.departure_airport = ? OR f.arrival_airport = ?)
        AND f.departure_time BETWEEN ? AND ?
      GROUP BY f.status
    `,
          [
            airportId,
            airportId,
            dateRange.start,
            dateRange.end,
            airportId,
            airportId,
            dateRange.start,
            dateRange.end,
          ]
        ),

        // Revenue trends query
        pool.query(
          `
      SELECT
        DATE_FORMAT(f.departure_time, '%Y-%m-%d') AS date,
        SUM(t.price) AS revenue,
        COUNT(DISTINCT f.flight_id) AS flights,
        COUNT(t.ticket_id) AS passengers
      FROM flights f
      JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
      WHERE (f.departure_airport = ? OR f.arrival_airport = ?)
        AND f.departure_time BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(f.departure_time, '%Y-%m-%d')
      ORDER BY date ASC
    `,
          [airportId, airportId, dateRange.start, dateRange.end]
        ),

        // Top airlines query
        pool.query(
          `
      SELECT
        a.airline_id,
        a.name AS airline_name,
        a.code AS airline_code,
        COUNT(DISTINCT f.flight_id) AS flights_operated,
        COUNT(t.ticket_id) AS passengers_carried,
        SUM(t.price) AS revenue_generated
      FROM airlines a
      JOIN flights f ON a.airline_id = f.airline_id
      LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
      WHERE (f.departure_airport = ? OR f.arrival_airport = ?)
        AND f.departure_time BETWEEN ? AND ?
      GROUP BY a.airline_id
      ORDER BY revenue_generated DESC
      LIMIT 5
    `,
          [airportId, airportId, dateRange.start, dateRange.end]
        ),

        // Top routes query
        pool.query(
          `
      SELECT
        CASE
          WHEN f.departure_airport = ? THEN arr.name
          ELSE dep.name
        END AS connected_airport,
        CASE
          WHEN f.departure_airport = ? THEN arr.city
          ELSE dep.city
        END AS connected_city,
        CASE
          WHEN f.departure_airport = ? THEN arr.country
          ELSE dep.country
        END AS connected_country,
        COUNT(DISTINCT f.flight_id) AS flights,
        COUNT(t.ticket_id) AS passengers,
        SUM(t.price) AS revenue
      FROM flights f
      JOIN airports dep ON f.departure_airport = dep.airport_id
      JOIN airports arr ON f.arrival_airport = arr.airport_id
      LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
      WHERE (f.departure_airport = ? OR f.arrival_airport = ?)
        AND f.departure_time BETWEEN ? AND ?
      GROUP BY connected_airport, connected_city, connected_country
      ORDER BY revenue DESC
      LIMIT 5
    `,
          [
            airportId,
            airportId,
            airportId,
            airportId,
            airportId,
            dateRange.start,
            dateRange.end,
          ]
        ),
      ])

      if (!airportDetails.length) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AIRPORT_NOT_FOUND',
            message: 'Airport not found',
          },
        })
      }

      return res.json({
        success: true,
        period,
        dateRange: {
          start: dateRange.start,
          end: dateRange.end,
        },
        airport: airportDetails[0],
        performance: performanceStats[0],
        flightStatus: flightStats,
        revenueTrends,
        topAirlines,
        topRoutes,
      })
    } catch (error) {
      console.error(`Airport Performance Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'AIRPORT_PERFORMANCE_ERROR',
          message: 'Failed to load airport performance data',
          details: error.message,
        },
      })
    }
  }

  async getAirlinePerformance(req, res) {
    try {
      const { airlineId } = req.params
      const {
        period = 'month',
        timezone = 'UTC',
        limit = 30,
        offset = 0,
      } = req.query

      // Validate inputs
      if (!airlineId || isNaN(airlineId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Valid airlineId is required',
          },
        })
      }

      // Validate period
      const validPeriods = ['day', 'week', 'month', 'year', 'all']
      if (!validPeriods.includes(period.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PERIOD',
            message: `Period must be one of: ${validPeriods.join(', ')}`,
          },
        })
      }

      // Calculate date range with timezone consideration
      let dateRange
      const now = new Date(
        new Date().toLocaleString('en-US', { timeZone: timezone })
      )

      switch (period.toLowerCase()) {
        case 'day':
          dateRange = {
            start: new Date(now.setHours(0, 0, 0, 0)),
            end: new Date(now.setHours(23, 59, 59, 999)),
          }
          break
        case 'week':
          const startOfWeek = new Date(now)
          startOfWeek.setDate(now.getDate() - now.getDay())
          dateRange = {
            start: new Date(startOfWeek.setHours(0, 0, 0, 0)),
            end: new Date(
              new Date(startOfWeek).setDate(startOfWeek.getDate() + 6)
            ),
          }
          break
        case 'month':
          dateRange = {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
          }
          break
        case 'year':
          dateRange = {
            start: new Date(now.getFullYear(), 0, 1),
            end: new Date(now.getFullYear(), 11, 31),
          }
          break
        default: // 'all'
          dateRange = {
            start: new Date(now.getFullYear() - 5, 0, 1),
            end: new Date(),
          }
      }

      const queryLimit = parseInt(limit) || 30
      const queryOffset = parseInt(offset) || 0

      const [
        [airlineDetails],
        [performanceStats],
        [flightStats],
        [revenueTrends],
        [topRoutes],
        [topAirports],
        [customerStats],
        [fleetUtilization],

        [delayAnalysis],
      ] = await Promise.all([
        // Airline details query (cached as it rarely changes)
        pool.query(
          `SELECT 
            airline_id, name, code, contact, email, 
             is_active, created_at, updated_at
           FROM airlines 
           WHERE airline_id = ?`,
          [airlineId]
        ),

        // Optimized performance statistics query
        pool.query(
          `SELECT 
            COUNT(DISTINCT f.flight_id) AS total_flights,
            SUM(f.status = 'Arrived') AS flights_completed,
            SUM(f.status = 'Canceled') AS flights_canceled,
            SUM(f.status = 'Delayed') AS flights_delayed,
            COUNT(DISTINCT t.ticket_id) AS tickets_sold,
            IFNULL(SUM(t.price), 0) AS total_revenue,
            IFNULL(AVG(r.rating), 0) AS avg_rating,
            COUNT(r.review_id) AS total_reviews,
            COUNT(DISTINCT ap.airport_id) AS airports_served,
            COUNT(DISTINCT ap.country) AS countries_served,
            COUNT(DISTINCT p.passenger_id) AS unique_passengers,
            IFNULL(AVG(TIMESTAMPDIFF(MINUTE, f.departure_time, f.arrival_time)), 0) AS avg_flight_duration
          FROM airlines a
          LEFT JOIN flights f ON a.airline_id = f.airline_id 
            AND f.departure_time BETWEEN ? AND ?
          LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
          LEFT JOIN reviews r ON f.flight_id = r.flight_id
          LEFT JOIN airports ap ON f.departure_airport = ap.airport_id 
            OR f.arrival_airport = ap.airport_id
          LEFT JOIN passengers p ON t.passenger_id = p.passenger_id
          WHERE a.airline_id = ?`,
          [dateRange.start, dateRange.end, airlineId]
        ),

        // Flight statistics with optimized subquery
        pool.query(
          `SELECT 
            f.status,
            COUNT(*) AS count,
            ROUND(COUNT(*) * 100.0 / (
              SELECT COUNT(*) 
              FROM flights 
              WHERE airline_id = ?
              AND departure_time BETWEEN ? AND ?
            ), 2) AS percentage
          FROM flights f
          WHERE f.airline_id = ?
            AND f.departure_time BETWEEN ? AND ?
          GROUP BY f.status`,
          [
            airlineId,
            dateRange.start,
            dateRange.end,
            airlineId,
            dateRange.start,
            dateRange.end,
          ]
        ),

        // Revenue trends with dynamic grouping based on period
        pool.query(
          `SELECT 
            ${
              period === 'day'
                ? "DATE_FORMAT(f.departure_time, '%Y-%m-%d %H:00') AS time_period"
                : period === 'week'
                  ? "DATE_FORMAT(f.departure_time, '%Y-%u') AS time_period"
                  : period === 'month'
                    ? "DATE_FORMAT(f.departure_time, '%Y-%m') AS time_period"
                    : "DATE_FORMAT(f.departure_time, '%Y-%m-%d') AS time_period"
            },
            IFNULL(SUM(t.price), 0) AS revenue,
            COUNT(DISTINCT f.flight_id) AS flights,
            COUNT(t.ticket_id) AS passengers,
            IFNULL(AVG(r.rating), 0) AS avg_rating
          FROM flights f
          JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
          LEFT JOIN reviews r ON f.flight_id = r.flight_id
          WHERE f.airline_id = ?
            AND f.departure_time BETWEEN ? AND ?
          GROUP BY time_period
          ORDER BY time_period ASC
          LIMIT ? OFFSET ?`,
          [airlineId, dateRange.start, dateRange.end, queryLimit, queryOffset]
        ),

        // Top routes with optimized joins and ratings
        pool.query(
          `SELECT 
            dep.airport_id AS departure_airport_id,
            dep.name AS departure_airport,
            dep.city AS departure_city,
            arr.airport_id AS arrival_airport_id,
            arr.name AS arrival_airport,
            arr.city AS arrival_city,
            COUNT(DISTINCT f.flight_id) AS flights,
            COUNT(t.ticket_id) AS passengers,
            IFNULL(SUM(t.price), 0) AS revenue,
            IFNULL(AVG(r.rating), 0) AS avg_rating,
            COUNT(r.review_id) AS review_count
          FROM flights f
          JOIN airports dep ON f.departure_airport = dep.airport_id
          JOIN airports arr ON f.arrival_airport = arr.airport_id
          LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
          LEFT JOIN reviews r ON f.flight_id = r.flight_id
          WHERE f.airline_id = ?
            AND f.departure_time BETWEEN ? AND ?
          GROUP BY 
            departure_airport_id, departure_airport, departure_city,
            arrival_airport_id, arrival_airport, arrival_city
          ORDER BY revenue DESC
          LIMIT 5`,
          [airlineId, dateRange.start, dateRange.end]
        ),

        // Top airports with detailed stats
        pool.query(
          `SELECT 
            ap.airport_id,
            ap.name AS airport_name,
            ap.city,
            ap.country,
            COUNT(DISTINCT CASE 
              WHEN f.departure_airport = ap.airport_id THEN f.flight_id 
            END) AS departures,
            COUNT(DISTINCT CASE 
              WHEN f.arrival_airport = ap.airport_id THEN f.flight_id 
            END) AS arrivals,
            COUNT(t.ticket_id) AS passengers,
            IFNULL(SUM(t.price), 0) AS revenue,
            IFNULL(AVG(r.rating), 0) AS avg_rating
          FROM airports ap
          JOIN flights f ON ap.airport_id = f.departure_airport 
            OR ap.airport_id = f.arrival_airport
          LEFT JOIN tickets t ON f.flight_id = t.flight_id AND t.status = 'Confirmed'
          LEFT JOIN reviews r ON f.flight_id = r.flight_id
          WHERE f.airline_id = ?
            AND f.departure_time BETWEEN ? AND ?
          GROUP BY ap.airport_id
          ORDER BY revenue DESC
          LIMIT 5`,
          [airlineId, dateRange.start, dateRange.end]
        ),

        // Customer statistics with segmentation
        pool.query(
          `SELECT 
            COUNT(DISTINCT p.passenger_id) AS unique_passengers,
            COUNT(DISTINCT p.user_id) AS registered_customers,
            IFNULL(AVG(t.price), 0) AS avg_ticket_price,
            COUNT(DISTINCT r.review_id) AS customers_reviewed,
            IFNULL(AVG(r.rating), 0) AS avg_customer_rating,
            COUNT(DISTINCT CASE 
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 18 AND 24 THEN p.passenger_id 
            END) AS age_18_24,
            COUNT(DISTINCT CASE 
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 25 AND 34 THEN p.passenger_id 
            END) AS age_25_34,
            COUNT(DISTINCT CASE 
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 35 AND 44 THEN p.passenger_id 
            END) AS age_35_44,
            COUNT(DISTINCT CASE 
              WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) >= 45 THEN p.passenger_id 
            END) AS age_45_plus
          FROM passengers p
          JOIN tickets t ON p.passenger_id = t.passenger_id
          JOIN flights f ON t.flight_id = f.flight_id
          LEFT JOIN reviews r ON f.flight_id = r.flight_id AND r.user_id = p.user_id
          WHERE f.airline_id = ?
            AND t.status = 'Confirmed'
            AND f.departure_time BETWEEN ? AND ?`,
          [airlineId, dateRange.start, dateRange.end]
        ),

        pool.query(
          `SELECT 
           
            COUNT(DISTINCT f.flight_id) AS flights,
            SUM(s.is_booked = TRUE) AS booked_seats,
            SUM(s.is_booked = FALSE) AS available_seats,
            ROUND(SUM(s.is_booked = TRUE) * 100.0 / COUNT(s.seat_id), 2) AS utilization_rate,
            IFNULL(AVG(s.price), 0) AS avg_ticket_price,
            IFNULL(AVG(r.rating), 0) AS avg_rating
          FROM flights f
          JOIN seats s ON f.flight_id = s.flight_id
          LEFT JOIN reviews r ON f.flight_id = r.flight_id
          WHERE f.airline_id = ?
            AND f.departure_time BETWEEN ? AND ?
      
          ORDER BY utilization_rate DESC
          LIMIT 5`,
          [airlineId, dateRange.start, dateRange.end]
        ),

        // Cancellation analysis
        pool.query(
          `SELECT 
            
            COUNT(*) AS count,
            ROUND(COUNT(*) * 100.0 / (
              SELECT COUNT(*) FROM flights 
              WHERE airline_id = ? 
              AND status = 'Canceled'
              AND departure_time BETWEEN ? AND ?
            ), 2) AS percentage,
            AVG(TIMESTAMPDIFF(HOUR, f.departure_time, f.updated_at)) AS avg_hours_before_departure
          FROM flights f
          WHERE f.airline_id = ?
            AND f.status = 'Canceled'
            AND f.departure_time BETWEEN ? AND ?
         
          ORDER BY count DESC`,
          [
            airlineId,
            dateRange.start,
            dateRange.end,
            airlineId,
            dateRange.start,
            dateRange.end,
          ]
        ),
      ])

      if (!airlineDetails.length) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AIRLINE_NOT_FOUND',
            message: 'Airline not found',
          },
        })
      }

      // Get total count for revenue trends pagination
      const [[{ revenueTrendsTotal }]] = await pool.query(
        `SELECT COUNT(DISTINCT 
          ${
            period === 'day'
              ? "DATE_FORMAT(f.departure_time, '%Y-%m-%d %H:00')"
              : period === 'week'
                ? "DATE_FORMAT(f.departure_time, '%Y-%u')"
                : period === 'month'
                  ? "DATE_FORMAT(f.departure_time, '%Y-%m')"
                  : "DATE_FORMAT(f.departure_time, '%Y-%m-%d')"
          }) AS revenueTrendsTotal
         FROM flights f
         WHERE f.airline_id = ?
           AND f.departure_time BETWEEN ? AND ?`,
        [airlineId, dateRange.start, dateRange.end]
      )

      // Prepare response with metadata
      const response = {
        success: true,
        meta: {
          period,
          timezone,
          dateRange: {
            start: dateRange.start,
            end: dateRange.end,
          },
          pagination: {
            limit: queryLimit,
            offset: queryOffset,
            total: revenueTrendsTotal,
          },
        },
        data: {
          airline: airlineDetails[0],
          performance: performanceStats[0],
          flightStatus: flightStats,
          revenueTrends,
          topRoutes,
          topAirports,
          customerStats: customerStats[0],
          fleetUtilization,

          delayAnalysis,
        },
      }

      return res.json(response)
    } catch (error) {
      console.error(`Airline Performance Error: ${error.message}`)
      console.error(error.stack)

      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to load airline performance data',
          details:
            process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
      })
    }
  }
  // ---------------------------
  // AIRLINE CRUD OPERATIONS
  // ---------------------------

  async createAirline(req, res) {
    try {
      const schema = Joi.object({
        name: Joi.string().required().messages({
          'string.empty': 'Airline name is required',
          'any.required': 'Airline name is required',
        }),
        code: Joi.string().length(2).uppercase().required().messages({
          'string.length': 'Airline code must be exactly 2 characters',
          'string.empty': 'Airline code is required',
          'any.required': 'Airline code is required',
        }),
        contact: Joi.string().optional(),
        email: Joi.string().email().optional().messages({
          'string.email': 'Please provide a valid email address',
        }),
        is_active: Joi.boolean().default(true),
      }).options({ abortEarly: false })

      const { error } = schema.validate(req.body)
      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path[0],
          message: detail.message,
        }))
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            errors: errors,
          },
        })
      }

      const airlineId = await Airline.create(req.body)
      logger.info(`Airline created: ${airlineId}`)
      return res.status(201).json({
        success: true,
        airlineId,
      })
    } catch (error) {
      logger.error(`Create Airline Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: error.code || 'CREATE_AIRLINE_ERROR',
          message: error.message.includes('unique constraint')
            ? 'An airline with this code already exists'
            : error.message,
        },
      })
    }
  }
  async getAirlines(req, res) {
    try {
      const { search = '', status = '' } = req.query

      let query = 'SELECT * FROM airlines'
      let whereClauses = []
      let params = []

      // Add search filter
      if (search) {
        whereClauses.push('(name LIKE ? OR code LIKE ?)')
        params.push(`%${search}%`, `%${search}%`)
      }

      // Add status filter
      if (status) {
        whereClauses.push('status = ?')
        params.push(status)
      }

      // Build final query
      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ')
      }

      query += ' ORDER BY name ASC' // Optional sorting

      const [rows] = await pool.query(query, params)

      return res.json({
        success: true,
        data: rows,
      })
    } catch (error) {
      logger.error(`Get Airlines Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_AIRLINES_ERROR',
          message: error.message,
        },
      })
    }
  }

  async getAirlineDetails(req, res) {
    try {
      const airline = await Airline.findById(req.params.id)
      if (!airline) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AIRLINE_NOT_FOUND',
            message: 'Airline not found',
          },
        })
      }
      return res.json({
        success: true,
        airline,
      })
    } catch (error) {
      logger.error(`Get Airline Details Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_AIRLINE_DETAILS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async updateAirline(req, res) {
    try {
      const schema = Joi.object({
        name: Joi.string().optional().messages({
          'string.empty': 'Airline name cannot be empty',
        }),
        code: Joi.string().length(2).uppercase().optional().messages({
          'string.length': 'Airline code must be exactly 2 characters',
          'string.empty': 'Airline code cannot be empty',
        }),
        contact: Joi.string().optional(),
        email: Joi.string().email().optional().messages({
          'string.email': 'Please provide a valid email address',
        }),
        is_active: Joi.boolean().optional(),
      }).options({ abortEarly: false })

      const { error } = schema.validate(req.body)
      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path[0],
          message: detail.message,
        }))
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            errors: errors,
          },
        })
      }

      const updated = await Airline.update(req.params.id, req.body)
      if (!updated) {
        throw new Error('Airline not found')
      }

      logger.info(`Airline updated: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Airline updated successfully',
        airline: updated,
      })
    } catch (error) {
      logger.error(`Update Airline Error: ${error.message}`)

      let statusCode = 400
      let errorCode = 'UPDATE_AIRLINE_ERROR'
      let message = error.message

      if (error.message.includes('unique constraint')) {
        errorCode = 'DUPLICATE_CODE'
        message = 'An airline with this code already exists'
      } else if (error.message.includes('not found')) {
        statusCode = 404
        errorCode = 'AIRLINE_NOT_FOUND'
      }

      return res.status(statusCode).json({
        success: false,
        error: { code: errorCode, message },
      })
    }
  }

  async deleteAirline(req, res) {
    try {
      const deleted = await Airline.hardDelete(req.params.id)
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AIRLINE_NOT_FOUND',
            message: 'Airline not found',
          },
        })
      }

      logger.info(`Airline deleted: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Airline deleted successfully',
      })
    } catch (error) {
      logger.error(`Delete Airline Error: ${error.message}`)

      let statusCode = 400
      let errorCode = 'DELETE_AIRLINE_ERROR'
      let message = error.message

      if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        errorCode = 'HAS_ACTIVE_FLIGHTS'
        message = 'Cannot delete airline because it has associated flights'
        statusCode = 409 // Conflict
      }

      return res.status(statusCode).json({
        success: false,
        error: { code: errorCode, message },
      })
    }
  }

  async softDeleteAirline(req, res) {
    try {
      const airline = await Airline.softDelete(req.params.id)
      if (!airline) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AIRLINE_NOT_FOUND',
            message: 'Airline not found',
          },
        })
      }

      logger.info(`Airline soft deleted: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Airline deactivated successfully',
        airline,
      })
    } catch (error) {
      logger.error(`Soft Delete Airline Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'SOFT_DELETE_AIRLINE_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Bulk Operations for Airlines
  async bulkCreateAirlines(req, res) {
    try {
      const airlines = req.body
      const results = await Promise.all(
        airlines.map(async (airline) => {
          try {
            const airlineId = await Airline.create(airline)
            return { success: true, airlineId }
          } catch (error) {
            return { success: false, error: error.message }
          }
        })
      )

      logger.info(`Bulk airlines created: ${results.length}`)
      return res.status(201).json({
        success: true,
        results,
      })
    } catch (error) {
      logger.error(`Bulk Create Airlines Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'BULK_CREATE_AIRLINES_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Export Airlines to CSV
  async exportAirlines(req, res) {
    try {
      const airlines = await Airline.getAllPaginated({ page: 1, limit: 1000 })
      const csvWriter = csv({
        path: 'airlines.csv',
        header: [
          { id: 'airline_id', title: 'Airline ID' },
          { id: 'name', title: 'Name' },
          { id: 'code', title: 'Code' },
          { id: 'is_active', title: 'Is Active' },
        ],
      })

      await csvWriter.writeRecords(airlines.data)
      res.download('airlines.csv')
    } catch (error) {
      logger.error(`Export Airlines Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_AIRLINES_ERROR',
          message: error.message,
        },
      })
    }
  }

  // ---------------------------
  // AIRPORT CRUD OPERATIONS
  // ---------------------------

  async createAirport(req, res) {
    try {
      const schema = Joi.object({
        name: Joi.string().required().messages({
          'string.empty': 'Airport name is required',
          'any.required': 'Airport name is required',
        }),
        code: Joi.string().length(3).uppercase().required().messages({
          'string.length': 'Airport code must be exactly 3 characters',
          'string.empty': 'Airport code is required',
          'any.required': 'Airport code is required',
        }),
        city: Joi.string().required().messages({
          'string.empty': 'City is required',
          'any.required': 'City is required',
        }),
        country: Joi.string().required().messages({
          'string.empty': 'Country is required',
          'any.required': 'Country is required',
        }),
        is_active: Joi.boolean().default(true),
      }).options({ abortEarly: false })

      const { error } = schema.validate(req.body)
      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path[0],
          message: detail.message,
        }))
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            errors: errors,
          },
        })
      }

      const airportId = await Airport.create(req.body)
      logger.info(`Airport created: ${airportId}`)
      return res.status(201).json({
        success: true,
        airportId,
      })
    } catch (error) {
      logger.error(`Create Airport Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: error.code || 'CREATE_AIRPORT_ERROR',
          message: error.message.includes('unique constraint')
            ? 'An airport with this code already exists'
            : error.message,
        },
      })
    }
  }
  async getAirports(req, res) {
    try {
      const { search = '', country = '', city = '' } = req.query

      let query = 'SELECT * FROM airports'
      let whereClauses = []
      let params = []

      // Add search filter
      if (search) {
        whereClauses.push(
          '(name LIKE ? OR code LIKE ? OR city LIKE ? OR country LIKE ?)'
        )
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
      }

      // Add country filter
      if (country) {
        whereClauses.push('country LIKE ?')
        params.push(`%${country}%`)
      }

      // Add city filter
      if (city) {
        whereClauses.push('city LIKE ?')
        params.push(`%${city}%`)
      }

      // Finalize query
      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ')
      }

      query += ' ORDER BY name ASC' // Optional: sort alphabetically by airport name

      const [rows] = await pool.query(query, params)

      return res.json({
        success: true,
        data: rows,
      })
    } catch (error) {
      logger.error(`Get Airports Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_AIRPORTS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async getAirportDetails(req, res) {
    try {
      const airport = await Airport.findById(req.params.id)
      if (!airport) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AIRPORT_NOT_FOUND',
            message: 'Airport not found',
          },
        })
      }
      return res.json({
        success: true,
        airport,
      })
    } catch (error) {
      logger.error(`Get Airport Details Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_AIRPORT_DETAILS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async updateAirport(req, res) {
    try {
      const schema = Joi.object({
        name: Joi.string().optional(),
        code: Joi.string().length(3).uppercase().optional(),
        city: Joi.string().optional(),
        country: Joi.string().optional(),
        is_active: Joi.boolean().optional(),
      })

      const { error } = schema.validate(req.body)
      if (error) {
        throw new Error(error.details[0].message)
      }

      await Airport.update(req.params.id, req.body)
      logger.info(`Airport updated: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Airport updated successfully',
      })
    } catch (error) {
      logger.error(`Update Airport Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_AIRPORT_ERROR',
          message: error.message,
        },
      })
    }
  }

  async deleteAirport(req, res) {
    try {
      await Airport.hardDelete(req.params.id)
      logger.info(`Airport deleted: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Airport deleted successfully',
      })
    } catch (error) {
      logger.error(`Delete Airport Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code:
            error.code === 'ER_ROW_IS_REFERENCED_2'
              ? 'HAS_ACTIVE_FLIGHTS'
              : 'DELETE_AIRPORT_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Bulk Operations for Airports
  async bulkCreateAirports(req, res) {
    try {
      const airports = req.body
      const results = await Promise.all(
        airports.map(async (airport) => {
          try {
            const airportId = await Airport.create(airport)
            return { success: true, airportId }
          } catch (error) {
            return { success: false, error: error.message }
          }
        })
      )

      logger.info(`Bulk airports created: ${results.length}`)
      return res.status(201).json({
        success: true,
        results,
      })
    } catch (error) {
      logger.error(`Bulk Create Airports Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'BULK_CREATE_AIRPORTS_ERROR',
          message: error.message,
        },
      })
    }
  }
  async softDeleteAirport(req, res) {
    try {
      await Airport.softDelete(req.params.id)
      logger.info(`Airport soft deleted: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Airport soft deleted successfully',
      })
    } catch (error) {
      logger.error(`Soft Delete Airport Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'SOFT_DELETE_AIRPORT_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Export Airports to Excel
  async exportAirports(req, res) {
    try {
      // Fetch airports data
      const airports = await Airport.search({ page: 1, limit: 1000 })

      // Create a new Excel workbook and worksheet
      const workbook = new exceljs.Workbook()
      const worksheet = workbook.addWorksheet('Airports')

      // Define worksheet columns
      worksheet.columns = [
        { header: 'Airport ID', key: 'airport_id' },
        { header: 'Name', key: 'name' },
        { header: 'Code', key: 'code' },
        { header: 'City', key: 'city' },
        { header: 'Country', key: 'country' },
      ]

      // Add rows to the worksheet
      airports.data.forEach((airport) => worksheet.addRow(airport))

      // Set response headers for file download
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', 'attachment; filename=airports.xlsx')

      // Stream the workbook to the response
      await workbook.xlsx.write(res)

      // End the response
      res.end()
    } catch (error) {
      logger.error(`Export Airports Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_AIRPORTS_ERROR',
          message: error.message,
        },
      })
    }
  }
  // ---------------------------
  // FLIGHT CRUD OPERATIONS
  // ---------------------------
  async createFlight(req, res) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const schema = Joi.object({
        flight_number: Joi.string().required(),
        departure_airport: Joi.number().required(),
        arrival_airport: Joi.number().required(),
        departure_time: Joi.string().isoDate().required(),
        arrival_time: Joi.string().isoDate().required(),
        total_seats: Joi.number().min(1).required(),
        airline_id: Joi.number().required(),
        pricing: Joi.object({
          Economy: Joi.object({
            base_price: Joi.number().positive().required(),
            ceil_price: Joi.number()
              .positive()
              .min(Joi.ref('base_price'))
              .required(),
          }).required(),
          Business: Joi.object({
            base_price: Joi.number().positive().required(),
            ceil_price: Joi.number()
              .positive()
              .min(Joi.ref('base_price'))
              .required(),
          }).required(),
          First: Joi.object({
            base_price: Joi.number().positive().required(),
            ceil_price: Joi.number()
              .positive()
              .min(Joi.ref('base_price'))
              .required(),
          }).required(),
        }).required(),
      })

      // Enhanced validation with all errors
      const { error } = schema.validate(req.body, { abortEarly: false })
      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message.replace(/"/g, ''),
        }))
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            errors: errors,
          },
        })
      }

      // Date conversion
      const departureTime = new Date(req.body.departure_time)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '')
      const arrivalTime = new Date(req.body.arrival_time)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '')

      req.body.departure_time = departureTime
      req.body.arrival_time = arrivalTime

      // Create flight
      const flightId = await Flight.create(req.body, conn)
      logger.info(`Flight created with ID: ${flightId}`)
      await conn.commit()

      return res.status(201).json({
        success: true,
        flightId,
      })
    } catch (error) {
      await conn.rollback()
      logger.error(`Create Flight Error: ${error.message}`)

      return res.status(400).json({
        success: false,
        error: {
          code: error.code || 'CREATE_FLIGHT_ERROR',
          message: error.message,
          ...(error.errors && { errors: error.errors }),
        },
      })
    } finally {
      conn.release()
    }
  }
  async getFlights(req, res) {
    try {
      const {
        search = '',
        status = '',
        dateFrom = '1970-01-01',
        dateTo = '2100-12-31',
      } = req.query

      let query = 'SELECT * FROM flights'
      let whereClauses = []
      let params = []

      const allowedStatuses = ['Scheduled', 'Delayed', 'Departed']

      // Search filter
      if (search) {
        whereClauses.push('flight_number LIKE ?')
        params.push(`%${search}%`)
      }

      // Status filter
      if (status) {
        if (allowedStatuses.includes(status)) {
          whereClauses.push('status = ?')
          params.push(status)
        } else {
          throw new Error(
            'Invalid status. Only "Scheduled", "Delayed", and "Departed" are allowed.'
          )
        }
      } else {
        whereClauses.push('status IN (?, ?, ?)')
        params.push(...allowedStatuses)
      }

      // Date range filter
      whereClauses.push('departure_time BETWEEN ? AND ?')
      params.push(dateFrom, dateTo)

      // Build final query
      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ')
      }

      query += ' ORDER BY departure_time ASC'

      const [rows] = await pool.query(query, params)

      return res.json({
        success: true,
        data: rows,
      })
    } catch (error) {
      logger.error(`Get Flights Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_FLIGHTS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async getFlightDetails(req, res) {
    try {
      const flight = await Flight.findById(req.params.id)
      if (!flight) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'FLIGHT_NOT_FOUND',
            message: 'Flight not found',
          },
        })
      }
      return res.json({
        success: true,
        flight,
      })
    } catch (error) {
      logger.error(`Get Flight Details Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_FLIGHT_DETAILS_ERROR',
          message: error.message,
        },
      })
    }
  }
  async cancelFlightStatus(req, res) {
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      // Fetch the current flight status
      const [currentFlight] = await conn.query(
        `SELECT status FROM flights WHERE flight_id = ? FOR UPDATE`,
        [req.params.id]
      )

      if (!currentFlight.length) {
        throw new Error('Flight not found')
      }

      const currentStatus = currentFlight[0].status

      const allowedStatuses = ['Scheduled', 'Delayed']
      if (!allowedStatuses.includes(currentStatus)) {
        throw new Error(`Cannot cancel flight with status: ${currentStatus}`)
      }

      const [result] = await conn.query(
        `UPDATE flights
       SET status = 'Canceled', available_seats = total_seats
       WHERE flight_id = ?`,
        [req.params.id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Flight not found or already canceled')
      }

      // ✅ Cancel associated tickets and make seats available again
      await conn.query(
        `UPDATE tickets
       SET status = 'Cancelled'
       WHERE flight_id = ? AND status = 'Confirmed'`,
        [req.params.id]
      )

      await conn.query(
        `UPDATE seats
       SET is_booked = FALSE
       WHERE flight_id = ?`,
        [req.params.id]
      )

      await conn.commit()

      res.json({
        success: true,
        message: 'Flight status changed to Canceled successfully',
      })
    } catch (error) {
      await conn.rollback()
      res.status(400).json({
        success: false,
        error: {
          code: 'FLIGHT_CANCEL_ERROR',
          message: error.message,
        },
      })
    } finally {
      conn.release()
    }
  }

  async updateFlightStatus(req, res) {
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()
      const schema = Joi.object({
        departure_time: Joi.date().iso().required(),
        arrival_time: Joi.date().iso().required(),
      })

      const { error } = schema.validate(req.body)
      if (error) {
        throw new Error(error.details[0].message)
      }

      const { departure_time, arrival_time } = req.body

      if (new Date(departure_time) >= new Date(arrival_time)) {
        throw new Error('Departure time must be earlier than arrival time')
      }

      const [flight] = await conn.query(
        `SELECT * FROM flights 
       WHERE flight_id = ? 
         AND status NOT IN ('Arrived', 'Canceled','Departed') 
       FOR UPDATE`,
        [req.params.id]
      )

      if (flight.length === 0) {
        throw new Error('Flight not found or already completed')
      }

      const [result] = await conn.query(
        `UPDATE flights
       SET departure_time = ?, arrival_time = ?, status = 'Delayed'
       WHERE flight_id = ?`,
        [departure_time, arrival_time, req.params.id]
      )

      if (result.affectedRows === 0) {
        throw new Error('Flight not found or already completed')
      }

      await conn.commit()

      logger.info(`Flight ${req.params.id} updated to "Delayed" successfully`)

      res.json({
        success: true,
        message: 'Flight updated to "Delayed" successfully',
        flight_id: req.params.id,
      })
    } catch (error) {
      await conn.rollback()
      logger.error(`Flight update error: ${error.message}`)

      res.status(400).json({
        success: false,
        error: {
          code: 'FLIGHT_UPDATE_ERROR',
          message: error.message,
        },
      })
    } finally {
      conn.release()
    }
  }

  async deleteFlight(req, res) {
    try {
      await Flight.cancel(req.params.id)
      logger.info(`Flight canceled: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Flight canceled and refunds processed',
      })
    } catch (error) {
      logger.error(`Delete Flight Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'DELETE_FLIGHT_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Bulk Operations for Flights
  async bulkCreateFlights(req, res) {
    try {
      const flights = req.body
      const results = await Promise.all(
        flights.map(async (flight) => {
          try {
            const flightId = await Flight.create(flight)
            return { success: true, flightId }
          } catch (error) {
            return { success: false, error: error.message }
          }
        })
      )

      logger.info(`Bulk flights created: ${results.length}`)
      return res.status(201).json({
        success: true,
        results,
      })
    } catch (error) {
      logger.error(`Bulk Create Flights Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'BULK_CREATE_FLIGHTS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async getCanceledFlights(req, res) {
    try {
      const [flights] = await pool.query(
        `SELECT flight_id, flight_number, departure_airport, arrival_airport,total_seats,available_seats,
          departure_time, arrival_time, status
         FROM flights
         WHERE status = 'Canceled'`
      )

      return res.json({
        success: true,
        data: flights,
      })
    } catch (error) {
      logger.error(`Get Canceled Flights Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_CANCELED_FLIGHTS_ERROR',
          message: error.message,
        },
      })
    }
  }

  // ✅ Reschedule Canceled Flight
  async rescheduleFlight(req, res) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const { id } = req.params

      const schema = Joi.object({
        departure_airport: Joi.number().required(),
        arrival_airport: Joi.number().required(),
        departure_time: Joi.string().isoDate().required(),
        arrival_time: Joi.string().isoDate().required(),
      })

      const { error } = schema.validate(req.body)
      if (error) {
        throw new Error(`Validation failed: ${error.details[0].message}`)
      }

      // Fetch the flight to ensure it's canceled
      const [flight] = await conn.query(
        `SELECT * FROM flights WHERE flight_id = ? AND status = 'Canceled' FOR UPDATE`,
        [id]
      )

      if (flight.length === 0) {
        throw new Error('Flight not found or not canceled')
      }

      const {
        departure_time,
        arrival_time,
        departure_airport,
        arrival_airport,
      } = req.body

      const depTime = new Date(departure_time)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '')
      const arrTime = new Date(arrival_time)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '')

      await conn.query(
        `UPDATE flights
         SET departure_airport = ?, arrival_airport = ?, 
             departure_time = ?, arrival_time = ?, status = 'Scheduled'
         WHERE flight_id = ?`,
        [departure_airport, arrival_airport, depTime, arrTime, id]
      )

      await conn.commit()

      logger.info(`Flight rescheduled: ${id}`)
      return res.json({
        success: true,
        message: 'Flight rescheduled successfully',
      })
    } catch (error) {
      await conn.rollback()
      logger.error(`Reschedule Flight Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'RESCHEDULE_FLIGHT_ERROR',
          message: error.message,
        },
      })
    } finally {
      conn.release()
    }
  }

  // Export Flights to CSV
  async exportFlights(req, res) {
    try {
      const flights = await Flight.search({ page: 1, limit: 1000 })
      const csvWriter = csv({
        path: 'flights.csv',
        header: [
          { id: 'flight_id', title: 'Flight ID' },
          { id: 'flight_number', title: 'Flight Number' },
          { id: 'departure_airport', title: 'Departure Airport' },
          { id: 'arrival_airport', title: 'Arrival Airport' },
          { id: 'status', title: 'Status' },
        ],
      })

      await csvWriter.writeRecords(flights.data)
      res.download('flights.csv')
    } catch (error) {
      logger.error(`Export Flights Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_FLIGHTS_ERROR',
          message: error.message,
        },
      })
    }
  }

  // ---------------------------
  // DISCOUNT CRUD OPERATIONS
  // ---------------------------

  async createDiscount(req, res) {
    try {
      const schema = Joi.object({
        code: Joi.string().required().messages({
          'string.empty': 'Discount code is required',
          'any.required': 'Discount code is required',
        }),
        description: Joi.string().optional(),
        discount_percent: Joi.number().min(0).max(100).required().messages({
          'number.min': 'Discount must be at least 0%',
          'number.max': 'Discount cannot exceed 100%',
          'any.required': 'Discount percentage is required',
        }),
        max_uses: Joi.number().integer().min(1).optional().messages({
          'number.min': 'Max uses must be at least 1',
        }),
        valid_from: Joi.date().iso().required().messages({
          'date.base': 'Valid from date is required',
          'date.format': 'Valid from must be a valid ISO date',
        }),
        valid_until: Joi.date()
          .iso()
          .min(Joi.ref('valid_from'))
          .required()
          .messages({
            'date.base': 'Valid until date is required',
            'date.format': 'Valid until must be a valid ISO date',
            'date.min': 'Valid until must be after valid from date',
          }),
        is_active: Joi.boolean().default(true),
      }).options({ abortEarly: false })

      const { error } = schema.validate(req.body)
      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path[0],
          message: detail.message,
        }))
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            errors: errors,
          },
        })
      }

      const validFrom = new Date(req.body.valid_from)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ')
      const validUntil = new Date(req.body.valid_until)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ')

      const discountId = await Discount.create({
        ...req.body,
        valid_from: validFrom,
        valid_until: validUntil,
      })

      logger.info(`Discount created: ${discountId}`)
      return res.status(201).json({
        success: true,
        discountId,
      })
    } catch (error) {
      logger.error(`Create Discount Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: error.code || 'CREATE_DISCOUNT_ERROR',
          message: error.message.includes('unique constraint')
            ? 'A discount with this code already exists'
            : error.message,
        },
      })
    }
  }
  async getDiscounts(req, res) {
    try {
      const { page = 1, limit = 20, search = '', active } = req.query
      const offset = (parseInt(page) - 1) * parseInt(limit)

      const params = []
      const conditions = []

      // Add search conditions
      if (search) {
        conditions.push(`(code LIKE ? OR description LIKE ?)`)
        params.push(`%${search}%`, `%${search}%`)
      }

      // Add active filter condition if provided
      if (active !== undefined) {
        conditions.push(`is_active = ?`)
        params.push(active === 'true' ? 1 : 0)
      }

      // Build query dynamically based on filters
      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const [rows] = await pool.query(
        `SELECT * FROM discounts 
       ${whereClause}
       LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), parseInt(offset)]
      )

      const [count] = await pool.query(
        `SELECT COUNT(*) AS total FROM discounts 
       ${whereClause}`,
        params
      )

      return res.json({
        success: true,
        data: rows,
        pagination: {
          total: count[0].total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count[0].total / limit),
        },
      })
    } catch (error) {
      logger.error(`Get Discounts Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_DISCOUNTS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async getDiscountDetails(req, res) {
    try {
      const discount = await Discount.findById(req.params.id)
      if (!discount) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DISCOUNT_NOT_FOUND',
            message: 'Discount not found',
          },
        })
      }
      return res.json({
        success: true,
        discount,
      })
    } catch (error) {
      logger.error(`Get Discount Details Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_DISCOUNT_DETAILS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async updateDiscount(req, res) {
    try {
      const schema = Joi.object({
        code: Joi.string().optional(),
        description: Joi.string().optional(),
        discount_percent: Joi.number().min(0).max(100).optional(),
        max_uses: Joi.number().optional(),
        valid_from: Joi.date().iso().optional(),
        valid_until: Joi.date().iso().optional(),
        is_active: Joi.boolean().optional(),
      })

      const { error } = schema.validate(req.body)
      if (error) {
        throw new Error(error.details[0].message)
      }

      await Discount.update(req.params.id, req.body)
      logger.info(`Discount updated: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Discount updated successfully',
      })
    } catch (error) {
      logger.error(`Update Discount Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_DISCOUNT_ERROR',
          message: error.message,
        },
      })
    }
  }

  async deleteDiscount(req, res) {
    try {
      await Discount.hardDelete(req.params.id)
      logger.info(`Discount deleted: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Discount deleted successfully',
      })
    } catch (error) {
      logger.error(`Delete Discount Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'DELETE_DISCOUNT_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Bulk Operations for Discounts
  async bulkCreateDiscounts(req, res) {
    try {
      const discounts = req.body

      // Validate that req.body is an array
      if (!Array.isArray(discounts)) {
        throw new Error('Request body must be an array of discounts')
      }

      const results = await Promise.all(
        discounts.map(async (discount) => {
          try {
            const discountId = await Discount.create(discount)
            return { success: true, discountId }
          } catch (error) {
            return { success: false, error: error.message }
          }
        })
      )

      logger.info(`Bulk discounts created: ${results.length}`)
      return res.status(201).json({
        success: true,
        results,
      })
    } catch (error) {
      logger.error(`Bulk Create Discounts Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'BULK_CREATE_DISCOUNTS_ERROR',
          message: error.message,
        },
      })
    }
  }
  // Export Discounts to Excel
  async exportDiscounts(req, res) {
    try {
      const discounts = await Discount.search({ page: 1, limit: 1000 })
      const workbook = new exceljs.Workbook()
      const worksheet = workbook.addWorksheet('Discounts')
      worksheet.columns = [
        { header: 'Discount ID', key: 'discount_id' },
        { header: 'Code', key: 'code' },
        { header: 'Discount Percent', key: 'discount_percent' },
        { header: 'Valid From', key: 'valid_from' },
        { header: 'Valid Until', key: 'valid_until' },
      ]

      discounts.data.forEach((discount) => worksheet.addRow(discount))
      await workbook.xlsx.writeFile('discounts.xlsx')
      res.download('discounts.xlsx')
    } catch (error) {
      logger.error(`Export Discounts Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_DISCOUNTS_ERROR',
          message: error.message,
        },
      })
    }
  }

  // ---------------------------
  // USER CRUD OPERATIONS
  // ---------------------------

  async getUsers(req, res) {
    try {
      const { search = '', role } = req.query

      const params = []
      const conditions = []

      // Add search conditions if provided
      if (search) {
        conditions.push(`(username LIKE ? OR email LIKE ?)`)
        params.push(`%${search}%`, `%${search}%`)
      }

      // Add role filter condition if provided
      if (role) {
        conditions.push(`role = ?`)
        params.push(role)
      }

      // Build dynamic WHERE clause
      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // Fetch all matching user data
      const [rows] = await pool.query(
        `SELECT * FROM users ${whereClause}`,
        params
      )

      return res.json({
        success: true,
        data: rows,
      })
    } catch (error) {
      logger.error(`Get Users Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_USERS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async updateUserRole(req, res) {
    try {
      const schema = Joi.object({
        role: Joi.string().valid('user', 'admin').required(),
      })

      const { error } = schema.validate(req.body)
      if (error) {
        throw new Error(error.details[0].message)
      }

      await User.update(req.params.id, { role: req.body.role })
      logger.info(`User role updated: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'User role updated',
      })
    } catch (error) {
      logger.error(`Update User Role Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_USER_ROLE_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Bulk Operations for Users
  async bulkUpdateUserRoles(req, res) {
    try {
      const users = req.body
      const results = await Promise.all(
        users.map(async (user) => {
          try {
            await User.update(user.id, { role: user.role })
            return { success: true, userId: user.id }
          } catch (error) {
            return { success: false, error: error.message }
          }
        })
      )

      logger.info(`Bulk user roles updated: ${results.length}`)
      return res.json({
        success: true,
        results,
      })
    } catch (error) {
      logger.error(`Bulk Update User Roles Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'BULK_UPDATE_USER_ROLES_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Export Users to CSV
  async exportUsers(req, res) {
    try {
      const users = await User.search({ page: 1, limit: 1000 })
      const csvWriter = csv({
        path: 'users.csv',
        header: [
          { id: 'user_id', title: 'User ID' },
          { id: 'username', title: 'Username' },
          { id: 'email', title: 'Email' },
          { id: 'role', title: 'Role' },
        ],
      })

      await csvWriter.writeRecords(users.data)
      res.download('users.csv')
    } catch (error) {
      logger.error(`Export Users Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_USERS_ERROR',
          message: error.message,
        },
      })
    }
  }
  async softDeleteUser(req, res) {
    try {
      await User.softDelete(req.params.id)
      logger.info(`User soft deleted: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'User soft deleted successfully',
      })
    } catch (error) {
      logger.error(`Soft Delete User Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'SOFT_DELETE_USER_ERROR',
          message: error.message,
        },
      })
    }
  }

  // ---------------------------
  // TICKET CRUD OPERATIONS
  // ---------------------------
  async getTickets(req, res) {
    try {
      const { search = '', status } = req.query

      const params = []
      const conditions = []

      // Add search conditions if provided
      if (search) {
        conditions.push(
          `(t.ticket_id LIKE ? OR CONCAT(p.first_name, ' ', p.last_name) LIKE ? OR f.flight_number LIKE ?)`
        )
        params.push(`%${search}%`, `%${search}%`, `%${search}%`)
      }

      // Add status filter condition if provided
      if (status) {
        conditions.push(`t.status = ?`)
        params.push(status)
      }

      // Build dynamic WHERE clause
      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // ✅ Query without pagination
      const [rows] = await pool.query(
        `SELECT t.ticket_id, t.price, t.status,
              f.flight_number,
              CONCAT(dep.code, ' → ', arr.code) AS route,
              CONCAT(p.first_name, ' ', p.last_name) AS passenger_name
       FROM tickets t
       JOIN flights f ON t.flight_id = f.flight_id
       JOIN passengers p ON t.passenger_id = p.passenger_id
       JOIN airports dep ON f.departure_airport = dep.airport_id
       JOIN airports arr ON f.arrival_airport = arr.airport_id
       ${whereClause}`,
        params
      )

      return res.json({
        success: true,
        data: rows,
      })
    } catch (error) {
      logger.error(`Get Tickets Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_TICKETS_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Export Tickets to Excel
  async exportTickets(req, res) {
    try {
      // Get all tickets without pagination
      const tickets = await Ticket.search({
        limit: Number.MAX_SAFE_INTEGER, // Get all records
      })

      const workbook = new exceljs.Workbook()
      const worksheet = workbook.addWorksheet('Tickets')

      worksheet.columns = [
        { header: 'Ticket ID', key: 'ticket_id', width: 15 },
        { header: 'Flight ID', key: 'flight_id', width: 15 },
        { header: 'Passenger ID', key: 'passenger_id', width: 15 },
        { header: 'Price', key: 'price', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
      ]

      // Handle both array and paginated response
      const ticketData = Array.isArray(tickets) ? tickets : tickets.data
      ticketData.forEach((ticket) => worksheet.addRow(ticket))

      // Stream directly to response
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=tickets_export.xlsx'
      )

      await workbook.xlsx.write(res)
      res.end()
    } catch (error) {
      logger.error(`Export Tickets Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_TICKETS_ERROR',
          message: 'Failed to export tickets',
        },
      })
    }
  }
  // ---------------------------
  // PASSENGER CRUD OPERATIONS
  // ---------------------------

  async getPassengers(req, res) {
    try {
      const { search = '' } = req.query

      const params = []
      const conditions = []

      // Add search conditions dynamically
      if (search) {
        conditions.push(
          `(first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)`
        )
        params.push(`%${search}%`, `%${search}%`, `%${search}%`)
      }

      // Build dynamic WHERE clause
      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // Fetch all passenger data (no pagination)
      const [rows] = await pool.query(
        `SELECT * FROM passengers 
       ${whereClause}
       ORDER BY created_at DESC`, // Optional: sort by newest first
        params
      )

      return res.json({
        success: true,
        data: rows,
      })
    } catch (error) {
      logger.error(`Get Passengers Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_PASSENGERS_ERROR',
          message: error.message,
        },
      })
    }
  }

  // Export Passengers to CSV
  async exportPassengers(req, res) {
    try {
      const passengers = await Passenger.search({ page: 1, limit: 1000 })
      const csvWriter = csv({
        path: 'passengers.csv',
        header: [
          { id: 'passenger_id', title: 'Passenger ID' },
          { id: 'first_name', title: 'First Name' },
          { id: 'last_name', title: 'Last Name' },
          { id: 'email', title: 'Email' },
        ],
      })

      await csvWriter.writeRecords(passengers.data)
      res.download('passengers.csv')
    } catch (error) {
      logger.error(`Export Passengers Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_PASSENGERS_ERROR',
          message: error.message,
        },
      })
    }
  }

  // ---------------------------
  // REFUND CRUD OPERATIONS
  // ---------------------------

  async getRefunds(req, res) {
    try {
      const { search = '' } = req.query

      const params = []
      const conditions = []

      // ✅ Search filter: refund_id, ticket_id, status, and request_reason
      if (search) {
        conditions.push(`
        (refund_id LIKE ? 
        OR ticket_id LIKE ?
        OR status LIKE ?
        OR request_reason LIKE ?)
      `)
        const searchQuery = `%${search}%`
        params.push(searchQuery, searchQuery, searchQuery, searchQuery)
      }

      // ✅ Build dynamic WHERE clause
      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // ✅ Fetch all matching refunds without pagination
      const [rows] = await pool.query(
        `SELECT refund_id, ticket_id, amount, penalty, status, request_reason, created_at
       FROM refunds
       ${whereClause}
       ORDER BY created_at DESC`,
        params
      )

      return res.json({
        success: true,
        data: rows,
      })
    } catch (error) {
      logger.error(`Get Refunds Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_REFUNDS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async processRefund(req, res) {
    try {
      // ✅ Validate input using Joi
      const schema = Joi.object({
        status: Joi.string().valid('Approved', 'Rejected').required(),
        admin_comment: Joi.string().optional().allow(null, ''),
      })

      const { error } = schema.validate(req.body)
      if (error) {
        throw new Error(error.details[0].message)
      }

      let status = req.body.status.trim()

      const validStatuses = ['Approved', 'Rejected', 'Pending']
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`)
      }

      console.log(`Refund status being inserted: "${status}"`) // ✅ Debug log

      // ✅ Process the refund with the validated status
      const refund = await Refund.process(req.params.id, {
        ...req.body,
        status, // Use standardized status
      })

      logger.info(`Refund processed: ${req.params.id}`)

      return res.json({
        success: true,
        refund,
      })
    } catch (error) {
      logger.error(`Process Refund Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'PROCESS_REFUND_ERROR',
          message: error.message,
        },
      })
    }
  }
  // Export Refunds to Excel
  async exportRefunds(req, res) {
    try {
      const refunds = await Refund.search({ page: 1, limit: 1000 })
      const workbook = new exceljs.Workbook()
      const worksheet = workbook.addWorksheet('Refunds')
      worksheet.columns = [
        { header: 'Refund ID', key: 'refund_id' },
        { header: 'Ticket ID', key: 'ticket_id' },
        { header: 'Amount', key: 'amount' },
        { header: 'Status', key: 'status' },
      ]

      refunds.data.forEach((refund) => worksheet.addRow(refund))
      await workbook.xlsx.writeFile('refunds.xlsx')
      res.download('refunds.xlsx')
    } catch (error) {
      logger.error(`Export Refunds Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_REFUNDS_ERROR',
          message: error.message,
        },
      })
    }
  }

  // ---------------------------
  // REVIEW CRUD OPERATIONS
  // ---------------------------

  async getReviews(req, res) {
    try {
      const { rating = '' } = req.query

      const params = []
      const conditions = []

      if (rating) {
        conditions.push(`r.rating = ?`)
        params.push(rating)
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // Fetch all matching review data with JOINs
      const [rows] = await pool.query(
        `SELECT 
        r.review_id,
        r.rating,
        r.comment,
        u.username AS user_name,
        f.flight_number
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.user_id
      LEFT JOIN flights f ON r.flight_id = f.flight_id
      ${whereClause}`,
        params
      )

      return res.json({
        success: true,
        data: rows,
      })
    } catch (error) {
      logger.error(`Get Reviews Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_REVIEWS_ERROR',
          message: error.message,
        },
      })
    }
  }

  async hardDeleteReview(req, res) {
    try {
      await Review.delete(req.params.id)
      logger.info(`Review hard deleted: ${req.params.id}`)
      return res.json({
        success: true,
        message: 'Review hard deleted successfully',
      })
    } catch (error) {
      logger.error(`Hard Delete Review Error: ${error.message}`)
      return res.status(400).json({
        success: false,
        error: {
          code: 'HARD_DELETE_REVIEW_ERROR',
          message: error.message,
        },
      })
    }
  }

  async deleteReview(req, res) {
    const conn = await pool.getConnection()
    try {
      console.log(`[REVIEW] Deleting review ${req.params.id}`)
      await conn.beginTransaction()
      const reviewId = req.params.id

      await Review.delete(reviewId, conn) // No user check

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

  // Export Reviews to CSV
  async exportReviews(req, res) {
    try {
      const reviews = await Review.search({ page: 1, limit: 1000 })
      const csvWriter = csv({
        path: 'reviews.csv',
        header: [
          { id: 'review_id', title: 'Review ID' },
          { id: 'flight_id', title: 'Flight ID' },
          { id: 'rating', title: 'Rating' },
          { id: 'comment', title: 'Comment' },
        ],
      })

      await csvWriter.writeRecords(reviews.data)
      res.download('reviews.csv')
    } catch (error) {
      logger.error(`Export Reviews Error: ${error.message}`)
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_REVIEWS_ERROR',
          message: error.message,
        },
      })
    }
  }

  // ---------------------------
  // LOGOUT FUNCTIONALITY
  // ---------------------------

  async logout(req, res) {
    try {
      logger.debug(`[LOGOUT] Logging out user ID: ${req.user.user_id}`)
      // Add the token to the blacklist
      tokenBlacklist.add(req.token)
      res.json({ success: true, message: 'Logged out successfully' })
    } catch (error) {
      logger.error(`[LOGOUT ERROR] ${error.message}`)
      res.status(500).json({ success: false, error: 'Failed to log out' })
    }
  }
}

module.exports = new AdminController()
