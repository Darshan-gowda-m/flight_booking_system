class FlightBookingApp {
  constructor() {
    this.API_BASE_URL =
      'https://flight-booking-system-c0g3.onrender.com/api/users'
    this.DEBUG = true

    this.MAX_SEATS = 8
    this.POLL_INTERVAL = 30000
    this.SESSION_TIMEOUT = 45 * 60 * 1000

    this.state = {
      currentUser: null,
      selectedFlight: null,
      selectedSeats: [],
      passengerDetails: [],
      currentPage: 1,
      tickets: [],
      completedFlights: [],
      flights: [],
      reviews: [],
      loading: false,
      error: null,
      config: null,
      seatPrices: {},
      availableDiscounts: [],
      appliedDiscount: null,
      originalPrices: [],
    }

    this.initElements()
    this.init()
  }

  initElements() {
    this.elements = {
      loadingSpinner: document.getElementById('loading-spinner'),
      notificationContainer: document.getElementById('notification-container'),
      sections: {
        dashboard: document.getElementById('dashboard-section'),
        flightSearch: document.getElementById('flight-search-section'),
        flightDetails: document.getElementById('flight-details-section'),
        seatSelection: document.getElementById('seat-selection-section'),
        passenger: document.getElementById('passenger-section'),
        payment: document.getElementById('payment-section'),
        confirmation: document.getElementById('confirmation-section'),
        tickets: document.getElementById('tickets-section'),
        ticketDetails: document.getElementById('ticket-details-section'),
        reviews: document.getElementById('reviews-section'),
        profile: document.getElementById('profile-section'),
      },
      forms: {
        flightSearch: document.getElementById('flight-search-form'),
        passenger: document.getElementById('passenger-forms'),
        payment: document.getElementById('payment-form'),
        profile: document.getElementById('update-profile-form'),
      },
    }
  }

  async init() {
    this.checkAuth()
    this.setupEventListeners()
    try {
      await this.loadConfiguration()
      await this.loadUserProfile()
      this.setupAutoLogout()
      this.startBackgroundPolling()
      this.showSection('dashboard')

      await this.loadDashboard()
    } catch (error) {
      console.error('Initialization error:', error)
      this.showNotification('Failed to initialize application', 'error')
    }
  }

  checkAuth() {
    const token = localStorage.getItem('token')
    if (!token) this.redirectToLogin()
  }

  redirectToLogin() {
    window.location.href = '/login.html'
  }

  async logout() {
    try {
      await fetch(`${this.API_BASE_URL}/logout`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('token')
      this.redirectToLogin()
    }
  }

  async loadConfiguration() {
    try {
      const response = await fetch(`${this.API_BASE_URL}/config`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Failed to load configuration')
      const result = await response.json()

      if (!result.config) throw new Error('Configuration data not found')
      this.state.config = result.config

      if (result.config.airports?.length > 0) {
        this.populateAirportSelectors()
      } else {
        this.showNotification('Airport data not available', 'error')
      }
    } catch (error) {
      this.showNotification(`Configuration error: ${error.message}`, 'error')
    }
  }

  populateAirportSelectors() {
    const airports = this.state.config?.airports || []
    const selectElements = document.querySelectorAll('.airport-select')

    selectElements.forEach((select) => {
      select.innerHTML = airports
        .map(
          (airport) =>
            `<option value="${airport.code}">${airport.name} (${airport.code})</option>`
        )
        .join('')
    })
  }

  // Add these methods to your FlightBookingApp class

  showModal(content) {
    // Create modal container if it doesn't exist
    let modal = document.getElementById('custom-modal')
    if (!modal) {
      modal = document.createElement('div')
      modal.id = 'custom-modal'
      modal.className = 'modal'
      modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <button class="modal-close">&times;</button>
        <div class="modal-body"></div>
      </div>
    `
      document.body.appendChild(modal)

      // Add close handler
      modal.querySelector('.modal-close').addEventListener('click', () => {
        this.closeModal()
      })

      // Close when clicking on backdrop
      modal.querySelector('.modal-backdrop').addEventListener('click', () => {
        this.closeModal()
      })
    }

    // Set content and show modal
    modal.querySelector('.modal-body').innerHTML = content
    modal.classList.add('active')
    document.body.style.overflow = 'hidden' // Prevent scrolling
  }

  closeModal() {
    const modal = document.getElementById('custom-modal')
    if (modal) {
      modal.classList.remove('active')
      document.body.style.overflow = ''
    }
  }
  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[onclick*="editReview"]')) {
        const reviewId = e.target
          .closest('[onclick*="editReview"]')
          .getAttribute('onclick')
          .match(/'([^']+)'/)[1]
        this.editReview(reviewId)
      }

      // if (e.target.closest('[onclick*="deleteReview"]')) {
      //   const reviewId = e.target
      //     .closest('[onclick*="deleteReview"]')
      //     .getAttribute('onclick')
      //     .match(/'([^']+)'/)[1]
      //   this.deleteReview(reviewId)
      // }

      // Handle write new review button
      if (e.target.closest('[onclick*="showReviewForm"]')) {
        this.showReviewForm()
      }

      // Handle review form submission
      if (e.target.closest('[onclick*="submitReview"]')) {
        const reviewIdMatch = e.target
          .closest('[onclick*="submitReview"]')
          .getAttribute('onclick')
          .match(/'([^']*)'/)
        const reviewId = reviewIdMatch ? reviewIdMatch[1] : null
        this.submitReview(reviewId)
      }

      // Handle review form cancellation
      if (e.target.closest('[onclick*="cancelReviewForm"]')) {
        this.cancelReviewForm()
      }
    })

    // Rating stars interaction
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('#rating-stars .fa-star')) {
        const rating = e.target.closest('.fa-star').dataset.rating
        this.hoverRating(rating)
      }
    })

    document.addEventListener('click', (e) => {
      if (e.target.closest('#rating-stars .fa-star')) {
        const rating = e.target.closest('.fa-star').dataset.rating
        this.setRating(rating)
      }
    })

    document.addEventListener('mouseout', (e) => {
      if (e.target.closest('#rating-stars')) {
        const currentRating =
          parseInt(document.getElementById('review-rating').value) || 0
        this.setRating(currentRating)
      }
    })

    // Flight selection change
    document.addEventListener('change', (e) => {
      if (e.target.id === 'review-flight') {
        this.handleFlightSelection(e.target.value)
      }
    })

    document.addEventListener('click', (e) => {
      // Print Ticket Button
      const printBtn = e.target.closest('.print-ticket-btn')
      if (printBtn) {
        e.preventDefault()
        const ticketId = printBtn.dataset.ticketId
        console.log('Print button clicked for ticket:', ticketId)
        this.printTicket(ticketId)
      }

      // Cancel Ticket Button (both direct and delegated)
      const cancelBtn = e.target.closest('#cancel-ticket, .cancel-ticket')
      if (cancelBtn) {
        e.preventDefault()
        const ticketId = cancelBtn.dataset?.id || cancelBtn.dataset?.ticketId
        console.log('Cancel button clicked for ticket:', ticketId)
        if (ticketId) this.cancelTicket(ticketId)
      }

      // Request Refund Button
      const refundBtn = e.target.closest('#request-refund')
      if (refundBtn) {
        e.preventDefault()
        const ticketId = refundBtn.dataset?.ticketId
        console.log('Refund button clicked for ticket:', ticketId)
        if (ticketId) this.requestRefund(ticketId)
      }

      // Retry Payment Button
      if (e.target.classList.contains('retry-payment')) {
        e.preventDefault()
        console.log('Retry payment button clicked')
        this.retryPayment(e.target.dataset.id)
      }

      // View Details Buttons
      if (e.target.classList.contains('view-details-btn')) {
        console.log('View flight details button clicked')
        this.showFlightDetails(e.target.dataset.id)
      }
      if (e.target.classList.contains('view-ticket')) {
        console.log('View ticket button clicked')
        this.showTicketDetails(e.target.dataset.id)
      }
    })

    // Direct event listeners for static elements
    document
      .getElementById('proceed-to-passengers')
      ?.addEventListener('click', (e) => {
        e.preventDefault()
        this.showPassengerForms()
      })

    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault()
        const section = e.target.dataset.section
        this.showSection(section)
        this.setActiveNav(e.target)

        if (section === 'tickets') this.loadUserTickets()
        if (section === 'reviews') this.loadUserReviews()
        if (section === 'flightSearch') this.resetFlightSearchForm()
      })
    })

    // Flight Search
    this.elements.forms.flightSearch?.addEventListener('submit', (e) => {
      e.preventDefault()
      this.handleFlightSearch(e)
    })

    // Seat Selection
    document.getElementById('seat-map')?.addEventListener('click', (e) => {
      this.handleSeatSelection(e)
    })

    // Passenger Forms
    this.elements.forms.passenger?.addEventListener('submit', (e) => {
      e.preventDefault()
      this.processPassengerForms(e)
    })

    document
      .getElementById('back-to-tickets')
      ?.addEventListener('click', () => {
        this.showSection('tickets-section')
      })

    // Profile Form
    this.elements.forms.profile?.addEventListener('submit', (e) => {
      e.preventDefault()
      this.updateProfile(e)
    })

    // Payment Form
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'payment-form') {
        e.preventDefault()
        this.processPayment(e)
      }
    })

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      this.logout()
    })

    // Pagination
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('pagination-btn')) {
        e.preventDefault()
        this.loadUserTickets(parseInt(e.target.dataset.page))
      }
    })

    // Filter change handler
    document
      .getElementById('ticket-status-filter')
      ?.addEventListener('change', () => {
        this.loadUserTickets(1)
      })

    // Payment method change handlers
    document
      .querySelectorAll('input[name="paymentMethod"]')
      ?.forEach((input) => {
        input.addEventListener('change', () => {
          document.querySelectorAll('.payment-interface').forEach((div) => {
            div.classList.remove('active')
          })
          document
            .getElementById(`${input.value.toLowerCase()}-payment`)
            ?.classList.add('active')
        })
      })

    // Netbanking other bank toggle
    document.getElementById('bank-select')?.addEventListener('change', (e) => {
      document.getElementById('netbanking-other').style.display =
        e.target.value === 'OTHER' ? 'block' : 'none'
    })
  }
  showSection(sectionId) {
    Object.values(this.elements.sections).forEach((section) => {
      section?.classList.remove('active')
    })
    this.elements.sections[sectionId]?.classList.add('active')
    window.scrollTo(0, 0)
  }

  setActiveNav(activeLink) {
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.remove('active')
      if (link === activeLink) link.classList.add('active')
    })
  }

  showLoading() {
    this.elements.loadingSpinner.style.display = 'flex'
    document.querySelectorAll('button').forEach((btn) => {
      btn.disabled = true
    })
  }

  hideLoading() {
    this.elements.loadingSpinner.style.display = 'none'
    document.querySelectorAll('button').forEach((btn) => {
      btn.disabled = false
    })
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div')
    notification.className = `notification ${type}`
    notification.textContent = message
    this.elements.notificationContainer.appendChild(notification)

    setTimeout(() => notification.classList.add('active'), 100)
    setTimeout(() => {
      notification.style.opacity = '0'
      setTimeout(() => notification.remove(), 300)
    }, 5000)
  }

  async loadUserProfile() {
    this.showLoading()
    try {
      const response = await fetch(`${this.API_BASE_URL}/profile`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Failed to load profile')
      const data = await response.json()

      if (data.user) {
        this.state.currentUser = data.user
        this.updateProfileDisplay()
      } else {
        throw new Error('User data not found')
      }
    } catch (error) {
      this.showNotification(`Profile error: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  updateProfileDisplay() {
    if (!this.state.currentUser) return

    document.getElementById('profile-name').textContent =
      this.state.currentUser.username || 'N/A'
    document.getElementById('profile-email').textContent =
      this.state.currentUser.email || 'N/A'
    document.getElementById('profile-join-date').textContent = this.state
      .currentUser.created_at
      ? new Date(this.state.currentUser.created_at).toLocaleDateString()
      : 'N/A'

    document.getElementById('update-name').value =
      this.state.currentUser.username || ''
    document.getElementById('update-email').value =
      this.state.currentUser.email || ''
    const usernameElement = document.querySelector('.user-info span')
    if (usernameElement) {
      usernameElement.textContent = this.state.currentUser.username || 'Guest'
    }
  }

  async loadDashboard() {
    this.showLoading()
    try {
      const [statsRes, flightsRes] = await Promise.all([
        fetch(`${this.API_BASE_URL}/tickets/stats`, {
          headers: this.getAuthHeaders(),
        }),
        fetch(`${this.API_BASE_URL}/flights?status=Scheduled&limit=3`, {
          headers: this.getAuthHeaders(),
        }),
      ])

      if (!statsRes.ok || !flightsRes.ok) {
        throw new Error('Failed to load dashboard data')
      }

      const [stats, flights] = await Promise.all([
        statsRes.json(),
        flightsRes.json(),
      ])

      this.renderDashboard(stats.stats, flights.data)
    } catch (error) {
      this.showNotification(`Dashboard error: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }
  async printTicket(ticketId) {
    this.showLoading()
    try {
      const response = await fetch(
        `${this.API_BASE_URL}/tickets/${ticketId}/print`,
        {
          headers: this.getAuthHeaders(),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch ticket details')
      }

      const ticketData = await response.json()

      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        throw new Error('Popup was blocked. Please allow popups for this site.')
      }

      printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket ${ticketData.ticket_id}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 0;
            padding: 20px;
            background-color: #121212;
            color: #fff;
          }
          .ticket { 
            border: 2px solid #FF6B00;
            padding: 25px; 
            max-width: 600px; 
            margin: 0 auto;
            background-color: #1E1E1E;
            border-radius: 8px;
            box-shadow: 0 0 15px rgba(255, 107, 0, 0.3);
          }
          .header { 
            text-align: center; 
            margin-bottom: 20px; 
            border-bottom: 2px solid #FF6B00;
            padding-bottom: 15px;
          }
          .header h2 {
            color: #FF6B00;
            margin-bottom: 5px;
          }
          .barcode { 
            text-align: center; 
            margin: 25px 0;
            padding: 15px 0;
            background-color: #2A2A2A;
            border-radius: 5px;
          }
          .details { 
            margin-bottom: 20px;
            padding: 15px;
            background-color: #2A2A2A;
            border-radius: 5px;
          }
          .row { 
            display: flex; 
            justify-content: space-between; 
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px dashed #444;
          }
          .row:last-child {
            border-bottom: none;
          }
          strong {
            color: #FF6B00;
          }
          .status-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9em;
            margin-top: 10px;
            text-transform: uppercase;
          }
          .status-confirmed { 
            background-color: #4CAF50;
            color: white;
          }
          .status-pending { 
            background-color: #FFC107;
            color: #333;
          }
          .status-cancelled { 
            background-color: #F44336;
            color: white;
          }
          .status-refunded { 
            background-color: #9C27B0;
            color: white;
          }
          .price-tag {
            font-size: 1.2em;
            font-weight: bold;
            color: #FF6B00;
          }
          .buttons {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-top: 20px;
          }
          button {
            background-color: #FF6B00;
            color: white;
            border: none;
            padding: 8px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
          }
          button:hover {
            background-color: #FF8B33;
          }
          @media print {
            .no-print { display: none; }
            body { 
              margin: 0; 
              padding: 0;
              background-color: white !important;
              color: black !important;
            }
            .ticket {
              box-shadow: none;
              border: 1px solid #ccc !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <h2>FLIGHT TICKET</h2>
            <p>Ticket #${ticketData.ticket_id}</p>
            <div class="status-badge status-${ticketData.status.toLowerCase()}">
              ${ticketData.status}
            </div>
          </div>
          
          <div class="details">
            <div class="row">
              <strong>Passenger:</strong>
              <span>${ticketData.passenger.first_name} ${ticketData.passenger.last_name}</span>
            </div>
            <div class="row">
              <strong>Flight Number:</strong>
              <span>${ticketData.flight_number || 'N/A'}</span>
            </div>
            <div class="row">
              <strong>Departure:</strong>
              <span>${this.formatDate(ticketData.departure_time)} (${ticketData.departure_code || 'N/A'})</span>
            </div>
            <div class="row">
              <strong>Arrival:</strong>
              <span>${this.formatDate(ticketData.arrival_time)} (${ticketData.arrival_code || 'N/A'})</span>
            </div>
            <div class="row">
              <strong>Seat:</strong>
              <span>${ticketData.seat_number || 'N/A'} (${ticketData.class || 'N/A'})</span>
            </div>
            <div class="row">
              <strong>Airline:</strong>
              <span>${ticketData.airline_name || 'N/A'}</span>
            </div>
            <div class="row">
              <strong>Payment Status:</strong>
              <span>${ticketData.payment_status || 'N/A'}</span>
            </div>
            <div class="row">
              <strong>Total Amount:</strong>
              <span class="price-tag">₹${(ticketData.price || 0).toFixed(2)}</span>
            </div>
          </div>
          
          <div class="barcode">
            <div id="barcode"></div>
          </div>
          
          <div class="buttons no-print">
            <button onclick="window.print()">Print Ticket</button>
            <button onclick="window.close()">Close Window</button>
          </div>
        </div>
        
        <script src="https://cdn.jsdelivr.net/npm/bwip-js@2.0.5/dist/bwip-js.min.js"></script>
        <script>
          bwipjs.toCanvas(document.getElementById('barcode'), {
            bcid: 'code128',
            text: '${ticketData.ticket_id}',
            scale: 3,
            height: 15,
            includetext: true,
            backgroundcolor: '2A2A2A',
            textcolor: 'FFFFFF'
          });
          
          setTimeout(() => {
            try {
              window.print();
            } catch(e) {
              console.error('Auto-print failed:', e);
            }
          }, 500);
        </script>
      </body>
      </html>
    `)

      printWindow.document.close()
    } catch (error) {
      console.error('Print error:', error)
      this.showNotification(`Print failed: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }
  // Helper function to format time only
  formatTime(dateString) {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return 'N/A'
    }
  }

  // Updated formatDate with date-only option
  formatDate(dateString, dateOnly = false) {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      if (dateOnly) {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      }
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return 'N/A'
    }
  }
  renderDashboard(stats, flights) {
    document.getElementById('total-tickets').textContent = stats.total || 0
    document.getElementById('confirmed-tickets').textContent =
      stats.confirmed || 0
    document.getElementById('cancelled-tickets').textContent =
      stats.cancelled || 0
    document.getElementById('pending-tickets').textContent = stats.pending || 0
    document.getElementById('total_spent-tickets').textContent =
      stats.total_spent || 0

    const flightsHTML = flights
      .map(
        (flight) => `
          <div class="flight-card" data-id="${flight.flight_id}">
            <div class="flight-header">
              <h4>${flight.origin} → ${flight.destination}</h4>
            </div>
            <div class="flight-details">
              <div class="flight-times">
                <span>Depart: ${this.formatDate(flight.departure_time)}</span>
                <span>Arrive: ${this.formatDate(flight.arrival_time)}</span>
              </div>
              <button class="view-details-btn btn btn-secondary" 
                      data-id="${flight.flight_id}">
                View Details
              </button>
            </div>
          </div>
        `
      )
      .join('')

    document.getElementById('upcoming-flights-list').innerHTML = flightsHTML
  }

  async handleFlightSearch(e) {
    e.preventDefault()
    this.showLoading()

    try {
      const formData = new FormData(e.target)
      const params = new URLSearchParams(formData)

      if (!params.toString()) params.append('show_all', 'true')

      const response = await fetch(`${this.API_BASE_URL}/flights?${params}`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Flight search failed')
      const result = await response.json()

      if (result.data?.length > 0) {
        this.renderFlightResults(result.data)
      } else {
        this.showNotification(
          'No flights found. Showing all available.',
          'info'
        )
        await this.showAllAvailableFlights()
      }
    } catch (error) {
      this.showNotification(`Search failed: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  renderFlightResults(flights) {
    const resultsHTML = flights
      .map(
        (flight) => `
      <div class="flight-card ${flight.highlight ? 'highlight neon-border' : ''}" 
           data-id="${flight.flight_id}"
           data-price="${flight.price}">
        <div class="flight-header">
          <h4 class="hover-underline">${flight.origin} → ${flight.destination}</h4>
          ${flight.discount ? `<span class="discount-badge">${flight.discount}% OFF</span>` : ''}
        </div>
        <div class="flight-content">
          <div class="flight-times">
            <span class="flight-time-item">
              <i class="icon-departure"></i>
              ${this.formatDate(flight.departure_time)}
            </span>
            <span class="flight-time-item">
              <i class="icon-arrival"></i>
              ${this.formatDate(flight.arrival_time)}
            </span>
            <span class="flight-duration">
              <i class="icon-clock"></i>
              ${this.calculateDuration(flight.departure_time, flight.arrival_time)}
            </span>
          </div>
          <div class="flight-meta">
          
          </div>
        </div>
        <div class="flight-actions">
          <button class="view-details-btn btn btn-secondary tooltip" 
                  data-id="${flight.flight_id}"
                  data-tooltip="See flight details">
            <i class="icon-eye"></i> Details
          </button>
        
        </div>
        ${
          flight.last_seats
            ? `<div class="last-seats-warning">
            <i class="icon-warning"></i> Only ${flight.last_seats} seats left!
          </div>`
            : ''
        }
      </div>
    `
      )
      .join('')

    document.getElementById('flight-results').innerHTML = resultsHTML

    // Add event listeners for the new buttons
    document.querySelectorAll('.book-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const flightId = e.target.closest('.book-btn').dataset.id
        this.handleBookFlight(flightId)
      })
    })
  }

  async showFlightDetails(flightId) {
    this.showLoading()
    try {
      const response = await fetch(`${this.API_BASE_URL}/flights/${flightId}`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Failed to fetch flight details')
      const result = await response.json()

      if (result.success && result.flight) {
        this.state.selectedFlight = result.flight
        this.renderFlightDetails()
        this.showSection('flightDetails')
      } else {
        throw new Error('Flight data not found')
      }
    } catch (error) {
      this.showNotification(`Details error: ${error.message}`, 'error')
      this.showSection('flightSearch')
    } finally {
      this.hideLoading()
    }
  }

  renderFlightDetails() {
    const flight = this.state.selectedFlight
    if (!flight) return

    document.getElementById('flight-number').textContent =
      `Flight ${flight.flight_number || 'N/A'}`
    document.getElementById('detail-origin').textContent =
      flight.departure_airport_name || flight.departure_airport || 'N/A'
    document.getElementById('detail-destination').textContent =
      flight.arrival_airport_name || flight.arrival_airport || 'N/A'
    document.getElementById('detail-departure').textContent = this.formatDate(
      flight.departure_time
    )
    document.getElementById('detail-arrival').textContent = this.formatDate(
      flight.arrival_time
    )
    document.getElementById('detail-status').textContent =
      flight.status || 'N/A'
    document.getElementById('detail-duration').textContent =
      this.calculateDuration(flight.departure_time, flight.arrival_time)

    const bookBtn = document.getElementById('book-flight-btn')
    if (bookBtn) {
      bookBtn.disabled = !flight.available_seats || flight.available_seats <= 0
      bookBtn.title = bookBtn.disabled ? 'No seats available' : ''
      bookBtn.addEventListener('click', () => this.initBookingProcess())
    }
  }

  calculateDuration(departureTime, arrivalTime) {
    if (!departureTime || !arrivalTime) return 'N/A'

    const dep = new Date(departureTime)
    const arr = new Date(arrivalTime)
    if (isNaN(dep) || isNaN(arr)) return 'N/A'

    const diff = arr - dep
    if (diff < 0) return 'Invalid times'

    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)

    return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  }

  initBookingProcess() {
    if (!this.state.selectedFlight) {
      this.showNotification('No flight selected', 'error')
      return
    }

    this.state.selectedSeats = []
    this.state.passengerDetails = []
    this.renderSeatLayout(this.state.selectedFlight.seats)
    this.showSection('seatSelection')
  }
  async showAllAvailableFlights() {
    try {
      const response = await fetch(
        `${this.API_BASE_URL}/flights?show_all=true`,
        {
          headers: this.getAuthHeaders(),
        }
      )

      if (!response.ok) throw new Error('Failed to load flights')

      const result = await response.json()
      this.renderFlightResults(result.data || [])
    } catch (error) {
      console.error('Error loading all flights:', error)
      this.showNotification('Failed to load available flights', 'error')
    }
  }

  renderSeatLayout(seats) {
    const seatMap = document.getElementById('seat-map')
    if (!seatMap) return

    const classColors = {
      Economy: '#4CAF50', // Green
      'Premium Economy': '#2196F3', // Blue
      Business: '#9C27B0', // Purple
      First: '#FF9800', // Orange
    }

    const seatMapHTML = seats
      .map(
        (seat) => `
      <div class="seat ${seat.is_booked ? 'booked' : 'available'} 
           ${this.state.selectedSeats.includes(seat.seat_id) ? 'selected' : ''}"
           data-id="${seat.seat_id}"
           data-number="${seat.seat_number}"
           title="${seat.class} - ₹${seat.price}">
        ${seat.seat_number}
        ${seat.is_booked ? '<div class="booked-overlay">✖</div>' : ''}
      </div>
    `
      )
      .join('')

    seatMap.innerHTML = seatMapHTML
    this.updateSeatSelectionSummary()
  }
  handleSeatSelection(e) {
    const seatElement = e.target.closest('.seat')
    if (!seatElement) return

    const seatId = seatElement.dataset.id
    const index = this.state.selectedSeats.indexOf(seatId)

    if (this.state.selectedSeats.length >= this.MAX_SEATS) {
      this.showNotification(`Max ${this.MAX_SEATS} seats allowed`, 'warning')
      return
    }

    if (index === -1) {
      this.state.selectedSeats.push(seatId)
      seatElement.classList.add('selected')
    } else {
      this.state.selectedSeats.splice(index, 1)
      seatElement.classList.remove('selected')
    }

    this.updateSeatSelectionSummary()
  }

  updateSeatSelectionSummary() {
    const summaryElement = document.getElementById('seat-summary')
    if (!summaryElement) return

    const selectedSeatsInfo = this.state.selectedSeats
      .map((seatId) => {
        const seat = this.state.selectedFlight.seats.find(
          (s) => s.seat_id == seatId
        )
        return seat
          ? {
              number: seat.seat_number,
              price: seat.price,
              class: seat.class,
            }
          : null
      })
      .filter((seat) => seat !== null)

    const totalPrice = selectedSeatsInfo.reduce(
      (sum, seat) => sum + seat.price,
      0
    )

    summaryElement.innerHTML = `
      <h4>Selected Seats (${selectedSeatsInfo.length})</h4>
      <ul>
        ${selectedSeatsInfo
          .map(
            (seat) => `
          <li>Seat ${seat.number} (${seat.class}) - ₹${seat.price.toFixed(2)}</li>
        `
          )
          .join('')}
      </ul>
      <div class="total-price">
        <strong>Total:</strong> ₹${totalPrice.toFixed(2)}
      </div>
      
    `
  }

  showPassengerForms() {
    if (!this.state.selectedSeats.length) {
      this.showNotification('Please select seats first', 'warning')
      return
    }

    const formsContainer = document.getElementById('passenger-forms')
    formsContainer.innerHTML = `
    <form id="passenger-details-form" class="passenger-forms-container">
      <h2>Passenger Details</h2>
      <div class="passenger-forms-list">
        ${this.state.selectedSeats
          .map((seatId, index) => {
            const seat = this.state.selectedFlight.seats.find(
              (s) => s.seat_id == seatId
            )
            return `
            <div class="passenger-form glass" data-seat-id="${seatId}">
              <h3>Passenger ${index + 1} (Seat ${seat.seat_number})</h3>
              <div class="form-row">
                <div class="form-group">
                  <label for="first-name-${index}">First Name*</label>
                  <input type="text" id="first-name-${index}" 
                         name="first_name[${index}]" required minlength="2">
                </div>
                <div class="form-group">
                  <label for="last-name-${index}">Last Name*</label>
                  <input type="text" id="last-name-${index}" 
                         name="last_name[${index}]" required minlength="2">
                </div>
              <div class="form-group">
                  <label for="dob-${index}">Date of Birth</label>
                  <input type="date" id="dob-${index}" 
                         name="date_of_birth[${index}]">
                </div>
              </div>
              <div class="form-group">
                <label for="email-${index}">Email*</label>
                <input type="email" id="email-${index}" 
                       name="email[${index}]" required>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="passport-${index}">Passport Number*</label>
                  <input type="text" id="passport-${index}" 
                         name="passport_number[${index}]" 
                         required pattern="[A-Za-z0-9]{6,12}">
                </div>
                <div class="form-group">
                  <label for="phone-${index}">Phone Number*</label>
                  <input type="tel" id="phone-${index}" 
                         name="phone[${index}]" required
                         pattern="[0-9]{10,15}"
                         title="10-15 digit phone number">
                </div>
              </div>
            
              <input type="hidden" name="seat_id[${index}]" value="${seatId}">
            </div>
          `
          })
          .join('')}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" 
                onclick="app.showSection('seatSelection')">
          Back to Seats
        </button>
        <button type="submit" class="btn btn-primary">
          Continue to Payment
        </button>
      </div>
    </form>
  `

    this.showSection('passenger')
  }

  async processPassengerForms(e) {
    this.showLoading()
    try {
      const formData = new FormData(e.target)
      this.state.passengerDetails = []

      Array.from(document.querySelectorAll('.passenger-form')).forEach(
        (formDiv, index) => {
          const seatId = formDiv.dataset.seatId
          this.state.passengerDetails.push({
            seat_id: seatId,
            first_name: formData.get(`first_name[${index}]`),
            last_name: formData.get(`last_name[${index}]`),
            email: formData.get(`email[${index}]`),
            passport_number: formData.get(`passport_number[${index}]`),
            phone: formData.get(`phone[${index}]`),
            date_of_birth: formData.get(`date_of_birth[${index}]`),
            user_id: this.state.currentUser?.user_id,
          })
        }
      )

      if (!this.validatePassengerDetails()) return

      const response = await fetch(
        `${this.API_BASE_URL}/flights/${this.state.selectedFlight.flight_id}/book`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
          },
          body: JSON.stringify({
            passengers: this.state.passengerDetails,
            seatIds: this.state.selectedSeats,
          }),
        }
      )

      if (!response.ok)
        throw new Error(
          'Ticket creation failed.Either flight is about to depart or seats are already booked.'
        )
      const result = await response.json()

      this.state.tickets = result.tickets
      this.renderPaymentForm()
      this.showSection('payment')
    } catch (error) {
      this.showNotification(`Passenger error: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  validatePassengerDetails() {
    return this.state.passengerDetails.every((passenger, index) => {
      if (!passenger.first_name || passenger.first_name.length < 2) {
        this.showNotification(
          `Passenger ${index + 1}: Invalid first name`,
          'error'
        )
        return false
      }
      if (!passenger.last_name || passenger.last_name.length < 2) {
        this.showNotification(
          `Passenger ${index + 1}: Invalid last name`,
          'error'
        )
        return false
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(passenger.email)) {
        this.showNotification(`Passenger ${index + 1}: Invalid email`, 'error')
        return false
      }
      if (!/^[A-Za-z0-9]{6,12}$/.test(passenger.passport_number)) {
        this.showNotification(
          `Passenger ${index + 1}: Invalid passport`,
          'error'
        )
        return false
      }
      if (!/^[0-9]{10,15}$/.test(passenger.phone)) {
        this.showNotification(
          `Passenger ${index + 1}: Invalid phone number (10-15 digits required)`,
          'error'
        )
        return false
      }
      return true
    })
  }

  renderPaymentForm() {
    // Calculate totals
    const subtotal = this.state.originalPrices.reduce(
      (sum, price) => sum + price,
      0
    )
    const total = this.state.tickets.reduce(
      (sum, ticket) => sum + ticket.price,
      0
    )
    const discountAmount = subtotal - total

    // Format currency values
    const formattedSubtotal = subtotal.toFixed(2)
    const formattedTotal = total.toFixed(2)
    const formattedDiscount = discountAmount.toFixed(2)

    // Store original prices if not already stored
    if (!this.state.originalPrices.length) {
      this.state.originalPrices = this.state.tickets.map((t) => t.price)
    }

    document.getElementById('payment-form').innerHTML = `
      <div class="payment-summary glass">
        <h3>Payment Summary</h3>
        ${this.state.tickets
          .map(
            (ticket, index) => `
          <div class="ticket-summary">
            <span>Seat (${ticket.class})</span>
            <span>₹<span class="ticket-price">${this.state.originalPrices[index].toFixed(2)}</span></span>
          </div>
        `
          )
          .join('')}
        
        <div class="price-breakdown">
          <div class="subtotal-row">
            <span>Subtotal:
       ₹<span class="subtotal">${formattedSubtotal}</span></span>
          </div>
          
          ${
            this.state.appliedDiscount
              ? `
          <div class="discount-row">
            <span>
              Discount (${this.state.appliedDiscount.code}):
              <span class="discount-percent">${this.state.appliedDiscount.discount_percent}% off</span>
            </span>
            <span class="discount-amount">-₹${formattedDiscount}</span>
          </div>
          `
              : ''
          }
          
          <div class="total-row">
            <strong>Total Amount:</strong>
            <strong>₹<span class="total-amount">${formattedTotal}</span></strong>
          </div>
        </div>

        <div class="discount-section">
          <label for="discount-code">Discount Code:</label>
          
          <div id="discount-status"></div>
        </div>
      </div>

      <div class="payment-methods-container glass">
        <h3>Select Payment Method</h3>
        <div class="payment-methods">
          <label class="payment-method">
            <input type="radio" name="paymentMethod" value="Credit" checked>
            <div class="method-card">
              <i class="fab fa-cc-visa"></i>
              <i class="fab fa-cc-mastercard"></i>
              <span>Credit Card</span>
            </div>
          </label>
          <label class="payment-method">
            <input type="radio" name="paymentMethod" value="Debit">
            <div class="method-card">
              <i class="fab fa-cc-visa"></i>
              <i class="fab fa-cc-mastercard"></i>
              <span>Debit Card</span>
            </div>
          </label>
          <label class="payment-method">
            <input type="radio" name="paymentMethod" value="UPI">
            <div class="method-card">
              <i class="fas fa-mobile-alt"></i>
              <span>UPI</span>
            </div>
          </label>
          <label class="payment-method">
            <input type="radio" name="paymentMethod" value="NetBanking">
            <div class="method-card">
              <i class="fas fa-university"></i>
              <span>Net Banking</span>
            </div>
          </label>
          <label class="payment-method">
            <input type="radio" name="paymentMethod" value="Wallet">
            <div class="method-card">
              <i class="fas fa-wallet"></i>
              <span>Wallet</span>
            </div>
          </label>
        </div>

        <div class="payment-interfaces">
          <div id="Credit-payment" class="payment-interface active">
            <div class="form-group">
              <label for="credit-card-number">Card Number</label>
              <input type="text" id="credit-card-number" placeholder="1234 5678 9012 3456" required>
              <div class="card-icons">
                <i class="fab fa-cc-visa"></i>
                <i class="fab fa-cc-mastercard"></i>
                <i class="fab fa-cc-amex"></i>
              </div>
            </div>
            <div class="form-group">
              <label for="credit-card-name">Name on Card</label>
              <input type="text" id="credit-card-name" placeholder="John Doe" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="credit-card-expiry">Expiry Date</label>
                <input type="text" id="credit-card-expiry" placeholder="MM/YY" required>
              </div>
              <div class="form-group">
                <label for="credit-card-cvv">CVV</label>
                <input type="text" id="credit-card-cvv" placeholder="123" required>
                <i class="fas fa-question-circle" title="3-digit code on back of card"></i>
              </div>
            </div>
          </div>

          <div id="Debit-payment" class="payment-interface">
            <div class="form-group">
              <label for="debit-card-number">Card Number</label>
              <input type="text" id="debit-card-number" placeholder="1234 5678 9012 3456" required>
              <div class="card-icons">
                <i class="fab fa-cc-visa"></i>
                <i class="fab fa-cc-mastercard"></i>
                <i class="fab fa-cc-amex"></i>
              </div>
            </div>
            <div class="form-group">
              <label for="debit-card-name">Name on Card</label>
              <input type="text" id="debit-card-name" placeholder="John Doe" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="debit-card-expiry">Expiry Date</label>
                <input type="text" id="debit-card-expiry" placeholder="MM/YY" required>
              </div>
              <div class="form-group">
                <label for="debit-card-cvv">CVV</label>
                <input type="text" id="debit-card-cvv" placeholder="123" required>
                <i class="fas fa-question-circle" title="3-digit code on back of card"></i>
              </div>
            </div>
          </div>

          <div id="UPI-payment" class="payment-interface">
            <div class="form-group">
              <label for="upi-id">UPI ID</label>
              <input type="text" id="upi-id" placeholder="yourname@upi" required>
            </div>
            <div class="upi-apps">
              <div class="upi-app" data-app="gpay">
                <i class="fab fa-google-pay fa-2x"></i>
                <span>Google Pay</span>
              </div>
              <div class="upi-app" data-app="paytm">
                <i class="fas fa-rupee-sign fa-2x"></i>
                <span>Paytm</span>
              </div>
              <div class="upi-app" data-app="phonepe">
                <i class="fas fa-mobile-alt fa-2x"></i>
                <span>PhonePe</span>
              </div>
            </div>
          </div>

          <div id="NetBanking-payment" class="payment-interface">
            <div class="form-group">
              <label for="bank-select">Select Bank</label>
              <select id="bank-select" class="form-control" required>
                <option value="">-- Select Bank --</option>
                <option value="SBI">State Bank of India</option>
                <option value="HDFC">HDFC Bank</option>
                <option value="ICICI">ICICI Bank</option>
                <option value="AXIS">Axis Bank</option>
                <option value="OTHER">Other Bank</option>
              </select>
            </div>
            <div id="netbanking-other" class="form-group" style="display:none">
              <label for="other-bank">Bank Name</label>
              <input type="text" id="other-bank" class="form-control" placeholder="Enter your bank name">
            </div>
          </div>

          <div id="Wallet-payment" class="payment-interface">
            <div class="form-group">
              <label for="wallet-select">Select Wallet</label>
              <select id="wallet-select" class="form-control" required>
                <option value="">-- Select Wallet --</option>
                <option value="PAYTM">Paytm</option>
                <option value="PHONEPE">PhonePe</option>
                <option value="AMAZONPAY">Amazon Pay</option>
                <option value="MOBIKWIK">MobiKwik</option>
              </select>
            </div>
            <div class="form-group">
              <label for="wallet-mobile">Registered Mobile Number</label>
              <input type="tel" id="wallet-mobile" class="form-control" 
                     placeholder="Enter registered mobile" required
                     pattern="[0-9]{10}" title="10 digit mobile number">
            </div>
          </div>
        </div>

        <div class="payment-actions">
        
          <button type="submit" class="btn btn-primary" id="submit-payment">
            Pay ₹<span class="pay-amount">${formattedTotal}</span>
          </button>
        </div>
      </div>
    `

    this.loadAvailableDiscounts()
    // Set up event listeners for dynamic elements
    this.setupPaymentEventListeners()
  }
  removeDiscount() {
    // Restore original prices
    this.state.tickets.forEach((ticket, index) => {
      ticket.price = this.state.originalPrices[index]
    })

    this.state.appliedDiscount = null
    this.renderPaymentForm()
    this.showNotification('Discount removed', 'info')
  }
  setupPaymentEventListeners() {
    // Payment method switching
    document
      .querySelectorAll('input[name="paymentMethod"]')
      .forEach((input) => {
        input.addEventListener('change', () => {
          document.querySelectorAll('.payment-interface').forEach((div) => {
            div.classList.remove('active')
          })
          document
            .getElementById(`${input.value}-payment`)
            .classList.add('active')
        })
      })

    // Netbanking other bank toggle
    document.getElementById('bank-select')?.addEventListener('change', (e) => {
      document.getElementById('netbanking-other').style.display =
        e.target.value === 'OTHER' ? 'block' : 'none'
    })

    // Form submission
    document.getElementById('payment-form')?.addEventListener('submit', (e) => {
      e.preventDefault()
      this.processPayment()
    })

    // UPI app selection
    document.querySelectorAll('.upi-app').forEach((app) => {
      app.addEventListener('click', () => {
        this.selectUPIApp(app.dataset.app)
      })
    })
  }

  selectUPIApp(appName) {
    const upiIdInput = document.getElementById('upi-id')
    if (!upiIdInput) return

    const domains = {
      gpay: '@okicici',
      paytm: '@paytm',
      phonepe: '@ybl',
    }

    const currentValue = upiIdInput.value.split('@')[0] || ''
    upiIdInput.value = currentValue + (domains[appName] || '')
    upiIdInput.focus()
  }

  collectPaymentDetails(method) {
    switch (method) {
      case 'Credit':
        return {
          cardNumber: document
            .getElementById('credit-card-number')
            .value.replace(/\s/g, ''),
          cardName: document.getElementById('credit-card-name').value.trim(),
          cardExpiry: document.getElementById('credit-card-expiry').value,
          cardCvv: document.getElementById('credit-card-cvv').value,
        }
      case 'Debit':
        return {
          cardNumber: document
            .getElementById('debit-card-number')
            .value.replace(/\s/g, ''),
          cardName: document.getElementById('debit-card-name').value.trim(),
          cardExpiry: document.getElementById('debit-card-expiry').value,
          cardCvv: document.getElementById('debit-card-cvv').value,
        }
      case 'UPI':
        return {
          upiId: document.getElementById('upi-id').value.trim(),
        }
      case 'NetBanking':
        const bank = document.getElementById('bank-select').value
        return {
          bank: bank,
          otherBank:
            bank === 'OTHER'
              ? document.getElementById('other-bank').value.trim()
              : null,
        }
      case 'Wallet':
        return {
          wallet: document.getElementById('wallet-select').value,
          mobile: document.getElementById('wallet-mobile').value.trim(),
        }
      default:
        return {}
    }
  }
  async processPayment(e) {
    e.preventDefault()
    this.showLoading()

    try {
      const methodInput = document.querySelector(
        'input[name="paymentMethod"]:checked'
      )
      if (!methodInput) throw new Error('Please select a payment method')

      const paymentMethod = methodInput.value
      let paymentDetails = {}

      // Collect payment details based on method
      if (paymentMethod === 'Credit' || paymentMethod === 'Debit') {
        paymentDetails = {
          cardNumber: document.getElementById('card-number').value,
          cardName: document.getElementById('card-name').value,
          cardExpiry: document.getElementById('card-expiry').value,
          cardCvv: document.getElementById('card-cvv').value,
        }
      } else if (paymentMethod === 'UPI') {
        paymentDetails = {
          upiId: document.getElementById('upi-id').value,
        }
      } else if (paymentMethod === 'NetBanking') {
        paymentDetails = {
          bank: document.getElementById('bank-select').value,
          otherBank: document.getElementById('other-bank')?.value || '',
        }
      } else if (paymentMethod === 'Wallet') {
        paymentDetails = {
          wallet: document.getElementById('wallet-select').value,
          mobile: document.getElementById('wallet-mobile').value,
        }
      }

      // Prepare ticket IDs
      const ticketIds = this.state.tickets.map((ticket) => ticket.ticket_id)
      if (!ticketIds || ticketIds.length === 0) {
        throw new Error('No tickets selected for payment')
      }

      const response = await fetch(`${this.API_BASE_URL}/payments/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({
          ticketIds,
          method: paymentMethod,
          details: paymentDetails,
          discountCode: this.state.appliedDiscount?.code || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Payment failed')
      }

      const result = await response.json()
      this.showNotification('Payment completed successfully', 'success')
      this.showConfirmation(result)
    } catch (error) {
      console.error('Payment error:', error)
      this.showNotification(`Payment failed: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }
  async loadAvailableDiscounts() {
    try {
      const response = await fetch(`${this.API_BASE_URL}/discounts`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Failed to load discounts')
      const result = await response.json()

      this.state.availableDiscounts = result.discounts || []
      this.renderDiscountOptions()
    } catch (error) {
      console.error('Error loading discounts:', error)
      this.state.availableDiscounts = [] // Ensure empty array on error
      this.renderDiscountOptions()
      this.showNotification(
        `Error loading discounts: ${error.message}`,
        'error'
      )
    }
  }

  renderDiscountOptions() {
    const discountContainer = document.getElementById('discount-status')
    if (!discountContainer) return

    // Clear previous content
    discountContainer.innerHTML = ''

    // Check if we have discounts to show
    if (
      !this.state.availableDiscounts ||
      this.state.availableDiscounts.length === 0
    ) {
      discountContainer.innerHTML = `
      <div class="no-discounts">
        <i class="fas fa-tag"></i> No discounts available
      </div>
    `
      return
    }

    // Create discounts header
    const header = document.createElement('h4')
    header.textContent = 'Available Discounts:'
    discountContainer.appendChild(header)

    // Create discount list container
    const listContainer = document.createElement('div')
    listContainer.className = 'available-discounts'
    discountContainer.appendChild(listContainer)

    // Add each discount option
    this.state.availableDiscounts.forEach((discount) => {
      const discountElement = document.createElement('div')
      discountElement.className = 'discount-option'

      discountElement.innerHTML = `
      <div class="discount-info">
        <strong>${discount.code}</strong>
        <span class="discount-percent">${discount.discount_percent}% off</span>
        <small>Valid until: ${new Date(discount.valid_until).toLocaleDateString()}</small>
        ${discount.description ? `<p class="discount-desc">${discount.description}</p>` : ''}
      </div>
      <button type="button" class="btn-small apply-discount-btn" 
              data-code="${discount.code}" 
              data-percent="${discount.discount_percent}">
        Apply
      </button>
    `

      listContainer.appendChild(discountElement)

      // Add click handler for this button
      discountElement
        .querySelector('.apply-discount-btn')
        .addEventListener('click', () => {
          this.applyDiscount(discount.code, discount.discount_percent)
        })
    })
  }

  async applyDiscount(code, percent) {
    if (!code || !percent) {
      this.showNotification('Invalid discount data', 'warning')
      return
    }

    this.showLoading()
    try {
      // Validate the discount first
      const response = await fetch(
        `${this.API_BASE_URL}/discounts/validate/${code}`,
        {
          headers: this.getAuthHeaders(),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Invalid discount code')
      }

      // Apply discount locally
      this.state.appliedDiscount = {
        code: code,
        discount_percent: percent,
      }

      // Update ticket prices with discount
      this.state.tickets.forEach((ticket, index) => {
        ticket.price = this.state.originalPrices[index] * (1 - percent / 100)
      })

      this.renderPaymentForm()
      this.showNotification(
        `Discount "${code}" applied successfully!`,
        'success'
      )
    } catch (error) {
      this.showNotification(`Discount error: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  showConfirmation(paymentResult) {
    // Extract the first processed payment (since we might have multiple tickets)
    const successfulPayment = paymentResult.processed?.[0]

    // Update confirmation details
    document.getElementById('confirmation-code').textContent =
      successfulPayment?.transactionId || 'N/A'

    // Calculate total amount from all processed payments
    const totalAmount =
      paymentResult.processed?.reduce(
        (sum, payment) => sum + payment.amount,
        0
      ) || 0

    document.getElementById('total-paid').textContent =
      `₹${totalAmount.toFixed(2)}`

    // Set up view ticket button - show first ticket if available
    const viewTicketBtn = document.getElementById('view-ticket')
    if (viewTicketBtn) {
      viewTicketBtn.addEventListener('click', () => {
        if (this.state.tickets.length > 0) {
          this.showTicketDetails(this.state.tickets[0].ticket_id)
        }
      })
    }

    // Set up back to dashboard button
    const dashboardBtn = document.getElementById('back-to-dashboard')
    if (dashboardBtn) {
      dashboardBtn.addEventListener('click', () => {
        this.showSection('dashboard')
        this.loadDashboard()
      })
    }

    this.showSection('confirmation')
  }

  async loadUserTickets() {
    // Removed page parameter since we always use page 1
    this.showLoading()
    try {
      const statusFilter =
        document.getElementById('ticket-status-filter')?.value || 'all'
      const params = new URLSearchParams({
        page: 1,
        limit: 100, // Set a high limit to get all tickets at once
      })

      if (statusFilter !== 'all') params.append('status', statusFilter)

      const response = await fetch(`${this.API_BASE_URL}/tickets?${params}`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Failed to load tickets')
      const result = await response.json()

      this.state.tickets = result.data
      this.renderTickets()

      // Remove pagination rendering completely
      document.getElementById('tickets-pagination')?.remove()
    } catch (error) {
      this.showNotification(`Ticket error: ${error.message}`, 'error')
      console.error('Ticket loading error:', error)
    } finally {
      this.hideLoading()
    }
  }

  renderTickets() {
    const ticketsHTML = this.state.tickets
      .map((ticket) => {
        // Safely handle all properties with fallbacks
        const departureTime = ticket.departure_time
          ? this.formatDate(ticket.departure_time)
          : 'N/A'
        const arrivalTime = ticket.arrival_time
          ? this.formatDate(ticket.arrival_time)
          : 'N/A'
        const seatInfo = ticket.seat_number
          ? `${ticket.seat_number} (${ticket.class || 'Economy'})`
          : 'Not assigned'
        const price = ticket.price ? `₹${ticket.price.toFixed(2)}` : '₹0.00'
        const status = ticket.status || 'Unknown'
        const statusClass = status.toLowerCase().replace(' ', '-')
        const isPending = status === 'Pending'

        // Calculate time status
        const timeStatus = this.calculateTimeUntil(
          ticket.departure_time,
          ticket.arrival_time,
          ticket.flight_status
        )

        return `
        <div class="ticket-card ${statusClass}" data-id="${ticket.ticket_id}">
          <div class="ticket-header">
            <div class="flight-info">
              <h4 class="flight-number">
                <i class="fas fa-plane"></i> ${ticket.flight_number || 'N/A'}(${ticket.flight_status || 'N/A'})
              </h4>
              <div class="flight-time-status ${timeStatus?.status || ''}">
                <i class="${timeStatus?.icon || 'fas fa-question'}"></i>
                <span>${timeStatus?.text || 'N/A'}</span>
              </div>
            </div>
            <span class="ticket-status-badge ${statusClass}">
              ${status}
            </span>
          </div>

          <div class="ticket-body">
            <div class="route-info">
              <div class="airport origin">
                <span class="code">${ticket.departure_airport || 'N/A'}</span>
                <span class="name">${ticket.departure_city || ''}</span>
              </div>
              <div class="flight-duration">
                ${this.calculateDuration(ticket.departure_time, ticket.arrival_time) || 'N/A'}
              </div>
              <div class="airport destination">
                <span class="code">${ticket.arrival_airport || 'N/A'}</span>
                <span class="name">${ticket.arrival_city || ''}</span>
              </div>
            </div>

            <div class="ticket-meta">
              <div class="meta-item">
                <i class="far fa-calendar-alt"></i>
                <span>${departureTime}</span>
              </div>
              <div class="meta-item">
                <i class="fas fa-chair"></i>
                <span>${seatInfo}</span>
              </div>
              <div class="meta-item price">
                <i class="fas fa-tag"></i>
                <span>${price}</span>
              </div>
            </div>
          </div>

          <div class="ticket-actions">
            <button class="btn btn-secondary view-ticket" data-id="${ticket.ticket_id}">
              <i class="fas fa-ticket-alt"></i> Details
            </button>
            ${
              isPending
                ? `
              <button class="btn btn-primary retry-payment" data-id="${ticket.ticket_id}">
                <i class="fas fa-credit-card"></i> Retry Payment
              </button>
            `
                : ''
            }
          </div>
        </div>
        `
      })
      .join('')

    document.getElementById('tickets-list').innerHTML =
      ticketsHTML ||
      `
      <div class="empty-state">
        <i class="fas fa-ticket-alt"></i>
        <h4>No tickets found</h4>
       
      </div>
    `

    // Add event listeners for the buttons
    document.querySelectorAll('.view-ticket').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.viewTicketDetails(e.currentTarget.dataset.id)
      })
    })

    document.querySelectorAll('.retry-payment').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.retryPayment(e.currentTarget.dataset.id)
      })
    })

    document
      .getElementById('book-first-flight')
      ?.addEventListener('click', () => {
        this.showFlightSearch()
      })
  }
  calculateTimeUntil(departureTime, arrivalTime, currentStatus) {
    if (!departureTime) return null

    const now = new Date()
    const departure = new Date(departureTime)
    const arrival = arrivalTime ? new Date(arrivalTime) : null
    const diffMs = departure - now

    // Handle different flight statuses
    if (currentStatus === 'Departed' || currentStatus === 'Arrived') {
      return {
        text: currentStatus === 'Arrived' ? 'Arrived' : 'Departed',
        status: 'past',
        icon:
          currentStatus === 'Arrived'
            ? 'fas fa-check-circle'
            : 'fas fa-plane-departure',
      }
    }

    // If flight hasn't departed yet
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    )
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    // Determine status categories
    const soon = diffMs > 0 && diffMs < 1000 * 60 * 60 * 24 // Within 24 hours
    const immediate = diffMs > 0 && diffMs < 1000 * 60 * 60 // Within 1 hour
    const boarding = diffMs > 0 && diffMs < 1000 * 60 * 30 // Within 30 minutes

    if (boarding) {
      return {
        text: 'Boarding soon',
        status: 'boarding',
        icon: 'fas fa-running',
      }
    } else if (immediate) {
      return {
        text: `${diffHours}h ${diffMins}m`,
        status: 'immediate',
        icon: 'fas fa-exclamation-triangle',
      }
    } else if (soon) {
      return {
        text: `${diffHours}h ${diffMins}m`,
        status: 'soon',
        icon: 'fas fa-hourglass-half',
      }
    } else if (diffDays > 0) {
      return {
        text: `${diffDays}d ${diffHours}h`,
        status: 'scheduled',
        icon: 'far fa-calendar-alt',
      }
    } else if (diffMs > 0) {
      return {
        text: 'Departing soon',
        status: 'soon',
        icon: 'fas fa-plane',
      }
    } else if (arrival && now < arrival) {
      return {
        text: 'In flight',
        status: 'inflight',
        icon: 'fas fa-plane',
      }
    } else {
      return {
        text: 'Flight completed',
        status: 'past',
        icon: 'fas fa-check-circle',
      }
    }
  }
  setupTicketEventListeners() {
    // Use event delegation for dynamically created elements
    document.addEventListener('click', (e) => {
      if (e.target.closest('.view-ticket')) {
        const ticketId = e.target.closest('.view-ticket').dataset.id
        this.showTicketDetails(ticketId)
      }

      if (e.target.closest('.retry-payment')) {
        const ticketId = e.target.closest('.retry-payment').dataset.id
        this.retryPayment(ticketId)
      }
    })
  }
  async retryPayment(ticketId) {
    this.showLoading()
    try {
      // Get the latest ticket details
      const response = await fetch(`${this.API_BASE_URL}/tickets/${ticketId}`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Failed to fetch ticket details')
      const { ticket } = await response.json()

      if (!ticket) throw new Error('Ticket not found')
      if (ticket.status !== 'Pending') {
        throw new Error('Only pending tickets can be retried')
      }

      // Set up state for payment retry
      this.state = {
        ...this.state,
        selectedFlight: {
          flight_id: ticket.flight_id,
          flight_number: ticket.flight_number,
        },
        tickets: [
          {
            ticket_id: ticket.ticket_id,
            seat_number: ticket.seat_number,
            class: ticket.class,
            price: ticket.price,
          },
        ],
        isRetry: true,
      }

      // Render payment form
      this.renderPaymentForm()
      this.showSection('payment')
    } catch (error) {
      this.showNotification(`Retry error: ${error.message}`, 'error')
      console.error('Retry payment error:', error)
    } finally {
      this.hideLoading()
    }
  }
  renderPagination() {
    const totalPages = Math.ceil(this.state.totalTickets / this.ITEMS_PER_PAGE)
    const paginationContainer = document.getElementById('tickets-pagination')

    // Clear any existing pagination
    if (paginationContainer) {
      paginationContainer.innerHTML = ''
    }

    // Only show pagination if there are multiple pages
    if (totalPages <= 1) return

    const paginationHTML = `
    <div class="pagination">
      ${
        this.state.currentPage > 1
          ? `
        <button class="btn btn-secondary pagination-btn" data-page="${this.state.currentPage - 1}">
          Previous
        </button>
      `
          : ''
      }
      
      <span>Page ${this.state.currentPage} of ${totalPages}</span>
      
      ${
        this.state.currentPage < totalPages
          ? `
        <button class="btn btn-secondary pagination-btn" data-page="${this.state.currentPage + 1}">
          Next
        </button>
      `
          : ''
      }
    </div>
  `

    if (paginationContainer) {
      paginationContainer.innerHTML = paginationHTML
    }
  }

  formatStatus(status) {
    const statusMap = {
      Confirmed: 'Confirmed',
      Pending: 'Pending Payment',
      Cancelled: 'Cancelled',
      'Refund Requested': 'Refund Pending',
      Expired: 'Expired',
    }
    return statusMap[status] || status || 'Unknown'
  }

  formatFlightStatus(status, departureDate, arrivalDate) {
    const now = new Date()
    const statusMap = {
      Scheduled: departureDate > now ? 'Scheduled' : 'Departed',
      Departed: 'In Progress',
      Arrived: 'Completed',
      Delayed: 'Delayed',
      Canceled: 'Cancelled',
    }
    return statusMap[status] || status || 'Unknown'
  }

  async showTicketDetails(ticketId) {
    this.showLoading()
    try {
      const response = await fetch(`${this.API_BASE_URL}/tickets/${ticketId}`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Failed to load ticket details')
      const { ticket, refund, payment } = await response.json()

      if (!ticket) throw new Error('Ticket data not found')

      // Basic ticket information
      document.getElementById('ticket-flight-number').textContent =
        ticket.flight_number || 'N/A'

      const statusElement = document.getElementById('ticket-status')
      statusElement.textContent = ticket.status || 'Unknown'
      statusElement.className = `ticket-status status-${ticket.status?.toLowerCase() || 'unknown'}`

      document.getElementById('ticket-passenger').textContent = ticket.passenger
        ? `${ticket.passenger.first_name} ${ticket.passenger.last_name}`
        : 'N/A'
      document.getElementById('ticket-passport').textContent =
        ticket.passenger?.passport_number || 'N/A'
      document.getElementById('ticket-seat').textContent =
        `${ticket.seat_number || 'N/A'} (${ticket.class || 'Unknown'})`

      document.getElementById('ticket-departure').textContent = this.formatDate(
        ticket.departure_time
      )
      document.getElementById('ticket-arrival').textContent = this.formatDate(
        ticket.arrival_time
      )

      document.getElementById('ticket-airline').textContent =
        ticket.airline?.name || 'N/A'
      document.getElementById('ticket-departure-code').textContent =
        ticket.departure?.code || 'N/A'
      document.getElementById('ticket-arrival-code').textContent =
        ticket.arrival?.code || 'N/A'

      // Flight status
      const flightStatusElement = document.getElementById(
        'ticket-flight-status'
      )
      if (flightStatusElement) {
        flightStatusElement.textContent = ticket.flight_status || 'Unknown'
        flightStatusElement.dataset.status = ticket.flight_status || ''
      }

      // Payment Information Section
      const paymentInfoGrid = document.querySelector('.payment-details-grid')
      paymentInfoGrid.innerHTML = `
        <div class="detail-item">
          <label>Ticket Price</label>
          <p>₹${ticket.price?.toFixed(2) || '0.00'}</p>
        </div>
        
      `

      // Set ticket ID on all action buttons
      const actionButtons = [
        'print-ticket',
        'cancel-ticket',
        'request-refund',
        'write-review',
      ]
      actionButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId)
        if (btn) btn.dataset.ticketId = ticket.ticket_id
      })

      const now = new Date()
      const departureDate = new Date(ticket.departure_time)
      const arrivalDate = new Date(ticket.arrival_time)
      const isFlightCompleted = arrivalDate < now
      const isFlightUpcoming = departureDate > now

      const printBtn = document.getElementById('print-ticket')
      const cancelBtn = document.getElementById('cancel-ticket')
      const refundBtn = document.getElementById('request-refund')
      const reviewBtn = document.getElementById('write-review')

      const refundStatusDiv = document.getElementById('refund-status')
      const refundDetailsGrid = refundStatusDiv.querySelector(
        '.refund-details-grid'
      )

      ;[printBtn, cancelBtn, refundBtn, reviewBtn].forEach((btn) => {
        if (btn) btn.style.display = 'none'
      })
      if (refundStatusDiv) refundStatusDiv.style.display = 'none'

      if (ticket.status === 'Confirmed') {
        printBtn.style.display = 'inline-block'

        if (isFlightCompleted) {
          reviewBtn.style.display = 'inline-block'
          reviewBtn.addEventListener('click', () => this.showReviewForm(ticket))
        } else if (
          ticket.flight_status === 'Scheduled' ||
          ticket.flight_status === 'Delayed'
        ) {
          cancelBtn.style.display = 'inline-block'
          refundBtn.style.display = 'inline-block'
        }
      } else if (
        ticket.status === 'Cancelled' ||
        ticket.status === 'Refund Requested'
      ) {
        printBtn.style.display = 'inline-block'

        if (ticket.refund) {
          const originalAmount = ticket.price
          const refundAmount = ticket.refund.amount
          const penaltyAmount = originalAmount - refundAmount
          const penaltyPercentage = (
            (penaltyAmount / originalAmount) *
            100
          ).toFixed(2)

          refundStatusDiv.style.display = 'block'
          refundDetailsGrid.innerHTML = `
            <div class="detail-item">
              <label>Refund Status</label>
              <p class="refund-status-${ticket.refund.status.toLowerCase()}">
                ${ticket.refund.status}
              </p>
            </div>
            <div class="detail-item">
              <label>Original Amount</label>
              <p>₹${originalAmount?.toFixed(2) || '0.00'}</p>
            </div>
            <div class="detail-item">
              <label>Refund Amount</label>
              <p>₹${refundAmount?.toFixed(2) || '0.00'}</p>
            </div>
            <div class="detail-item">
              <label>Penalty Deducted</label>
              <p>₹${penaltyAmount.toFixed(2)} (${penaltyPercentage}%)</p>
            </div>
            <div class="detail-item">
              <label>Processing Time</label>
              <p>${ticket.refund.estimated_processing_time || '7-10 business days'}</p>
            </div>
            ${
              ticket.refund.request_reason
                ? `
            <div class="detail-item">
              <label>Refund Reason</label>
              <p>${ticket.refund.request_reason}</p>
            </div>`
                : ''
            }
            ${
              ticket.refund.admin_comment
                ? `
            <div class="detail-item">
              <label>Admin Comments</label>
              <p>${ticket.refund.admin_comment}</p>
            </div>`
                : ''
            }
            <div class="detail-item">
              <label>Refund Request Date</label>
              <p>${this.formatDate(ticket.refund.created_at)}</p>
            </div>
          `
        }
      }

      this.showSection('ticketDetails')
    } catch (error) {
      console.error('Ticket details error:', error)
      this.showNotification(
        error.message.includes('undefined')
          ? 'Invalid ticket data received'
          : error.message,
        'error'
      )
      this.showSection('tickets')
    } finally {
      this.hideLoading()
    }
  }
  formatDateTime(dateString) {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  }
  async cancelTicket(ticketId) {
    if (
      !confirm(
        'Are you sure you want to cancel this ticket? You may be subject to cancellation fees.'
      )
    )
      return

    this.showLoading()
    try {
      const response = await fetch(`${this.API_BASE_URL}/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Cancel failed')
      }

      this.showNotification('Ticket cancelled successfully', 'success')
      await this.loadUserTickets()
      this.showSection('tickets')
    } catch (error) {
      console.error('Cancel error:', error)
      this.showNotification(`Cancel failed: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  async requestRefund(ticketId) {
    if (
      !confirm(
        'Are you sure you want to request a refund? This may take 7-10 business days to process.'
      )
    )
      return

    this.showLoading()
    try {
      const response = await fetch(
        `${this.API_BASE_URL}/tickets/${ticketId}/refund`,
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            reason: 'User requested refund',
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Refund request failed')
      }

      this.showNotification('Refund requested successfully', 'success')
      await this.loadUserTickets()
      this.showSection('tickets')
    } catch (error) {
      console.error('Refund error:', error)
      this.showNotification(`Refund request failed: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  async updateProfile(e) {
    e.preventDefault()
    this.showLoading()

    try {
      const formData = new FormData(e.target)
      const updates = {
        username: formData.get('name'),
        currentPassword: formData.get('current_password'),
        newPassword: formData.get('new_password'),
      }

      const response = await fetch(`${this.API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) throw new Error('Update failed')
      this.showNotification('Profile updated', 'success')
      await this.loadUserProfile()
    } catch (error) {
      this.showNotification(`Update error: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  async loadUserReviews() {
    this.showLoading()
    try {
      const response = await fetch(`${this.API_BASE_URL}/reviews`, {
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) throw new Error('Failed to load reviews')
      const result = await response.json()
      this.state.reviews = result.data || []
      this.renderReviews()
    } catch (error) {
      this.showNotification(`Review error: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  renderReviews() {
    const reviewsContainer = document.getElementById('reviews-list')
    if (!reviewsContainer) return

    if (!this.state.reviews || this.state.reviews.length === 0) {
      reviewsContainer.innerHTML = `
        <div class="empty-state glass">
            <p>You haven't submitted any reviews yet</p>
            <div class="review-cta">
              
                <p style="margin-top: 10px;">
                    <a href="#" data-section="flightSearch" style="color: var(--accent-color);">
                        Book a flight to review or Write your reviews for already travelled flights with your confirmed tickets
                    </a>
                </p>
            </div>
        </div>`
      return
    }

    const reviewsHTML = this.state.reviews
      .map(
        (review) => `
        <div class="review-card glass" data-id="${review.review_id}">
            <div class="review-header">
                <div>
                    <h4>Flight ${review.flight_number || 'N/A'}</h4>
                    <p class="route">${review.departure_code} → ${review.arrival_code}</p>
                </div>
                <div class="review-rating">
                    ${this.renderRatingStars(review.rating)}
                    <span class="rating-value">${review.rating.toFixed(1)}</span>
                </div>
            </div>
            <div class="review-content">
                <p class="review-text">${review.comment || 'No comment provided'}</p>
                <p class="review-meta">
                    Submitted on ${this.formatDate(review.created_at)} • 
                    ${review.is_anonymous ? 'Anonymous' : 'Public'}
                </p>
            </div>
            <div class="review-actions">
                
                <button class="btn-icon" onclick="app.deleteReview('${review.review_id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        `
      )
      .join('')

    reviewsContainer.innerHTML = `
        <div class="reviews-header">
            <h2>Your Reviews</h2>
           
        </div>
        <div class="reviews-grid">
            ${reviewsHTML}
        </div>`
  }

  renderRatingStars(rating) {
    const fullStars = '<i class="fas fa-star"></i>'.repeat(Math.floor(rating))
    const halfStar =
      rating % 1 >= 0.5 ? '<i class="fas fa-star-half-alt"></i>' : ''
    const emptyStars = '<i class="far fa-star"></i>'.repeat(
      5 - Math.ceil(rating)
    )
    return `<span class="stars">${fullStars}${halfStar}${emptyStars}</span>`
  }

  async showReviewForm(ticket) {
    try {
      const formHTML = `
      <div class="review-form-container glass">
        <h3>Write a Review</h3>
        <form id="review-form">
          <div class="form-group">
            <label for="review-rating">Rating (1-5)</label>
            <select id="review-rating" class="form-control" required>
              <option value="">Select rating</option>
              ${[1, 2, 3, 4, 5]
                .map(
                  (num) => `
                <option value="${num}">${num} - ${['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][num - 1]}</option>
              `
                )
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="review-comment">Comments</label>
            <textarea id="review-comment" class="form-control" rows="4" placeholder="Share your experience..."></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">
              Submit Review
            </button>
            <button type="button" id="cancel-review" class="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `

      this.showModal(formHTML)

      // Form submission handler
      document
        .getElementById('review-form')
        .addEventListener('submit', async (e) => {
          e.preventDefault()
          await this.submitReview(ticket, null)
        })

      // Cancel handler
      document.getElementById('cancel-review').addEventListener('click', () => {
        this.closeModal()
      })
    } catch (error) {
      console.error('Review form error:', error)
      this.showNotification(
        error.message.includes('not arrived') ||
          error.message.includes('No confirmed ticket')
          ? error.message
          : 'Failed to load review form',
        'error'
      )
    }
  }

  renderReviewForm(ticket) {
    const reviewFormHTML = `
    <div class="review-form-container glass">
      <h3>Write Review for Flight ${ticket.flight_number}</h3>
      <form id="review-form">
        <div class="form-group">
          <label for="review-rating">Rating (1-5)</label>
          <select id="review-rating" class="form-control" required>
            <option value="">Select rating</option>
            <option value="1">1 - Poor</option>
            <option value="2">2 - Fair</option>
            <option value="3">3 - Good</option>
            <option value="4">4 - Very Good</option>
            <option value="5">5 - Excellent</option>
          </select>
        </div>
        <div class="form-group">
          <label for="review-comment">Comments</label>
          <textarea id="review-comment" class="form-control" rows="4" placeholder="Share your experience..."></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Submit Review</button>
          <button type="button" id="cancel-review" class="btn btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  `

    // Create a modal or show in a section
    this.showModal(reviewFormHTML)

    // Add form submission handler
    document
      .getElementById('review-form')
      .addEventListener('submit', async (e) => {
        e.preventDefault()
        await this.submitReview(ticket)
      })

    // Add cancel handler
    document.getElementById('cancel-review').addEventListener('click', () => {
      this.closeModal()
    })
  }
  setupRatingStars() {
    const stars = document.querySelectorAll('#rating-stars .fa-star')
    stars.forEach((star) => {
      star.addEventListener('mouseover', () =>
        this.hoverRating(star.dataset.rating)
      )
      star.addEventListener('click', () => this.setRating(star.dataset.rating))
    })
    document.getElementById('rating-stars').addEventListener('mouseout', () => {
      const currentRating =
        parseInt(document.getElementById('review-rating').value) || 0
      this.setRating(currentRating)
    })
  }

  hoverRating(rating) {
    const stars = document.querySelectorAll('#rating-stars .fa-star')
    stars.forEach((star, index) => {
      if (index < rating) {
        star.classList.add('fas')
        star.classList.remove('far')
      } else {
        star.classList.add('far')
        star.classList.remove('fas')
      }
    })
  }

  setRating(rating) {
    document.getElementById('review-rating').value = rating
    this.hoverRating(rating)
  }

  cancelReviewForm() {
    this.loadUserReviews()
  }

  async submitReview(ticket, reviewId = null) {
    this.showLoading()
    try {
      const rating = document.getElementById('review-rating').value
      const comment = document.getElementById('review-comment').value

      if (!rating) {
        throw new Error('Please select a rating')
      }

      const url = reviewId
        ? `${this.API_BASE_URL}/reviews/${reviewId}`
        : `${this.API_BASE_URL}/reviews`

      const method = reviewId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method: method,
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flight_id: reviewId ? undefined : ticket.flight_id, // Only for new reviews
          rating: parseInt(rating),
          comment: comment || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit review')
      }

      this.showNotification(
        reviewId
          ? 'Review updated successfully!'
          : 'Review submitted successfully!',
        'success'
      )
      this.closeModal()
      this.loadUserReviews() // Refresh the reviews list

      if (ticket) {
        this.showTicketDetails(ticket.ticket_id)
      }
    } catch (error) {
      console.error('Review submission error:', error)
      this.showNotification(
        error.message.includes('not arrived') ||
          error.message.includes('No confirmed ticket')
          ? error.message
          : 'Failed to submit review',
        'error'
      )
    } finally {
      this.hideLoading()
    }
  }
  async deleteReview(reviewId) {
    if (!confirm('Are you sure you want to delete this review?')) return

    this.showLoading()
    try {
      const response = await fetch(`${this.API_BASE_URL}/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete review')
      }

      this.showNotification('Review deleted successfully', 'success')
      this.loadUserReviews()
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  async editReview(reviewId) {
    this.showLoading()
    try {
      // Find the review in state
      const review = this.state.reviews.find((r) => r.review_id === reviewId)
      if (!review) throw new Error('Review not found')

      // Get the flight details for this review
      const flightResponse = await fetch(
        `${this.API_BASE_URL}/flights/${review.flight_id}`,
        {
          headers: this.getAuthHeaders(),
        }
      )

      if (!flightResponse.ok) throw new Error('Failed to load flight details')
      const flightData = await flightResponse.json()

      // Create the edit form HTML
      const formHTML = `
      <div class="review-form-container glass">
        <h3>Edit Review for Flight ${flightData.flight_number}</h3>
        <form id="review-form">
          <input type="hidden" id="review-id" value="${review.review_id}">
          <div class="form-group">
            <label for="review-rating">Rating (1-5)</label>
            <div id="rating-stars" class="rating-stars">
              ${[1, 2, 3, 4, 5]
                .map(
                  (num) => `
                <i class="${num <= review.rating ? 'fas' : 'far'} fa-star" 
                   data-rating="${num}"></i>
              `
                )
                .join('')}
            </div>
            <select id="review-rating" class="form-control" required>
              <option value="">Select rating</option>
              ${[1, 2, 3, 4, 5]
                .map(
                  (num) => `
                <option value="${num}" ${num === review.rating ? 'selected' : ''}>
                  ${num} - ${['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][num - 1]}
                </option>
              `
                )
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="review-comment">Comments</label>
            <textarea id="review-comment" class="form-control" rows="4">${review.comment || ''}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">
              Update Review
            </button>
            <button type="button" id="cancel-review" class="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `

      this.showModal(formHTML)

      // Initialize rating stars
      this.setupRatingStars()

      // Form submission handler
      document
        .getElementById('review-form')
        .addEventListener('submit', async (e) => {
          e.preventDefault()
          await this.submitReview(null, review.review_id) // Passing review_id for update
        })

      // Cancel handler
      document.getElementById('cancel-review').addEventListener('click', () => {
        this.closeModal()
      })
    } catch (error) {
      console.error('Edit review error:', error)
      this.showNotification(`Error: ${error.message}`, 'error')
    } finally {
      this.hideLoading()
    }
  }

  async loadCompletedFlights() {
    try {
      const response = await fetch(`${this.API_BASE_URL}/flights/completed`, {
        headers: this.getAuthHeaders(),
      })
      if (!response.ok) throw new Error('Failed to load flights')
      this.state.completedFlights = (await response.json()).data || []
    } catch (error) {
      console.error('Error loading flights:', error)
      this.state.completedFlights = []
    }
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A'

    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return 'Invalid Date'

      return date.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch (e) {
      console.error('Date formatting error:', e)
      return 'Invalid Date'
    }
  }
  getAuthHeaders() {
    const token = localStorage.getItem('token')
    if (!token) this.redirectToLogin()
    return { Authorization: `Bearer ${token}` }
  }
  resetFlightSearchForm() {
    const form = this.elements.forms.flightSearch
    if (form) {
      form.reset()
      document.getElementById('flight-results').innerHTML =
        '<div class="empty-state glass">Search for flights to see results</div>'
    }
  }
  setupAutoLogout() {
    this.resetSessionTimer()
    ;['mousemove', 'keydown', 'click'].forEach((event) => {
      document.addEventListener(event, this.resetSessionTimer.bind(this))
    })
  }

  resetSessionTimer() {
    clearTimeout(this.sessionTimeout)
    this.sessionTimeout = setTimeout(() => {
      this.logout()
      this.showNotification('Session expired', 'warning')
    }, this.SESSION_TIMEOUT)
  }
  async refreshFlightData() {
    console.debug('[POLLING] Refreshing flight data')
    if (this.selectedFlight) {
      try {
        const [flightResponse, seatsResponse] = await Promise.all([
          fetch(
            `${this.API_BASE_URL}/flights/${this.selectedFlight.flight_id}`,
            {
              headers: this.getAuthHeaders(),
            }
          ),
          fetch(
            `${this.API_BASE_URL}/flights/${this.selectedFlight.flight_id}/seats`,
            {
              headers: this.getAuthHeaders(),
            }
          ),
        ])

        if (flightResponse.status === 401 || seatsResponse.status === 401) {
          console.warn('[POLLING] Unauthorized, logging out')
          this.logout()
          return
        }

        if (flightResponse.ok && seatsResponse.ok) {
          const [flightData, seatsData] = await Promise.all([
            flightResponse.json(),
            seatsResponse.json(),
          ])

          console.debug('[POLLING] Flight data refreshed:', {
            flightData,
            seatsData,
          })
          this.selectedFlight = { ...flightData, seats: seatsData }

          if (
            document
              .getElementById('seatSelection-section')
              .classList.contains('active')
          ) {
            this.renderSeatLayout(this.selectedFlight.seats)
          }
        }
      } catch (error) {
        console.error('[POLLING] Error refreshing flight data:', error)
      }
    }
  }
  startBackgroundPolling() {
    setInterval(async () => {
      await this.refreshFlightData()
      if (
        document.getElementById('tickets-section')?.classList.contains('active')
      ) {
        await this.loadUserTickets()
      }
    }, this.POLL_INTERVAL)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new FlightBookingApp()
  window.app = app
  window.applyDiscount = () => app.applyDiscount()
  window.selectUPIApp = (app) => app.selectUPIApp(app)
})
