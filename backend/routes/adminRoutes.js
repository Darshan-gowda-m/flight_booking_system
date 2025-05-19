const router = require('express').Router()
const adminController = require('../controllers/adminController')
const {
  authMiddleware,
  adminMiddleware,
} = require('../middleware/authMiddleware')

// ---------------------------
// DASHBOARD ROUTES
// ---------------------------
router.get(
  '/dashboard',
  authMiddleware,
  adminMiddleware,
  adminController.getDashboardStats
)
router.get(
  '/dashboard/enhanced',
  authMiddleware,
  adminMiddleware,
  adminController.getCombinedDashboardStats
)

router.get(
  '/airlines/:airlineId/performance',

  adminController.getAirlinePerformance
)

router.get(
  '/airports/:airportId/performance',
  authMiddleware,
  adminMiddleware,
  adminController.getAirportPerformance
)

// ---------------------------
// AIRLINE ROUTES
// ---------------------------
router
  .route('/airlines')
  .post(authMiddleware, adminMiddleware, adminController.createAirline)
  .get(authMiddleware, adminMiddleware, adminController.getAirlines)

router
  .route('/airlines/bulk')
  .post(authMiddleware, adminMiddleware, adminController.bulkCreateAirlines)

router
  .route('/airlines/export')
  .get(authMiddleware, adminMiddleware, adminController.exportAirlines)

router
  .route('/airlines/:id')
  .get(authMiddleware, adminMiddleware, adminController.getAirlineDetails)
  .put(authMiddleware, adminMiddleware, adminController.updateAirline)
  .delete(authMiddleware, adminMiddleware, adminController.deleteAirline)

router.put(
  '/airlines/:id/status',
  authMiddleware,
  adminMiddleware,
  adminController.softDeleteAirline
)

// ---------------------------
// AIRPORT ROUTES
// ---------------------------
router
  .route('/airports')
  .post(authMiddleware, adminMiddleware, adminController.createAirport)
  .get(authMiddleware, adminMiddleware, adminController.getAirports)

router
  .route('/airports/bulk')
  .post(authMiddleware, adminMiddleware, adminController.bulkCreateAirports)

router
  .route('/airports/export')
  .get(authMiddleware, adminMiddleware, adminController.exportAirports)

router
  .route('/airports/:id')
  .get(authMiddleware, adminMiddleware, adminController.getAirportDetails)

  .delete(authMiddleware, adminMiddleware, adminController.deleteAirport)

router.put(
  '/airports/:id/status',
  authMiddleware,
  adminMiddleware,
  adminController.softDeleteAirport
)

// ---------------------------
// FLIGHT ROUTES
// ---------------------------
router
  .route('/flights')
  .post(authMiddleware, adminMiddleware, adminController.createFlight)
  .get(authMiddleware, adminMiddleware, adminController.getFlights)

router
  .route('/flights/bulk')
  .post(authMiddleware, adminMiddleware, adminController.bulkCreateFlights)
router.get(
  '/flights/canceled',
  authMiddleware,
  adminMiddleware,
  adminController.getCanceledFlights
)

router.put(
  '/flights/:id/reschedule',
  authMiddleware,
  adminMiddleware,
  adminController.rescheduleFlight
)

router
  .route('/flights/export')
  .get(authMiddleware, adminMiddleware, adminController.exportFlights)

router
  .route('/flights/:id')
  .get(authMiddleware, adminMiddleware, adminController.getFlightDetails)
  .delete(authMiddleware, adminMiddleware, adminController.deleteFlight)
router.put(
  '/flights/:id/cancel',
  authMiddleware,
  adminMiddleware,
  adminController.cancelFlightStatus
)
router.put(
  '/flights/:id',
  authMiddleware,
  adminMiddleware,
  adminController.updateFlightStatus
)

// ---------------------------
// DISCOUNT ROUTES
// ---------------------------
router
  .route('/discounts')
  .post(authMiddleware, adminMiddleware, adminController.createDiscount)
  .get(authMiddleware, adminMiddleware, adminController.getDiscounts)

router
  .route('/discounts/bulk')
  .post(authMiddleware, adminMiddleware, adminController.bulkCreateDiscounts)

router
  .route('/discounts/export')
  .get(authMiddleware, adminMiddleware, adminController.exportDiscounts)

router
  .route('/discounts/:id')
  .get(authMiddleware, adminMiddleware, adminController.getDiscountDetails)
  .put(authMiddleware, adminMiddleware, adminController.updateDiscount)
  .delete(authMiddleware, adminMiddleware, adminController.deleteDiscount)

// ---------------------------
// USER ROUTES
// ---------------------------
router
  .route('/users')
  .get(authMiddleware, adminMiddleware, adminController.getUsers)

router
  .route('/users/bulk-roles')
  .put(authMiddleware, adminMiddleware, adminController.bulkUpdateUserRoles)

router
  .route('/users/export')
  .get(authMiddleware, adminMiddleware, adminController.exportUsers)

router
  .route('/users/:id/role')
  .put(authMiddleware, adminMiddleware, adminController.updateUserRole)

router.put(
  '/users/:id/status',
  authMiddleware,
  adminMiddleware,
  adminController.softDeleteUser
)

// ---------------------------
// TICKET ROUTES
// ---------------------------
router
  .route('/tickets')
  .get(authMiddleware, adminMiddleware, adminController.getTickets)

router
  .route('/tickets/export')
  .get(authMiddleware, adminMiddleware, adminController.exportTickets)

// ---------------------------
// PASSENGER ROUTES
// ---------------------------
router
  .route('/passengers')
  .get(authMiddleware, adminMiddleware, adminController.getPassengers)

router
  .route('/passengers/export')
  .get(authMiddleware, adminMiddleware, adminController.exportPassengers)

// ---------------------------
// REFUND ROUTES
// ---------------------------
router
  .route('/refunds')
  .get(authMiddleware, adminMiddleware, adminController.getRefunds)

router
  .route('/refunds/:id/process')
  .put(authMiddleware, adminMiddleware, adminController.processRefund)

router
  .route('/refunds/export')
  .get(authMiddleware, adminMiddleware, adminController.exportRefunds)

// ---------------------------
// REVIEW ROUTES
// ---------------------------
router
  .route('/reviews')
  .get(authMiddleware, adminMiddleware, adminController.getReviews)

router
  .route('/reviews/export')
  .get(authMiddleware, adminMiddleware, adminController.exportReviews)

router.delete(
  '/reviews/:id',
  authMiddleware,
  adminMiddleware,
  adminController.deleteReview
)

// ---------------------------
// AUTH ROUTES
// ---------------------------
router.post('/logout', authMiddleware, adminMiddleware, adminController.logout)

module.exports = router
