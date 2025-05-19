const API_BASE_URL = 'http://localhost:3000/api/admin'
let currentUser = null
let currentAirportId = null

// DOM Elements
const logoutButton = document.getElementById('logout-button')
const dashboardSection = document.getElementById('dashboard')
const navLinks = document.querySelectorAll('.nav-link')
const searchInputs = document.querySelectorAll('.search-input')
const errorDisplay = document.getElementById('error-display')
const createForms = document.querySelectorAll('.create-form')
const bulkForms = document.querySelectorAll('.bulk-form')
const exportButtons = document.querySelectorAll('.export-button')
const hamburger = document.getElementById('hamburger')
const adminNav = document.getElementById('admin-nav')
const createButtons = document.querySelectorAll('.create-button')
const bulkButtons = document.querySelectorAll('.bulk-button')
const toggleForms = document.querySelectorAll('.toggle-form')

// Event Listeners
document.addEventListener('DOMContentLoaded', initApp)
if (logoutButton) logoutButton.addEventListener('click', handleLogout)
navLinks.forEach((link) => link.addEventListener('click', handleNavClick))
searchInputs.forEach((input) => input.addEventListener('input', handleSearch))
createForms.forEach((form) => form.addEventListener('submit', handleCreate))
bulkForms.forEach((form) => form.addEventListener('submit', handleBulkCreate))
exportButtons.forEach((button) =>
  button.addEventListener('click', handleExport)
)
if (hamburger) hamburger.addEventListener('click', toggleNav)
createButtons.forEach((button) =>
  button.addEventListener('click', toggleCreateForm)
)
bulkButtons.forEach((button) =>
  button.addEventListener('click', toggleBulkForm)
)
toggleForms.forEach((button) =>
  button.addEventListener('click', toggleFormVisibility)
)

function refreshCurrentSection() {
  const activeSection =
    document.querySelector('.content-section[style="display: block;"]') ||
    document.querySelector('.content-section:not([style*="display: none"])')

  if (!activeSection) return

  const sectionId = activeSection.id

  switch (sectionId) {
    case 'dashboard':
      loadDashboard()
      break
    case 'airlines':
      loadAirlines()
      break
    case 'airports':
      loadAirports()
      break
    case 'flights':
      loadFlights()
      break
    case 'discounts':
      loadDiscounts()
      break
    case 'users':
      loadUsers()
      break
    case 'tickets':
      loadTickets()
      break
    case 'passengers':
      loadPassengers()
      break
    case 'refunds':
      loadRefunds()
      break
    case 'reviews':
      loadReviews()
      break
  }
}
// Initialize App
function initApp() {
  checkAuth()
  loadDashboard('day')
  initializeCreateFlightForm()
}

function checkAuth() {
  const token = localStorage.getItem('token')
  if (!token) {
    window.location.href = 'login.html'
    return
  }

  try {
    const tokenPayload = JSON.parse(atob(token.split('.')[1]))
    const expirationTime = tokenPayload.exp * 1000
    const currentTime = Date.now()

    if (currentTime > expirationTime) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = 'login.html'
      return
    }

    currentUser = JSON.parse(localStorage.getItem('user'))
    if (!currentUser || currentUser.role !== 'admin') {
      showAccessDenied()
      return
    }
    showAuthenticatedUI()
  } catch (error) {
    console.error('Error verifying authentication:', error)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = 'login.html'
  }
}

function showAccessDenied() {
  const loginSection = document.getElementById('login-section')
  const adminSection = document.getElementById('admin-section')
  if (loginSection) loginSection.style.display = 'none'
  if (adminSection) adminSection.style.display = 'none'
}

function showAuthenticatedUI() {
  const loginSection = document.getElementById('login-section')
  const adminSection = document.getElementById('admin-section')
  const usernameEl = document.getElementById('username')
  if (loginSection) loginSection.style.display = 'none'
  if (adminSection) adminSection.style.display = 'block'
  if (usernameEl && currentUser) usernameEl.textContent = currentUser.username
}

async function handleLogout() {
  try {
    const response = await fetch(`${API_BASE_URL}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (response.ok) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      currentUser = null
      window.location.href = 'login.html'
    } else {
      const data = await response.json()
      showError(data.message || data.error || 'Failed to logout')
    }
  } catch (error) {
    showError('An error occurred during logout. Please try again.')
  }
}

function handleNavClick(e) {
  e.preventDefault()
  const sectionId = e.target.getAttribute('data-section')
  hideAllSections()
  const section = document.getElementById(sectionId)
  if (section) section.style.display = 'block'

  switch (sectionId) {
    case 'dashboard':
      loadDashboard()
      break
    case 'airlines':
      loadAirlines()
      break
    case 'airports':
      loadAirports()
      break
    case 'flights':
      loadFlights()
      break
    case 'discounts':
      loadDiscounts()
      break
    case 'users':
      loadUsers()
      break
    case 'tickets':
      loadTickets()
      break
    case 'passengers':
      loadPassengers()
      break
    case 'refunds':
      loadRefunds()
      break
    case 'reviews':
      loadReviews()
      break
  }
}

function hideAllSections() {
  document.querySelectorAll('.content-section').forEach((section) => {
    section.style.display = 'none'
  })
}

function handleSearch(e) {
  const sectionId = e.target.getAttribute('data-section')
  const query = e.target.value
  switch (sectionId) {
    case 'airlines':
      loadAirlines(query)
      break
    case 'airports':
      loadAirports(query)
      break
    case 'flights':
      loadFlights(query)
      break
    case 'discounts':
      loadDiscounts(query)
      break
    case 'users':
      loadUsers(query)
      break
    case 'tickets':
      loadTickets(query)
      break
    case 'passengers':
      loadPassengers(query)
      break
    case 'refunds':
      loadRefunds(query)
      break
    case 'reviews':
      loadReviews(query)
      break
  }
}

function showError(message, isSuccess = false) {
  if (!errorDisplay) return

  errorDisplay.textContent = ''
  errorDisplay.className = 'message'

  errorDisplay.textContent = message
  errorDisplay.classList.add(isSuccess ? 'success' : 'error')
  errorDisplay.style.display = 'block'

  setTimeout(() => {
    if (errorDisplay) {
      errorDisplay.style.display = 'none'
      errorDisplay.textContent = ''
    }
  }, 5000)
}

function toggleCreateForm(e) {
  e.preventDefault()
  const sectionId = e.target.getAttribute('data-section')
  const createForm = document.getElementById(`create-${sectionId}-form`)
  if (createForm) {
    createForm.style.display =
      createForm.style.display === 'none' ? 'block' : 'none'
  }
}

function toggleBulkForm(e) {
  e.preventDefault()
  const sectionId = e.target.getAttribute('data-section')
  const bulkForm = document.getElementById(`bulk-${sectionId}-form`)
  if (bulkForm) {
    bulkForm.style.display =
      bulkForm.style.display === 'none' ? 'block' : 'none'
  }
}

function toggleFormVisibility(e) {
  e.preventDefault()
  const targetId = e.target.getAttribute('data-target')
  const form = document.getElementById(targetId)
  if (form) {
    form.style.display = form.style.display === 'none' ? 'block' : 'none'
  }
}

async function initializeCreateFlightForm() {
  try {
    const [airlinesRes, airportsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/airlines`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }),
      fetch(`${API_BASE_URL}/airports`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }),
    ])

    if (!airlinesRes.ok || !airportsRes.ok) {
      throw new Error('Failed to load flight creation data')
    }

    const airlinesData = await airlinesRes.json()
    const airportsData = await airportsRes.json()

    const activeAirlines = airlinesData.data?.filter((a) => a.is_active) || []
    const activeAirports = airportsData.data?.filter((a) => a.is_active) || []

    renderSelectOptions(
      'flight-airline',
      activeAirlines,
      'airline_id',
      'name',
      'code'
    )
    renderSelectOptions(
      'flight-departure',
      activeAirports,
      'airport_id',
      'name',
      'code'
    )
    renderSelectOptions(
      'flight-arrival',
      activeAirports,
      'airport_id',
      'name',
      'code'
    )
  } catch (error) {
    console.error('Error initializing flight form:', error)
    showError(`Failed to initialize flight form: ${error.message}`)
  }
}

function renderSelectOptions(elementId, data, valueKey, labelKey, codeKey) {
  const selectElement = document.getElementById(elementId)
  if (!selectElement) return

  if (data.length === 0) {
    selectElement.innerHTML = `<option disabled>No active options available</option>`
    return
  }

  selectElement.innerHTML = data
    .map(
      (item) =>
        `<option value="${item[valueKey]}">${item[labelKey]} (${item[codeKey]})</option>`
    )
    .join('')
}

async function handleCreate(e) {
  e.preventDefault()
  const formId = e.target.id

  if (formId === 'create-flight-form') {
    await submitCreateFlightForm(e)
    return
  }

  const formData = new FormData(e.target)
  let payload = {}

  // Convert form data to payload object
  formData.forEach((value, key) => {
    if (key === 'is_active') {
      payload[key] = value === 'on'
    } else {
      payload[key] = value
    }
  })

  try {
    let endpoint = ''
    let entityName = ''

    // Determine endpoint and apply specific transformations
    switch (formId) {
      case 'create-airline-form':
        endpoint = 'airlines'
        entityName = 'airline'
        if (payload.code)
          payload.code = payload.code.toUpperCase().substring(0, 2)
        break
      case 'create-airport-form':
        endpoint = 'airports'
        entityName = 'airport'
        if (payload.code)
          payload.code = payload.code.toUpperCase().substring(0, 3)
        break
      case 'create-discount-form':
        endpoint = 'discounts'
        entityName = 'discount'
        if (payload.code)
          payload.code = payload.code.toUpperCase().replace(/\s+/g, '_')
        payload.valid_from = new Date(payload.valid_from).toISOString()
        payload.valid_until = new Date(payload.valid_until).toISOString()
        break
      default:
        throw new Error('Unknown form type')
    }

    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      let errorMessage = `Failed to create ${entityName}`

      // Handle structured error responses
      if (data.error?.message) {
        errorMessage = data.error.message
      } else if (data.message) {
        errorMessage = data.message
      } else if (Array.isArray(data.errors)) {
        errorMessage = data.errors
          .map((err) => `${err.field}: ${err.message}`)
          .join('\n')
      }

      throw new Error(errorMessage)
    }

    // Success case
    showError(
      `${entityName.charAt(0).toUpperCase() + entityName.slice(1)} created successfully!`,
      true
    )
    e.target.reset()

    // Refresh the relevant data
    switch (endpoint) {
      case 'airlines':
        loadAirlines()
        break
      case 'airports':
        loadAirports()
        break
      case 'discounts':
        loadDiscounts()
        break
    }
  } catch (error) {
    console.error(
      `Create ${formId.replace('create-', '').replace('-form', '')} Error:`,
      error
    )
    showError(
      error.message || 'An unexpected error occurred. Please try again.'
    )
  }
}
async function submitCreateFlightForm(event) {
  event.preventDefault()
  const form = event.target
  const formData = new FormData(form)

  const jsonObject = {
    flight_number: formData.get('flight_number'),
    airline_id: parseInt(formData.get('airline_id')),
    departure_airport: parseInt(formData.get('departure_airport')),
    arrival_airport: parseInt(formData.get('arrival_airport')),
    departure_time: formData.get('departure_time'),
    arrival_time: formData.get('arrival_time'),
    total_seats: parseInt(formData.get('total_seats')),
    pricing: {
      Economy: {
        base_price: parseFloat(formData.get('economy_base_price')),
        ceil_price: parseFloat(formData.get('economy_ceil_price')),
      },
      Business: {
        base_price: parseFloat(formData.get('business_base_price')),
        ceil_price: parseFloat(formData.get('business_ceil_price')),
      },
      First: {
        base_price: parseFloat(formData.get('first_base_price')),
        ceil_price: parseFloat(formData.get('first_ceil_price')),
      },
    },
  }

  try {
    const response = await fetch(`${API_BASE_URL}/flights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(jsonObject),
    })

    const responseData = await response.json()

    if (!response.ok) {
      let errorMessage = 'Failed to create flight'

      if (responseData.error?.errors) {
        errorMessage = responseData.error.errors
          .map((err) => `${err.field}: ${err.message}`)
          .join('\n')
      } else if (responseData.error?.message) {
        errorMessage = responseData.error.message
      }

      throw new Error(errorMessage)
    }

    showError('Flight created successfully!', true)
    form.reset()
    loadFlights()
  } catch (error) {
    console.error('Create Flight Error:', error)
    showError(error.message || 'Error while Creating Flight')
  }
}
async function handleBulkCreate(e) {
  e.preventDefault()
  const formId = e.target.id
  const fileInput = e.target.querySelector('input[type="file"]')
  if (!fileInput) return
  const file = fileInput.files[0]
  if (!file) {
    showError('Please select a file')
    return
  }
  const formData = new FormData()
  formData.append('file', file)

  try {
    let endpoint = ''
    switch (formId) {
      case 'bulk-airlines-form':
        endpoint = 'airlines/bulk'
        break
      case 'bulk-airports-form':
        endpoint = 'airports/bulk'
        break
      case 'bulk-flights-form':
        endpoint = 'flights/bulk'
        break
      case 'bulk-discounts-form':
        endpoint = 'discounts/bulk'
        break
    }

    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: formData,
    })

    const data = await response.json()
    if (response.ok) {
      showError(`${endpoint.split('/')[0]} created successfully!`, true)
      e.target.reset()
      switch (endpoint.split('/')[0]) {
        case 'airlines':
          loadAirlines()
          break
        case 'airports':
          loadAirports()
          break
        case 'flights':
          loadFlights()
          break
        case 'discounts':
          loadDiscounts()
          break
      }
    } else {
      showError(
        data.message ||
          data.error ||
          `Failed to create ${endpoint.split('/')[0]}`
      )
    }
  } catch (error) {
    showError('An error occurred. Please try again.')
  }
}

async function handleExport(e) {
  const sectionId = e.target.getAttribute('data-section')
  try {
    let endpoint = ''
    switch (sectionId) {
      case 'airlines':
        endpoint = 'airlines/export'
        break
      case 'airports':
        endpoint = 'airports/export'
        break
      case 'flights':
        endpoint = 'flights/export'
        break
      case 'discounts':
        endpoint = 'discounts/export'
        break
      case 'users':
        endpoint = 'users/export'
        break
      case 'tickets':
        endpoint = 'tickets/export'
        break
      case 'passengers':
        endpoint = 'passengers/export'
        break
      case 'refunds':
        endpoint = 'refunds/export'
        break
      case 'reviews':
        endpoint = 'reviews/export'
        break
    }

    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sectionId}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } else {
      const data = await response.json()
      showError(data.message || data.error || 'Failed to export data')
    }
  } catch (error) {
    showError('An error occurred during export. Please try again.')
  }
}

// Dashboard functionality

async function loadDashboard(period = 'day') {
  try {
    const response = await fetch(
      `${API_BASE_URL}/dashboard/enhanced?period=${period}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    )

    if (!response.ok) throw new Error('Failed to load dashboard')

    const data = await response.json()
    renderDashboard(data)
    updateTimeRangeDisplay(data.dateRange)
  } catch (error) {
    showError(error.message)
    console.error('Dashboard error:', error)
  }
}

function updateTimeRangeDisplay(dateRange) {
  if (!dateRange) return

  const start = new Date(dateRange.start)
  const end = new Date(dateRange.end)
  const timeRangeElement = document.getElementById('time-range')

  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }

  timeRangeElement.textContent = `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`
}

function renderDashboard(data) {
  if (!data) {
    showError('No dashboard data available')
    return
  }

  updateStatsCards(data)

  renderCharts(data)

  renderTables(data)
}

function updateStatsCards(data) {
  const stats = data.stats || {}

  // Core stats
  setStatValue('total-flights', stats.totalFlights)
  setStatValue('total-revenue', `₹${formatCurrency(stats.totalRevenue)}`)
  setStatValue('total-users', stats.totalUsers)
  setStatValue('total-airports', stats.totalAirports)
  setStatValue('total-airlines', stats.totalAirlines)
  setStatValue('total-tickets-sold', stats.totalTicketsSold)
  setStatValue('total-refunds', stats.totalRefunds)
  setStatValue('avg-rating', stats.avgRating?.toFixed(1) || '0.0')
  setStatValue('total-reviews', stats.totalReviews)
  setStatValue('countries-served', stats.countriesServed)
  setStatValue('flights-reviewed', stats.flightsReviewed)

  // Flight stats
  setStatValue('flights-departed', data.stats?.flights?.flights_departed || '0')
  setStatValue(
    'avg-flight-duration',
    data.stats?.flights?.avg_flight_duration_minutes?.toFixed(0) || '0'
  )

  // Passenger stats
  setStatValue(
    'registered-passengers',
    data.stats?.passengers?.registered_passengers || '0'
  )
  setStatValue(
    'avg-ticket-price',
    formatCurrency(data.stats?.passengers?.avg_ticket_price)
  )

  // Airport stats
  setStatValue('busiest-airport', data.stats?.airports?.busiest_airport || '-')
  setStatValue(
    'busiest-airport-flights',
    data.stats?.airports?.busiest_airport_flights || '0'
  )
  setStatValue(
    'popular-destination',
    data.stats?.airports?.most_popular_destination || '-'
  )

  if (data.stats?.passengers?.oldest_passenger_dob) {
    const oldest = calculateAge(
      new Date(data.stats.passengers.oldest_passenger_dob)
    )
    const youngest = calculateAge(
      new Date(data.stats.passengers.youngest_passenger_dob)
    )
    setStatValue('oldest-passenger', `${oldest} years`)
    setStatValue('youngest-passenger', `${youngest} years`)
  }

  // Occupancy stats
  if (data.statusDistribution && data.statusDistribution[0]) {
    const statusData = data.statusDistribution[0]
    let totalFlights = 0

    statusData.forEach((status) => {
      const count = parseInt(status.count) || 0
      totalFlights += count

      switch (status.status.toLowerCase()) {
        case 'scheduled':
          setStatValue('scheduled-count', count)
          break
        case 'departed':
          setStatValue('departed-count', count)
          break
        case 'arrived':
          setStatValue('arrived-count', count)
          break
        case 'canceled':
          setStatValue('canceled-count', count)
          break
      }
    })

    setStatValue('total-flights-status', totalFlights)
  }
}

function renderCharts(data) {
  // Clear previous charts if they exist
  document
    .querySelectorAll('.chart-container')
    .forEach((container) => container.remove())

  // Create chart containers
  const dashboardSection = document.getElementById('dashboard')
  dashboardSection.insertAdjacentHTML(
    'beforeend',
    `
    <style>
      .charts-row {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        margin-bottom: 20px;
      }
      .chart-container {
        flex: 1 1 calc(50% - 20px);
        min-width: 300px;
        background: #2a2a3a;
        border-radius: 10px;
        padding: 20px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: transform 0.3s ease;
      }
      .chart-container:hover {
        transform: translateY(-5px);
      }
      .chart-container h3 {
        color: #FF8C42;
        margin-bottom: 15px;
        font-size: 1.1rem;
        font-weight: 600;
        text-align: center;
      }
      .chart-container canvas {
        width: 100% !important;
        height: 300px !important;
      }
      @media (max-width: 768px) {
        .chart-container {
          flex: 1 1 100%;
        }
      }
    </style>
    <div class="charts-row">
      <div class="chart-container">
        <h3>Airlines Flight Distribution</h3>
        <canvas id="airlineChart"></canvas>
      </div>
      <div class="chart-container">
        <h3>Revenue Trends</h3>
        <canvas id="revenueChart"></canvas>
      </div>
    </div>
    <div class="charts-row">
      <div class="chart-container">
        <h3>Flight Status Distribution</h3>
        <canvas id="statusChart"></canvas>
      </div>
      <div class="chart-container">
        <h3>Booking Trends</h3>
        <canvas id="ticketStatusChart"></canvas>
      </div>
    </div>
    <div class="charts-row">
      <div class="chart-container">
        <h3>Top Users by Spending</h3>
        <canvas id="userActivityChart"></canvas>
      </div>
      <div class="chart-container">
        <h3>Popular Routes</h3>
        <canvas id="popularRoutesChart"></canvas>
      </div>
    </div>
    <div class="charts-row">
      <div class="chart-container">
        <h3>User Signups</h3>
        <canvas id="userSignupsChart"></canvas>
      </div>
      <div class="chart-container">
        <h3>Airport Activity</h3>
        <canvas id="airportStatsChart"></canvas>
      </div>
    </div>
    `
  )

  // Chart color palette
  const ORANGE_PALETTE = [
    '#FF8C42',
    '#FFB347',
    '#FFD166',
    '#FE5F55',
    '#F95738',
    '#EE6352',
    '#4CC9F0',
    '#4361EE',
    '#3A0CA3',
    '#7209B7',
    '#F72585',
    '#B5179E',
  ]

  // Common chart options
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#ddd',
          font: { weight: '500' },
          padding: 20,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(25, 25, 30, 0.95)',
        titleColor: '#ff8c42',
        bodyColor: '#eee',
        borderColor: 'rgba(255, 120, 0, 0.3)',
        borderWidth: 1,
        padding: 12,
        usePointStyle: true,
      },
    },
    animation: {
      duration: 1500,
      easing: 'easeOutQuart',
    },
  }

  new Chart(document.getElementById('ticketStatusChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: data.ticketStatusStats[0].map((t) => t.status.toUpperCase()),
      datasets: [
        {
          data: data.ticketStatusStats[0].map((t) => t.count),
          backgroundColor: [
            '#4CAF50', // Confirmed - green
            '#F44336', // Cancelled - red
            '#2196F3', // Refunded - blue
            '#FF9800', // Expired - orange
            '#9E9E9E', // Other - gray
          ],
          borderColor: 'rgba(30, 30, 35, 0.8)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      ...commonOptions,
      cutout: '70%',
      plugins: {
        ...commonOptions.plugins,
        tooltip: {
          ...commonOptions.plugins.tooltip,
          callbacks: {
            label: (context) => {
              const value = context.raw
              const total = context.dataset.data.reduce((a, b) => a + b, 0)
              const percentage = Math.round((value / total) * 100)
            },
          },
        },
      },
    },
  })
  // 1. Airline Flight Distribution (Doughnut Chart)
  if (data.airlineStats?.[0]) {
    new Chart(document.getElementById('airlineChart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: data.airlineStats[0].map((a) => a.name),
        datasets: [
          {
            data: data.airlineStats[0].map((a) => a.total_flights),
            backgroundColor: ORANGE_PALETTE,
            borderColor: 'rgba(30, 30, 35, 0.8)',
            borderWidth: 1,
            hoverOffset: 10,
          },
        ],
      },
      options: {
        ...commonOptions,
        cutout: '70%',
        plugins: {
          ...commonOptions.plugins,
          tooltip: {
            ...commonOptions.plugins.tooltip,
            callbacks: {
              label: (context) => ` ${context.label}: ${context.raw} flights`,
            },
          },
        },
        animation: {
          ...commonOptions.animation,
          animateScale: true,
          animateRotate: true,
        },
      },
    })
  }

  // 2. Revenue Trends (Line Chart)
  if (data.revenueTrends?.[0]) {
    new Chart(document.getElementById('revenueChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: data.revenueTrends[0].map((r) =>
          new Date(r.date).toLocaleDateString()
        ),
        datasets: [
          {
            label: 'Revenue (₹)',
            data: data.revenueTrends[0].map((r) => parseFloat(r.revenue)),
            backgroundColor: 'rgba(255, 140, 66, 0.15)',
            borderColor: '#FF8C42',
            borderWidth: 2,
            pointBackgroundColor: '#FF8C42',
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        ...commonOptions,
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: { color: '#aaa' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: {
              color: '#aaa',
              callback: (value) => '₹' + value,
            },
          },
        },
        plugins: {
          ...commonOptions.plugins,
          tooltip: {
            ...commonOptions.plugins.tooltip,
            callbacks: {
              label: (context) => ` ₹${context.parsed.y.toFixed(2)}`,
            },
          },
        },
      },
    })
  }

  // 3. Flight Status Distribution (Pie Chart)
  if (data.statusDistribution?.[0]) {
    new Chart(document.getElementById('statusChart').getContext('2d'), {
      type: 'pie',
      data: {
        labels: data.statusDistribution[0].map((s) => s.status),
        datasets: [
          {
            data: data.statusDistribution[0].map((s) => s.count),
            backgroundColor: ORANGE_PALETTE,
            borderColor: 'rgba(30, 30, 35, 0.8)',
            borderWidth: 1,
            hoverOffset: 10,
          },
        ],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          tooltip: {
            ...commonOptions.plugins.tooltip,
            callbacks: {
              label: (context) => ` ${context.label}: ${context.raw} flights`,
            },
          },
        },
        animation: {
          ...commonOptions.animation,
          animateScale: true,
          animateRotate: true,
        },
      },
    })
  }

  // 4. User Activity (Horizontal Bar Chart)
  if (data.userActivity?.[0]) {
    new Chart(document.getElementById('userActivityChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.userActivity[0].map((u) => u.username),
        datasets: [
          {
            label: 'Total Spent (₹)',
            data: data.userActivity[0].map((u) => u.total_spent),
            backgroundColor: ORANGE_PALETTE,
            borderColor: 'rgba(30, 30, 35, 0.8)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        ...commonOptions,
        indexAxis: 'y', // Makes it horizontal
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: {
              color: '#aaa',
              callback: (value) => '₹' + value,
            },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: { color: '#aaa' },
          },
        },
      },
    })
  }

  // 5. Popular Routes (Doughnut Chart)
  if (data.popularRoutes?.[0]) {
    new Chart(document.getElementById('popularRoutesChart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: data.popularRoutes[0].map(
          (r) => `${r.departure} → ${r.arrival}`
        ),
        datasets: [
          {
            data: data.popularRoutes[0].map((r) => r.bookings),
            backgroundColor: ORANGE_PALETTE,
            borderColor: 'rgba(30, 30, 35, 0.8)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          tooltip: {
            ...commonOptions.plugins.tooltip,
            callbacks: {
              label: (context) => `${context.label}: ${context.raw} bookings`,
            },
          },
        },
      },
    })
  }

  // 6. User Signups (Line Chart)
  if (data.userSignups?.[0]) {
    new Chart(document.getElementById('userSignupsChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: data.userSignups[0].map((u) =>
          new Date(u.signup_date).toLocaleDateString()
        ),
        datasets: [
          {
            label: 'Regular Users',
            data: data.userSignups[0].map((u) => u.user_count),
            borderColor: '#4CC9F0',
            backgroundColor: 'rgba(76, 201, 240, 0.1)',
            borderWidth: 2,
            tension: 0.3,
          },
          {
            label: 'Admin Users',
            data: data.userSignups[0].map((u) => u.admin_count),
            borderColor: '#F72585',
            backgroundColor: 'rgba(247, 37, 133, 0.1)',
            borderWidth: 2,
            tension: 0.3,
          },
        ],
      },
      options: {
        ...commonOptions,
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: { color: '#aaa' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: { color: '#aaa' },
          },
        },
      },
    })
  }

  // 7. Airport Stats (Bar Chart)
  if (data.airportStats?.[0]) {
    new Chart(document.getElementById('airportStatsChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.airportStats[0].map((a) => a.name),
        datasets: [
          {
            label: 'Departures',
            data: data.airportStats[0].map((a) => a.departures),
            backgroundColor: '#FF8C42',
            borderColor: 'rgba(30, 30, 35, 0.8)',
            borderWidth: 1,
          },
          {
            label: 'Arrivals',
            data: data.airportStats[0].map((a) => a.arrivals),
            backgroundColor: '#4361EE',
            borderColor: 'rgba(30, 30, 35, 0.8)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        ...commonOptions,
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: {
              color: '#aaa',
              maxRotation: 45,
              minRotation: 45,
            },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: { color: '#aaa' },
          },
        },
      },
    })
  }
}
function renderTables(data) {
  // Recent Bookings
  renderTable(
    'recentBookings',
    data.recentBookings?.[0],
    (booking) => `
    <tr class="status-${booking.status.toLowerCase()}">
      <td>${booking.ticket_id}</td>
      <td>${booking.flight_number}</td>
      <td>${booking.passenger_name}</td>
      <td>₹${formatCurrency(booking.price)}</td>
      <td><span class="status-badge">${booking.status}</span></td>
    </tr>
  `
  )

  renderTable(
    'popularRoutes',
    data.popularRoutes?.[0],
    (route) => `
    <tr>
      <td>${route.departure} → ${route.arrival}</td>
      <td>${route.bookings}</td>
      <td>₹${formatCurrency(route.total_revenue)}</td>
    </tr>
  `
  )

  renderTable(
    'userActivity',
    data.userActivity?.[0],
    (user) => `
    <tr>
      <td>${user.username}</td>
      <td>${user.email}</td>
      <td>${user.bookings}</td>
      <td>₹${formatCurrency(user.total_spent)}</td>
      <td>${new Date(user.last_booking_date).toLocaleString()}</td>
    </tr>
  `
  )

  // Airline Stats
  renderTable(
    'airlineStats',
    data.airlineStats?.[0],
    (airline) => `
    <tr>
      <td>${airline.name}</td>
      <td>${airline.total_flights}</td>
      <td>${airline.completed_flights}</td>
      <td>${airline.canceled_flights}</td>
      <td>${airline.avg_rating ? airline.avg_rating.toFixed(1) : '-'}</td>
    </tr>
  `
  )
}

// Helper functions
function setStatValue(elementId, value) {
  const element = document.getElementById(elementId)
  if (element) element.textContent = value
}

function formatCurrency(amount) {
  return parseFloat(amount || 0)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function renderTable(tableId, data, rowTemplate) {
  const tableBody = document.querySelector(`#${tableId} tbody`)
  if (tableBody && data) {
    tableBody.innerHTML = data.map(rowTemplate).join('')
  }
}

function calculateAge(dob) {
  const diff = Date.now() - dob.getTime()
  const ageDate = new Date(diff)
  return Math.abs(ageDate.getUTCFullYear() - 1970)
}

//Airlines

let airlineStatusChart = null
let airlineRevenueChart = null
let airlineRoutesChart = null
let airlineFleetChart = null

async function loadAirlinePerformance(airlineId, period = null) {
  if (!airlineId) return

  if (!period) {
    period = document.getElementById('airline-period-select').value
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/airlines/${airlineId}/performance?period=${period}`,
      {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }
    )

    if (!response.ok) throw new Error('Failed to load airline performance')

    const data = await response.json()
    renderAirlinePerformance(data)
  } catch (error) {
    showError(error.message)
  }
}

function renderAirlinePerformance(data) {
  if (!data || !data.success) {
    showError('Failed to load airline performance data')
    return
  }

  // Check if data.data exists (based on your API response structure)
  const performanceData = data.data ? data.data : data

  // Update stats cards
  document.getElementById('airline-total-flights-stat').textContent =
    performanceData.performance?.total_flights || '0'
  document.getElementById('airline-passengers-stat').textContent =
    performanceData.performance?.tickets_sold || '0'
  document.getElementById('airline-revenue-stat').textContent = performanceData
    .performance?.total_revenue
    ? `₹${formatCurrency(performanceData.performance.total_revenue)}`
    : '₹0'
  document.getElementById('airline-airports-stat').textContent =
    performanceData.performance?.airports_served || '0'
}

async function loadAirlines(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/airlines?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (!response.ok) throw new Error('Failed to load airlines')
    const data = await response.json()
    renderAirlines(data.data || [])

    // Populate airline selector
    const airlineSelect = document.getElementById('airline-select')
    if (airlineSelect) {
      airlineSelect.innerHTML = data.data
        .map(
          (airline) =>
            `<option value="${airline.airline_id}">${airline.name} (${airline.code})</option>`
        )
        .join('')

      // Load performance for first airline by default
      if (data.data.length > 0) {
        currentAirlineId = data.data[0].airline_id
        loadAirlinePerformance(currentAirlineId)
      }
    }
  } catch (error) {
    showError('failed to load airlines')
  }
}

function renderAirlines(airlines) {
  const table = document.getElementById('airlines-table')
  if (!table) return

  if (!airlines || airlines.length === 0) {
    table.innerHTML = `
      <tr class="no-airlines-row">
        <td colspan="7">
          <div class="no-airlines">
            <i class="icon-airplane"></i>
            <span>No airlines found</span>
          </div>
        </td>
      </tr>`
    return
  }

  table.innerHTML = airlines
    .map((airline) => {
      const status = airline.is_active ? 'active' : 'inactive'
      const lastUpdated = airline.updated_at
        ? new Date(airline.updated_at).toLocaleDateString()
        : 'N/A'

      return `
      <tr class="airline-row ${status}">
        <td class="name-cell">
          <div class="airline-logo">
            ${airline.name.charAt(0).toUpperCase()}
          </div>
          <div class="airline-info">
            <span class="airline-name">${airline.name || 'N/A'}</span>
            <span class="airline-code">${airline.code || ''}</span>
          </div>
        </td>
        <td class="contact-cell">
          <div class="contact-info">
            <i class="icon-phone"></i>
            <span>${airline.contact || 'N/A'}</span>
          </div>
          <div class="email-info">
            <i class="icon-email"></i>
            <span>${airline.email || 'N/A'}</span>
          </div>
        </td>
        <td class="status-cell">
          <div class="status-badge ${status}" 
               title="Last updated: ${lastUpdated}">
            ${airline.is_active ? 'Active' : 'Inactive'}
          </div>
        </td>
        <td class="action-cell">
          <button onclick="editAirline('${airline.airline_id}')" 
                  class="btn-edit">
            <i class="icon-edit"></i> Edit
          </button>
          <button onclick="deleteAirline('${airline.airline_id}')" 
                  class="btn-delete">
            <i class="icon-delete"></i> Delete
          </button>
        </td>
        <td class="toggle-cell">
          <button onclick="toggleAirlineStatus('${airline.airline_id}', ${!airline.is_active})" 
                  class="status-toggle ${status}">
            <i class="icon-${airline.is_active ? 'deactivate' : 'activate'}"></i>
            ${airline.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>`
    })
    .join('')

  // Add hover effects after rendering
  addAirlineTableHoverEffects()
}

function addAirlineTableHoverEffects() {
  const rows = document.querySelectorAll('#airlines-table tr.airline-row')
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      row.style.transform = 'translateX(3px)'
      row.style.boxShadow = '0 4px 12px rgba(255, 165, 0, 0.15)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.transform = ''
      row.style.boxShadow = ''
    })
  })
}

async function toggleAirlineStatus(id, newStatus) {
  try {
    const response = await fetch(`${API_BASE_URL}/airlines/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ is_active: newStatus }),
    })
    if (response.ok) {
      showError(
        `Airline ${newStatus ? 'activated' : 'deactivated'} successfully!`,
        true
      )
      loadAirlines()
    } else {
      const data = await response.json()
      throw new Error(
        'Failed to update airline status as it has active flights '
      )
    }
  } catch (error) {
    showError(error.message)
  }
}

async function editAirline(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/airlines/${id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.error?.message ||
          errorData.message ||
          'Failed to fetch airline details'
      )
    }

    const data = await response.json()
    if (!data.airline) {
      throw new Error('Airline data not found in response')
    }

    openEditModal(data.airline, 'airline')
  } catch (error) {
    console.error('Edit Airline Error:', error)
    showError(error.message)
  }
}

async function deleteAirline(id) {
  try {
    const confirmed = await showConfirmationDialog(
      'Delete Airline',
      'Are you sure you want to delete this airline? This action cannot be undone.',
      'Delete',
      'Cancel'
    )

    if (!confirmed) return

    const response = await fetch(`${API_BASE_URL}/airlines/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        data.error?.message || data.message || 'Failed to delete airline'
      )
    }

    showError('Airline deleted successfully!', true)
    loadAirlines()
  } catch (error) {
    console.error('Delete Airline Error:', error)

    let userMessage = error.message
    if (
      error.message.includes('active flights') ||
      error.message.includes('ER_ROW_IS_REFERENCED')
    ) {
      userMessage =
        'Cannot delete airline because it has associated flights. ' +
        'Please deactivate it instead.'
    }

    showError(userMessage)
  }
}

function showConfirmationDialog(title, message, confirmText, cancelText) {
  return new Promise((resolve) => {
    const confirmed = window.confirm(`${title}\n\n${message}`)
    resolve(confirmed)
  })
}
// Airport Performance

async function loadAirportPerformance(airportId, period = null) {
  if (!airportId) return

  if (!period) {
    period = document.getElementById('period-select').value
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/airports/${airportId}/performance?period=${period}`,
      {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }
    )

    if (!response.ok) throw new Error('Failed to load airport performance')

    const data = await response.json()
    renderAirportPerformance(data)
  } catch (error) {
    showError(error.message)
  }
}

function renderAirportPerformance(data) {
  if (!data || !data.success) {
    showError('Failed to load airport performance data')
    return
  }

  // Update stats cards
  document.getElementById('total-flights-stat').textContent =
    data.performance?.total_flights || '0'
  document.getElementById('passengers-stat').textContent =
    data.performance?.passengers_served || '0'
  document.getElementById('revenue-stat').textContent = data.performance
    ?.total_revenue
    ? `₹${formatCurrency(data.performance.total_revenue)}`
    : '₹0'
  document.getElementById('airlines-stat').textContent =
    data.performance?.airlines_served || '0'

  if (airportStatusChart) airportStatusChart.destroy()
  if (airportRevenueChart) airportRevenueChart.destroy()
  if (airportAirlinesChart) airportAirlinesChart.destroy()
  if (airportRoutesChart) airportRoutesChart.destroy()

  const ORANGE_PALETTE = [
    '#FF8C42',
    '#FFB347',
    '#FFD166',
    '#FE5F55',
    '#F95738',
    '#EE6352',
  ]
}

function renderAirports(airports) {
  const table = document.getElementById('airports-table')
  if (!table) return

  if (!airports || airports.length === 0) {
    table.innerHTML = `
      <tr class="no-airports-row">
        <td colspan="8">
          <div class="no-airports">
            <i class="icon-airport"></i>
            <span>No airports found</span>
          </div>
        </td>
      </tr>`
    return
  }

  table.innerHTML = airports
    .map((airport) => {
      const status = airport.is_active ? 'active' : 'inactive'
      const lastUpdated = airport.updated_at
        ? new Date(airport.updated_at).toLocaleDateString()
        : 'N/A'

      return `
      <tr class="airport-row ${status}">
        <td class="name-cell">
          <div class="airport-icon">
            <i class="icon-flight"></i>
          </div>
          <div class="airport-info">
            <span class="airport-name">${airport.name || 'N/A'}</span>
            <span class="airport-code">${airport.code || ''}</span>
          </div>
        </td>
        <td class="location-cell">
          <div class="city">${airport.city || 'N/A'}</div>
          <div class="country">${airport.country || 'N/A'}</div>
        </td>
        <td class="status-cell">
          <div class="status-badge ${status}" 
               title="Last updated: ${lastUpdated}">
            <span class="status-dot"></span>
            ${airport.is_active ? 'Active' : 'Inactive'}
          </div>
        </td>
        <td class="action-cell">
          <button onclick="deleteAirport('${airport.airport_id}')" 
                  class="btn-delete">
            <i class="icon-trash"></i> Delete
          </button>
        </td>
        <td class="toggle-cell">
          <button onclick="toggleAirportStatus('${airport.airport_id}', ${!airport.is_active})" 
                  class="status-toggle ${status}">
            <i class="icon-${airport.is_active ? 'deactivate' : 'activate'}"></i>
            ${airport.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      
      </tr>`
    })
    .join('')

  addAirportTableHoverEffects()
}

function addAirportTableHoverEffects() {
  const rows = document.querySelectorAll('#airports-table tr.airport-row')
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      row.style.transform = 'translateX(3px)'
      row.style.boxShadow = '0 4px 12px rgba(255, 165, 0, 0.15)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.transform = ''
      row.style.boxShadow = ''
    })
  })
}
let airportStatusChart = null
let airportRevenueChart = null
let airportAirlinesChart = null
let airportRoutesChart = null

async function loadAirports(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/airports?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (!response.ok) throw new Error('Failed to load airports')
    const data = await response.json()
    renderAirports(data.data || [])

    const airportSelect = document.getElementById('airport-select')
    if (airportSelect) {
      airportSelect.innerHTML = data.data
        .map(
          (airport) =>
            `<option value="${airport.airport_id}">${airport.name} (${airport.code})</option>`
        )
        .join('')

      if (data.data.length > 0) {
        currentAirportId = data.data[0].airport_id
        loadAirportPerformance(currentAirportId)
      }
    }
  } catch (error) {
    showError(error.message)
  }
}

function formatCurrency(amount) {
  return parseFloat(amount || 0)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

async function toggleAirportStatus(id, newStatus) {
  try {
    const response = await fetch(`${API_BASE_URL}/airports/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ is_active: newStatus }),
    })
    if (response.ok) {
      showError(
        `Airport ${newStatus ? 'activated' : 'deactivated'} successfully!`,
        true
      )
      loadAirports()
    } else {
      const data = await response.json()
      throw new Error(
        'Failed to update airport status as it has active flights'
      )
    }
  } catch (error) {
    showError(error.message)
  }
}

async function deleteAirport(id) {
  if (!confirm('Are you sure you want to delete this airport?')) return
  try {
    const response = await fetch(`${API_BASE_URL}/airports/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (response.ok) {
      showError('Airport deleted successfully!', true)
      loadAirports()
    } else {
      const data = await response.json()
      throw new Error(
        'Failed to delete airline as airline as association with active Flights'
      )
    }
  } catch (error) {
    showError(error.message)
  }
}

// Flights
async function loadFlights(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/flights?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (!response.ok) throw new Error('Failed to load flights')

    const data = await response.json()
    renderFlights(data.data || [])
  } catch (error) {
    showError(error.message)
  }
}
function renderFlights(flights) {
  const table = document.getElementById('flights-table')
  if (!table) return

  if (!flights || flights.length === 0) {
    table.innerHTML = `
      <tr class="no-flights-row">
        <td colspan="11">
          <div class="no-flights">
            <i class="icon-flight"></i>
            <span>No flights found</span>
          </div>
        </td>
      </tr>`
    return
  }

  table.innerHTML = flights
    .map((flight) => {
      // Calculate duration
      const duration = calculateFlightDuration(
        flight.departure_time,
        flight.arrival_time
      )

      // Status classes
      const status = (flight.status || '').toLowerCase()
      const statusClass = `status-${status}`
      const rowClass = `flight-row-${status}`

      // Format dates
      const departureTime = flight.departure_time
        ? new Date(flight.departure_time).toLocaleString()
        : 'N/A'
      const arrivalTime = flight.arrival_time
        ? new Date(flight.arrival_time).toLocaleString()
        : 'N/A'

      // Format seats
      const seatsInfo =
        flight.available_seats != null
          ? `${flight.available_seats}/${flight.total_seats}`
          : 'N/A'

      return `
      <tr class="${rowClass}">
        <td class="flight-number">${flight.flight_number || 'N/A'}</td>
        <td class="departure-airport">${flight.departure_airport || 'N/A'}</td>
        <td class="arrival-airport">${flight.arrival_airport || 'N/A'}</td>
        <td class="departure-time">${departureTime}</td>
        <td class="arrival-time">${arrivalTime}</td>
        <td class="status-cell">
          <span class="status-badge ${statusClass}">${flight.status || 'N/A'}</span>
        </td>
        <td class="seats-info">${seatsInfo}</td>
        <td class="action-cell">
          <button onclick="editFlight('${flight.flight_id}')" class="btn-edit">
            <i class="icon-edit"></i> Delay
          </button>
          <button onclick="deleteFlight('${flight.flight_id}')" class="btn-delete">
            <i class="icon-delete"></i> Delete
          </button>
        </td>
        <td class="action-cell">
          <button onclick="cancelFlight('${flight.flight_id}')" 
                  class="btn-warning"
                  ${flight.status === 'Canceled' ? 'disabled' : ''}>
            <i class="icon-cancel"></i> Cancel
          </button>
        </td>
        <td class="action-cell">
          ${
            flight.status === 'Canceled'
              ? `
            <button onclick="rescheduleFlight('${flight.flight_id}')" class="btn-success">
              <i class="icon-reschedule"></i> Reschedule
            </button>
          `
              : ''
          }
        </td>
        <td class="duration-cell">
          <div class="duration-display" title="Flight duration">
            <i class="icon-clock"></i>
            <span>${duration}</span>
          </div>
        </td>
      </tr>`
    })
    .join('')

  // Add hover effects after rendering
  addFlightTableHoverEffects()
}

function calculateFlightDuration(departureTime, arrivalTime) {
  if (!departureTime || !arrivalTime) return 'N/A'

  const dep = new Date(departureTime)
  const arr = new Date(arrivalTime)
  const diff = arr - dep

  if (diff <= 0) return 'N/A'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  return `${hours}h ${minutes}m`
}

function addFlightTableHoverEffects() {
  const rows = document.querySelectorAll(
    '#flights-table tr[class^="flight-row"]'
  )
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      row.style.transform = 'translateY(-2px)'
      row.style.boxShadow = '0 6px 16px rgba(255, 165, 0, 0.2)'
      row.style.zIndex = '1'
    })
    row.addEventListener('mouseleave', () => {
      row.style.transform = ''
      row.style.boxShadow = ''
      row.style.zIndex = ''
    })
  })
}

function calculateFlightDuration(departureTime, arrivalTime) {
  if (!departureTime || !arrivalTime) return 'N/A'

  const dep = new Date(departureTime)
  const arr = new Date(arrivalTime)
  const diff = arr - dep

  if (diff <= 0) return 'N/A'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  return `${hours}h ${minutes}m`
}

function addFlightTableHoverEffects() {
  const rows = document.querySelectorAll(
    '#flights-table tr[class^="flight-row"]'
  )
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      row.style.transform = 'translateX(3px)'
      row.style.boxShadow = '0 4px 12px rgba(255, 165, 0, 0.15)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.transform = ''
      row.style.boxShadow = ''
    })
  })
}
async function cancelFlight(flightId) {
  if (!confirm('Are you sure you want to cancel this flight?')) return

  try {
    const response = await fetch(`${API_BASE_URL}/flights/${flightId}/cancel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        'Failed to cancel flight that are departed or arrived flights'
      )
    }

    showError('Flight canceled successfully!', true)
    loadFlights()
  } catch (error) {
    showError(error.message)
  }
}

async function editFlight(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/flights/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.message || errorData.error || 'Failed to fetch flight'
      )
    }

    const data = await response.json()
    openEditModal(data.flight, 'flight')
  } catch (error) {
    showError('failed to edit flight')
  }
}

async function rescheduleFlight(id) {
  const newDepartureTime = prompt(
    'Enter new departure time (YYYY-MM-DD HH:MM:SS):'
  )
  const newArrivalTime = prompt('Enter new arrival time (YYYY-MM-DD HH:MM:SS):')

  if (!newDepartureTime || !newArrivalTime) {
    showError('Both departure and arrival times are required')
    return
  }

  try {
    const response = await fetch(`${API_BASE_URL}/flights/${id}/reschedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        departure_time: newDepartureTime,
        arrival_time: newArrivalTime,
      }),
    })

    if (response.ok) {
      showError('Flight rescheduled successfully!', true)
      loadFlights()
    } else {
      const data = await response.json()
      throw new Error('Failed to reschedule flight')
    }
  } catch (error) {
    showError(error.message)
  }
}

async function viewCanceledFlights() {
  try {
    const response = await fetch(`${API_BASE_URL}/flights/canceled`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (!response.ok) throw new Error('Failed to load canceled flights')

    const data = await response.json()
    const table = document.getElementById('flights-table')

    if (!data.data || data.data.length === 0) {
      table.innerHTML = `<tr><td colspan="9">No canceled flights found</td></tr>`
      return
    }

    table.innerHTML = data.data
      .map(
        (flight) => `
        <tr>
          <td>${flight.flight_number || 'N/A'}</td>
          <td>${flight.departure_airport || 'N/A'}</td>
          <td>${flight.arrival_airport || 'N/A'}</td>
          <td>${flight.departure_time ? new Date(flight.departure_time).toLocaleString() : 'N/A'}</td>
          <td>${flight.arrival_time ? new Date(flight.arrival_time).toLocaleString() : 'N/A'}</td>
          <td>${flight.status || 'N/A'}</td>
          <td>${flight.available_seats != null ? `${flight.available_seats}/${flight.total_seats}` : 'N/A'}</td>
          <td>
            <button onclick="openRescheduleForm('${flight.flight_id}')" class="btn btn-success">
              Reschedule
            </button>
          </td>
        </tr>`
      )
      .join('')
  } catch (error) {
    showError(error.message)
  }
}

async function openRescheduleForm(flightId) {
  try {
    const response = await fetch(`${API_BASE_URL}/flights/${flightId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (!response.ok) throw new Error('Failed to load flight details')

    const flight = await response.json()

    // Populate form with flight data
    const flightNumberField = document.getElementById(
      'reschedule-flight-number'
    )
    flightNumberField.value = flight.flight.flight_number || 'N/A'
    flightNumberField.setAttribute('data-flight-id', flight.flight.flight_id)

    document.getElementById('reschedule-airline').value =
      flight.flight.airline_name || 'N/A'
    document.getElementById('reschedule-status').value =
      flight.flight.status || 'N/A'
    document.getElementById('reschedule-total-seats').value =
      flight.flight.total_seats || 'N/A'

    await loadAirportsDropdown(
      'reschedule-departure-airport',
      flight.flight.departure_airport
    )
    await loadAirportsDropdown(
      'reschedule-arrival-airport',
      flight.flight.arrival_airport
    )

    const formattedDepartureTime = new Date(flight.flight.departure_time)
      .toISOString()
      .slice(0, 16)
    document.getElementById('reschedule-departure-time').value =
      formattedDepartureTime

    document.getElementById('reschedule-form-container').style.display = 'block'
  } catch (error) {
    showError(error.message)
  }
}

async function loadAirportsDropdown(selectId, selectedAirportId) {
  const response = await fetch(`${API_BASE_URL}/airports`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })

  if (!response.ok) throw new Error('Failed to load airports')

  const airports = await response.json()
  const select = document.getElementById(selectId)
  select.innerHTML = airports.data
    .map(
      (airport) => `
      <option value="${airport.airport_id}" 
        ${airport.airport_id === selectedAirportId ? 'selected' : ''}>
        ${airport.name} (${airport.code})
      </option>`
    )
    .join('')
}

function closeRescheduleForm() {
  document.getElementById('reschedule-form-container').style.display = 'none'
}

async function deleteFlight(id) {
  if (!confirm('Are you sure you want to delete this flight?')) return

  try {
    const response = await fetch(`${API_BASE_URL}/flights/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (response.ok) {
      showError('Flight deleted successfully!', true)
      loadFlights()
    } else {
      const data = await response.json()
      throw new Error(
        'Failed to delete flight as it is already departed or arrived'
      )
    }
  } catch (error) {
    showError(error.message)
  }
}

// Discounts
async function loadDiscounts(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/discounts?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (!response.ok) throw new Error('Failed to load discounts')
    const data = await response.json()
    renderDiscounts(data.data || [])
  } catch (error) {
    showError(error.message)
  }
}

function renderDiscounts(discounts) {
  const table = document.getElementById('discounts-table')
  if (!table) return

  if (!discounts || discounts.length === 0) {
    table.innerHTML = `
      <tr class="no-discounts-row">
        <td colspan="7">
          <div class="no-discounts">
            <i class="icon-discount"></i>
            <span>No discounts found</span>
          </div>
        </td>
      </tr>`
    return
  }

  table.innerHTML = discounts
    .map((discount) => {
      const status = discount.is_active ? 'active' : 'inactive'
      const isExpired =
        discount.valid_until && new Date(discount.valid_until) < new Date()
      const statusText = isExpired
        ? 'Expired'
        : discount.is_active
          ? 'Active'
          : 'Inactive'

      // Highlight percentage with different colors based on discount amount
      const discountPercent = discount.discount_percent || 0
      let percentClass = ''
      if (discountPercent >= 50) {
        percentClass = 'high-discount'
      } else if (discountPercent >= 20) {
        percentClass = 'medium-discount'
      } else {
        percentClass = 'low-discount'
      }

      return `
      <tr class="discount-row ${status} ${isExpired ? 'expired' : ''}">
        <td class="code-cell">
          <div class="discount-code">
            <i class="icon-tag"></i>
            <span>${discount.code || 'N/A'}</span>
          </div>
        </td>
        <td class="percent-cell ${percentClass}">
          <span class="discount-percent">${discountPercent}%</span>
          ${discountPercent >= 30 ? '<span class="discount-badge">HOT</span>' : ''}
        </td>
        <td class="date-cell">
          <div class="date-range">
            <div><i class="icon-calendar-start"></i> ${discount.valid_from ? new Date(discount.valid_from).toLocaleDateString() : 'N/A'}</div>
            <div><i class="icon-calendar-end"></i> ${discount.valid_until ? new Date(discount.valid_until).toLocaleDateString() : 'N/A'}</div>
          </div>
        </td>
        <td class="status-cell">
          <div class="status-badge ${status} ${isExpired ? 'expired' : ''}">
            ${statusText}
          </div>
        </td>
        <td class="action-cell">
          <button onclick="editDiscount('${discount.discount_id}')" class="btn-edit">
            <i class="icon-edit"></i> Edit
          </button>
          <button onclick="deleteDiscount('${discount.discount_id}')" class="btn-delete">
            <i class="icon-delete"></i> Delete
          </button>
        </td>
      </tr>`
    })
    .join('')

  // Add hover effects after rendering
  addDiscountTableHoverEffects()
}

function addDiscountTableHoverEffects() {
  const rows = document.querySelectorAll('#discounts-table tr.discount-row')
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      row.style.transform = 'translateX(3px)'
      row.style.boxShadow = '0 4px 12px rgba(255, 165, 0, 0.15)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.transform = ''
      row.style.boxShadow = ''
    })
  })
}
async function toggleDiscountStatus(id, newStatus) {
  try {
    const response = await fetch(`${API_BASE_URL}/discounts/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ is_active: newStatus }),
    })
    if (response.ok) {
      showError(
        `Discount ${newStatus ? 'activated' : 'deactivated'} successfully!`,
        true
      )
      loadDiscounts()
    } else {
      const data = await response.json()
      throw new Error(
        data.message || data.error || 'Failed to update discount status'
      )
    }
  } catch (error) {
    showError(error.message)
  }
}

async function editDiscount(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/discounts/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.message || errorData.error || 'Failed to fetch discount'
      )
    }

    const data = await response.json()
    openEditModal(data.discount, 'discount')
  } catch (error) {
    showError(error.message)
  }
}

async function deleteDiscount(id) {
  if (!confirm('Are you sure you want to delete this discount?')) return
  try {
    const response = await fetch(`${API_BASE_URL}/discounts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (response.ok) {
      showError('Discount deleted successfully!', true)
      loadDiscounts()
    } else {
      const data = await response.json()
      throw new Error(
        'Failed to delete discount as it has connection with active tickets u can incative it'
      )
    }
  } catch (error) {
    showError(error.message)
  }
}

async function loadUsers(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/users?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (!response.ok) throw new Error('Failed to load users')
    const data = await response.json()
    renderUsers(data.data || [])
  } catch (error) {
    showError(error.message)
  }
}

function renderUsers(users) {
  const table = document.getElementById('users-table')
  if (!table) return

  if (!users || users.length === 0) {
    table.innerHTML = `
      <tr class="no-users-row">
        <td colspan="5">
          <div class="no-users">
            <i class="icon-users"></i>
            <span>No users found</span>
          </div>
        </td>
      </tr>`
    return
  }

  table.innerHTML = users
    .map((user) => {
      const status = user.is_active ? 'active' : 'blocked'
      const lastActive = user.last_login
        ? new Date(user.last_login).toLocaleString()
        : 'Never logged in'

      return `
      <tr class="user-row ${status}">
        <td class="username-cell">
          <div class="user-avatar">
            ${user.username.charAt(0).toUpperCase()}
          </div>
          <span>${user.username || 'N/A'}</span>
        </td>
        <td class="email-cell">${user.email || 'N/A'}</td>
        <td class="role-cell">
          <span class="role-badge ${user.role?.toLowerCase() || 'user'}">
            ${user.role || 'User'}
          </span>
        </td>
        <td class="status-cell">
          <div class="status-indicator ${status}" 
               title="Last active: ${lastActive}">
            <span class="status-dot"></span>
            ${user.is_active ? 'Active' : 'Blocked'}
          </div>
        </td>
        <td class="action-cell">
          <button onclick="toggleUserStatus('${user.user_id}', ${!user.is_active})" 
                  class="status-toggle ${status}">
            <i class="icon-${user.is_active ? 'block' : 'check'}"></i>
            ${user.is_active ? 'Block User' : 'Unblock User'}
          </button>
        </td>
      </tr>`
    })
    .join('')

  // Add hover effects after rendering
  addUserTableHoverEffects()
}

function addUserTableHoverEffects() {
  const rows = document.querySelectorAll('#users-table tr.user-row')
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      row.style.transform = 'translateX(3px)'
      row.style.boxShadow = '0 4px 12px rgba(255, 165, 0, 0.15)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.transform = ''
      row.style.boxShadow = ''
    })
  })
}

async function toggleUserStatus(id, newStatus) {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ is_active: newStatus }),
    })
    if (response.ok) {
      showError(
        `User ${newStatus ? 'unblocked' : 'blocked'} successfully!`,
        true
      )
      loadUsers()
    } else {
      const data = await response.json()
      throw new Error(
        data.message || data.error || 'Failed to update user status'
      )
    }
  } catch (error) {
    showError(error.message)
  }
}

async function editUser(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.message || errorData.error || 'Failed to fetch user'
      )
    }

    const data = await response.json()
    openEditModal(data.user, 'user')
  } catch (error) {
    showError(error.message)
  }
}

async function deleteUser(id) {
  if (!confirm('Are you sure you want to delete this user?')) return
  try {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (response.ok) {
      showError('User deleted successfully!', true)
      loadUsers()
    } else {
      const data = await response.json()
      throw new Error(data.message || data.error || 'Failed to delete user')
    }
  } catch (error) {
    showError(error.message)
  }
}

async function loadTickets(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (!response.ok) throw new Error('Failed to load tickets')
    const data = await response.json()
    renderTickets(data.data || [])
  } catch (error) {
    showError(error.message)
  }
}

function renderTickets(tickets) {
  const table = document.getElementById('tickets-table')
  if (!table) return

  if (!tickets || tickets.length === 0) {
    table.innerHTML = '<tr><td colspan="6">No tickets found</td></tr>'
    return
  }

  table.innerHTML = tickets
    .map((ticket) => {
      const price = parseFloat(ticket.price) || 0
      const formattedPrice = price ? `₹${price.toFixed(2)}` : 'N/A'

      // Determine styling based on status (black/orange theme)
      let rowStyle = ''
      let statusStyle = ''
      const status = (ticket.status || '').toLowerCase()

      switch (status) {
        case 'confirmed':
          rowStyle = 'background-color: #333; color: #ffa500;' // dark bg with orange text
          statusStyle = 'color: #4CAF50; font-weight: bold;' // green status
          break
        case 'pending':
          rowStyle = 'background-color: #222; color: #ffa500;' // darker bg with orange text
          statusStyle = 'color: #FFC107; font-weight: bold;' // yellow status
          break
        case 'cancelled':
          rowStyle = 'background-color: #111; color: #ffa500;' // darkest bg with orange text
          statusStyle = 'color: #F44336; font-weight: bold;' // red status
          break
        case 'refund requested':
          rowStyle =
            'background-color: #222; color: #ffa500; border-left: 4px solid #FF9800;'
          statusStyle = 'color: #FF9800; font-weight: bold;' // orange status
          break
        case 'expired':
          rowStyle =
            'background-color: #111; color: #ccc; text-decoration: line-through;'
          statusStyle = 'color: #9E9E9E; font-style: italic;' // gray status
          break
        default:
          rowStyle = 'background-color: #333; color: #ffa500;'
      }

      return `
      <tr style="${rowStyle}">
        <td>${ticket.ticket_id || 'N/A'}</td>
        <td>${ticket.flight_number || 'N/A'}</td>
        <td>${ticket.passenger_name || 'N/A'}</td>
        <td>${ticket.route || 'N/A'}</td>
        <td>${formattedPrice}</td>
        <td style="${statusStyle}">${ticket.status || 'N/A'}</td>
      </tr>`
    })
    .join('')
}
async function processRefundRequest(ticketId) {
  const reason = prompt('Enter refund reason:')
  if (!reason) return
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ reason }),
    })
    if (response.ok) {
      showError('Refund request submitted successfully!', true)
      loadTickets()
    } else {
      const data = await response.json()
      throw new Error(data.error || 'Failed to process refund request')
    }
  } catch (error) {
    showError(error.message)
  }
}
async function submitRescheduleForm(event) {
  event.preventDefault()

  const flightId = document
    .getElementById('reschedule-flight-number')
    .getAttribute('data-flight-id')

  const departureAirport = document.getElementById(
    'reschedule-departure-airport'
  ).value
  const arrivalAirport = document.getElementById(
    'reschedule-arrival-airport'
  ).value
  const departureTime = document.getElementById(
    'reschedule-departure-time'
  ).value
  const arrivalTime = document.getElementById('reschedule-arrival-time').value

  try {
    const response = await fetch(
      `${API_BASE_URL}/flights/${flightId}/reschedule`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          departure_airport: parseInt(departureAirport),
          arrival_airport: parseInt(arrivalAirport),
          departure_time: departureTime,
          arrival_time: arrivalTime,
        }),
      }
    )

    if (response.ok) {
      showError('Flight rescheduled successfully!', true)
      closeRescheduleForm()
      loadFlights()
    } else {
      const data = await response.json()
      throw new Error(data.error || 'Failed to reschedule flight')
    }
  } catch (error) {
    showError(error.message)
  }
}

document
  .getElementById('reschedule-flight-form')
  .addEventListener('submit', submitRescheduleForm)

document
  .getElementById('reschedule-flight-form')
  .addEventListener('submit', submitRescheduleForm)

document
  .getElementById('reschedule-flight-form')
  .addEventListener('submit', submitRescheduleForm)

document
  .getElementById('reschedule-flight-form')
  .addEventListener('submit', submitRescheduleForm)
async function viewTicket(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.message || errorData.error || 'Failed to fetch ticket'
      )
    }

    const ticket = await response.json()
    openViewModal(ticket)
  } catch (error) {
    showError(error.message)
  }
}

async function loadPassengers(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/passengers?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (!response.ok) throw new Error('Failed to load passengers')
    const data = await response.json()
    renderPassengers(data.data || [])
  } catch (error) {
    showError(error.message)
  }
}

function renderPassengers(passengers) {
  const table = document.getElementById('passengers-table')
  if (!table) return

  if (!passengers || passengers.length === 0) {
    table.innerHTML = `
      <tr class="no-passengers-row">
        <td colspan="7">
          <div class="no-passengers">
            <i class="icon-people"></i>
            <span>No passengers found</span>
          </div>
        </td>
      </tr>`
    return
  }

  table.innerHTML = passengers
    .map((passenger) => {
      const userType = passenger.user_id ? 'registered' : 'guest'
      const fullName =
        `${passenger.first_name || ''} ${passenger.last_name || ''}`.trim() ||
        'N/A'
      const email = passenger.email || 'N/A'
      // const phone = passenger.phone ? formatPhoneNumber(passenger.phone) : 'N/A'
      const passport = passenger.passport_number || 'N/A'

      return `
      <tr class="passenger-row ${userType}">
        <td class="name-cell">
          <div class="passenger-avatar">
            ${getInitials(passenger.first_name, passenger.last_name)}
          </div>
          <div class="passenger-info">
            <span class="passenger-name">${fullName}</span>
            ${
              passenger.user_id
                ? `<span class="passenger-id">ID: ${passenger.user_id}</span>`
                : ''
            }
          </div>
        </td>
        <td class="contact-cell">
          <div class="contact-info">
            <i class="icon-email"></i>
            <a href="mailto:${email}" class="email-link">${email}</a>
          </div>
         
          </div>
        </td>
        <td class="passport-cell">
          <div class="passport-info">
            <i class="icon-passport"></i>
            <span>${passport}</span>
          </div>
        </td>
        <td class="type-cell">
          <div class="user-type ${userType}">
            ${userType === 'registered' ? 'Registered User' : 'Guest'}
          </div>
        </td>
   
      </tr>`
    })
    .join('')

  // Add hover effects after rendering
  addPassengerTableHoverEffects()
}

// Helper functions
function formatPhoneNumber(phone) {
  // Simple phone number formatting
  return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
}

function getInitials(firstName, lastName) {
  const first = firstName ? firstName.charAt(0).toUpperCase() : ''
  const last = lastName ? lastName.charAt(0).toUpperCase() : ''
  return first + last
}

function addPassengerTableHoverEffects() {
  const rows = document.querySelectorAll('#passengers-table tr.passenger-row')
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      row.style.transform = 'translateX(3px)'
      row.style.boxShadow = '0 4px 12px rgba(255, 165, 0, 0.15)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.transform = ''
      row.style.boxShadow = ''
    })
  })
}

async function viewPassenger(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/passengers/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.message || errorData.error || 'Failed to fetch passenger'
      )
    }

    const data = await response.json()
    openViewModal(data)
  } catch (error) {
    showError(error.message)
  }
}

async function loadRefunds(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/refunds?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (!response.ok) throw new Error('Failed to load refunds')
    const data = await response.json()
    renderRefunds(data.data || [])
  } catch (error) {
    showError(error.message)
  }
}

function renderRefunds(refunds) {
  const table = document.getElementById('refunds-table')
  if (!table) return

  if (!refunds || refunds.length === 0) {
    table.innerHTML = `
      <tr class="no-refunds-row">
        <td colspan="7">
          <div class="no-refunds">
            <i class="icon-wallet"></i>
            <span>No refunds found</span>
          </div>
        </td>
      </tr>`
    return
  }

  table.innerHTML = refunds
    .map((refund) => {
      const amount = parseFloat(refund.amount) || 0
      const penalty = parseFloat(refund.penalty) || 0
      const netAmount = amount - penalty
      const status = refund.status || 'N/A'
      const isPending = status.toLowerCase() === 'pending'

      // Format date with relative time (e.g., "2 days ago")
      const createdDate = new Date(refund.created_at)
      const dateString = createdDate.toLocaleString()
      const relativeTime = getRelativeTime(createdDate)

      return `
      <tr class="refund-row ${status.toLowerCase()}">
        <td class="refund-id">#${refund.refund_id || 'N/A'}</td>
        <td class="ticket-id">${refund.ticket_id || 'N/A'}</td>
        <td class="amount-cell">
          <div class="amount-display">
            <span class="currency">₹</span>
            <span class="net-amount">${netAmount.toFixed(2)}</span>
            ${penalty > 0 ? `<span class="penalty-badge">-${penalty.toFixed(2)}% penalty</span>` : ''}
          </div>
        </td>
        <td class="status-cell">
          <span class="status-badge ${status.toLowerCase()}">${status}</span>
        </td>
        <td class="reason-cell">
          <div class="reason-text" title="${refund.request_reason || 'No reason provided'}">
            ${refund.request_reason || 'No reason provided'}
          </div>
        </td>
        <td class="date-cell" title="${dateString}">
          <div class="date-display">
            <i class="icon-calendar"></i>
            ${relativeTime}
          </div>
        </td>
        <td class="action-cell">
          ${
            isPending
              ? `
            <div class="action-buttons">
              
              <button onclick="processRefund('${refund.refund_id}', 'reject')" class="btn-reject">
                <i class="icon-close"></i> Reject
              </button>
            </div>
          `
              : `
            <div class="completed-action">
              <i class="icon-${status.toLowerCase() === 'approved' ? 'check-circle' : 'cancel'}"></i>
              ${status === 'Approved' ? 'Processed' : 'Rejected'}
            </div>
          `
          }
        </td>
      </tr>`
    })
    .join('')

  // Add hover effects after rendering
  addTableHoverEffects()
}

// Helper function for relative time
function getRelativeTime(date) {
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (hours < 24) return `${hours} hr ago`
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// Add hover effects to table rows
function addTableHoverEffects() {
  const rows = document.querySelectorAll('#refunds-table tr.refund-row')
  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      row.style.transform = 'translateX(5px)'
      row.style.boxShadow = '0 4px 12px rgba(255, 165, 0, 0.2)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.transform = ''
      row.style.boxShadow = ''
    })
  })
}
async function processRefund(id, action) {
  if (!confirm(`Are you sure you want to ${action} this refund?`)) return
  const comment = prompt('Enter admin comment:')
  if (comment === null) return

  try {
    const response = await fetch(`${API_BASE_URL}/refunds/${id}/process`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        status: action === 'approve' ? 'Approved' : 'Rejected',
        admin_comment:
          comment ||
          `Refund ${action === 'approve' ? 'approved' : 'rejected'} by admin`,
      }),
    })

    if (response.ok) {
      showError(
        `Refund ${action === 'approve' ? 'approved' : 'rejected'} successfully!`,
        true
      )
      loadRefunds()
    } else {
      const data = await response.json()
      throw new Error(data.message || data.error || `Failed to process refund`)
    }
  } catch (error) {
    showError(error.message)
  }
}

async function loadReviews(query = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews?search=${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
    if (!response.ok) throw new Error('Failed to load reviews')
    const data = await response.json()
    renderReviews(data.data || [])
  } catch (error) {
    showError(error.message)
  }
}

function renderReviews(reviews) {
  const table = document.getElementById('reviews-table')
  if (!table) return

  if (!reviews || reviews.length === 0) {
    table.innerHTML = `
      <tr class="no-reviews">
        <td colspan="6">
          <div class="empty-state">
            <i class="icon-star-empty"></i>
            <p>No reviews yet</p>
          
          </div>
        </td>
      </tr>`
    return
  }

  table.innerHTML = reviews
    .map((review) => {
      const rating = parseInt(review.rating) || 0
      const stars = Array(5)
        .fill(0)
        .map((_, i) =>
          i < Math.floor(rating)
            ? '★'
            : i === Math.floor(rating) && rating % 1 >= 0.5
              ? '½'
              : '☆'
        )
        .join('')

      const date = review.created_at
        ? new Date(review.created_at).toLocaleDateString()
        : 'N/A'

      const timeAgo = review.created_at
        ? getTimeAgo(new Date(review.created_at))
        : ''

      return `
      <tr class="review ${rating >= 4 ? 'good' : rating >= 2 ? 'ok' : 'bad'}">
        <td class="user-info">
          <div class="avatar">${getInitials(review.user_name)}</div>
          <div>
            <div class="name">${review.user_name || 'Anonymous'}</div>
            <div class="date" title="${date}">${timeAgo}</div>
          </div>
        </td>
        <td class="flight">${review.flight_number || 'N/A'}</td>
        <td class="rating">
          <div class="stars" title="${rating} stars">${stars}</div>
          <div class="numeric">${rating.toFixed(1)}</div>
        </td>
        <td class="comment">
          <p>${review.comment || 'No comment'}</p>
          ${review.comment?.length > 100 ? '<button class="toggle-comment">Show more</button>' : ''}
        </td>
        <td class="actions">
          <button class="btn-delete" onclick="deleteReview('${review.review_id}')">
            <i class="icon-trash">Delete</i>
          </button>
        </td>
      </tr>`
    })
    .join('')

  // Add toggle functionality
  document.querySelectorAll('.toggle-comment').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const comment = e.target.closest('.comment')
      comment.classList.toggle('expanded')
      e.target.textContent = comment.classList.contains('expanded')
        ? 'Show less'
        : 'Show more'
    })
  })
}

// Helper functions
function getInitials(name) {
  return name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : '??'
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
async function deleteReview(id) {
  if (!confirm('Are you sure you want to delete this review?')) return
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })

    if (response.ok) {
      showError('Review deleted successfully!', true)
      loadReviews()
    } else {
      const data = await response.json()
      throw new Error(
        data.error?.message || data.message || 'Failed to delete review'
      )
    }
  } catch (error) {
    showError(error.message)
  }
}

async function openEditModal(data, type) {
  const modal = document.getElementById('edit-modal')
  const form = document.getElementById('edit-form')
  const modalTitle = document.getElementById('edit-modal-title')
  const errorDisplay = document.getElementById('edit-error-display')

  try {
    // Reset modal state
    form.innerHTML = ''
    errorDisplay.textContent = ''
    errorDisplay.style.display = 'none'
    modalTitle.textContent = `Edit ${type.charAt(0).toUpperCase() + type.slice(1)}`

    const IMMUTABLE_FIELDS = {
      airline: ['airline_id', 'created_at', 'updated_at'],
      flight: [
        'flight_id',
        'flight_number',
        'airline_name',
        'status',
        'departure_airport',
        'arrival_airport',
        'total_seats',
        'available_seats',
        'aircraft_type',
        'previous_departure',
        'minimum_duration_hours',
        'created_at',
        'updated_at',
      ],
      discount: ['discount_id', 'created_at'],
      user: ['user_id', 'created_at', 'last_login'],
    }

    // Validate input data
    const idField = `${type}_id`
    if (!data || !data[idField]) {
      throw new Error(`Invalid ${type} data received`)
    }

    let endpoint = ''
    let fields = []

    switch (type) {
      case 'airline':
        endpoint = `airlines/${data.airline_id}`
        fields = [
          createDisplayField('airline_id', 'ID', data.airline_id),
          createDisplayField('name', 'Name', data.name),
          createDisplayField('code', 'Code', data.code),
          createDisplayField(
            'created_at',
            'Created',
            formatDate(data.created_at)
          ),
          createDisplayField(
            'updated_at',
            'Updated',
            formatDate(data.updated_at)
          ),
          createInputField(
            'contact',
            'Contact',
            'text',
            data.contact,
            true,
            '^[+0-9\\s-]{10,}$'
          ),
          createInputField('email', 'Email', 'email', data.email, true),
          createCheckboxField('is_active', 'Active', data.is_active, true),
        ]
        break

      case 'discount':
        endpoint = `discounts/${data.discount_id}`
        fields = [
          createDisplayField('discount_id', 'ID', data.discount_id),
          createDisplayField('code', 'Code', data.code),
          createDisplayField(
            'created_at',
            'Created',
            formatDate(data.created_at)
          ),
          createInputField(
            'discount_percent',
            'Discount %',
            'number',
            data.discount_percent,
            true,
            null,
            1,
            100
          ),
          createDateTimeField(
            'valid_from',
            'Valid From',
            data.valid_from,
            true
          ),
          createDateTimeField(
            'valid_until',
            'Valid Until',
            data.valid_until,
            true
          ),
          createCheckboxField('is_active', 'Active', data.is_active, true),
        ]
        break

      case 'user':
        endpoint = `users/${data.user_id}`
        fields = [
          createDisplayField('user_id', 'ID', data.user_id),
          createDisplayField('username', 'Username', data.username),
          createDisplayField('email', 'Email', data.email),
          createDisplayField(
            'created_at',
            'Created',
            formatDate(data.created_at)
          ),
          createDisplayField(
            'last_login',
            'Last Login',
            formatDate(data.last_login)
          ),
          createSelectField('role', 'Role', data.role, ['admin', 'user'], true),
          createCheckboxField('is_active', 'Active', data.is_active, true),
        ]
        break

      case 'flight':
        endpoint = `flights/${data.flight_id}`
        fields = [
          createDisplayField('flight_id', 'ID', data.flight_id),
          createDisplayField(
            'flight_number',
            'Flight',
            `${data.flight_number} - ${data.airline?.name || 'Unknown Airline'} (${data.airline?.code || 'N/A'})`
          ),
          createDisplayField(
            'aircraft_type',
            'Aircraft Type',
            data.aircraft_type || 'N/A'
          ),
          createDisplayField(
            'created_at',
            'Created',
            formatDate(data.created_at)
          ),
          createDisplayField(
            'updated_at',
            'Updated',
            formatDate(data.updated_at)
          ),
          createDateTimeField(
            'departure_time',
            'Departure Time',
            data.departure_time,
            true
          ),
          createDateTimeField(
            'arrival_time',
            'Arrival Time',
            data.arrival_time,
            true
          ),
          createDisplayField(
            'total_seats',
            'Total Seats',
            data.total_seats || 'N/A'
          ),
          createDisplayField(
            'available_seats',
            'Available Seats',
            data.available_seats || 'N/A'
          ),
          createDisplayField('status', 'Status', 'Delayed'),
        ]
        break
      default:
        throw new Error(`Unsupported entity type: ${type}`)
    }

    // Build form elements
    fields.forEach((field) => {
      const group = document.createElement('div')
      group.className = `form-group ${field.mutable ? 'mutable' : 'immutable'}`
      group.innerHTML = `
        <label for="edit-${field.name}">${field.label}</label>
        ${field.html}
        ${field.errorHtml || ''}
      `
      form.appendChild(group)
    })

    // Add submit button if editable fields exist
    if (fields.some((f) => f.mutable)) {
      const submitBtn = document.createElement('button')
      submitBtn.type = 'submit'
      submitBtn.className = 'btn btn-primary'
      submitBtn.textContent = 'Save Changes'
      form.appendChild(submitBtn)
    }

    // Form submission handler
    form.onsubmit = async (e) => {
      e.preventDefault()
      const payload = {}
      let isValid = true

      // Collect only mutable fields
      fields.forEach((field) => {
        if (!field.mutable || IMMUTABLE_FIELDS[type].includes(field.name))
          return

        const input = form.querySelector(`#edit-${field.name}`)
        if (!input) return

        const value = field.type === 'checkbox' ? input.checked : input.value
        payload[field.name] = value

        // Clear previous errors
        clearFieldError(field.name)

        // Validation
        if (field.required && !value) {
          showFieldError(field.name, 'This field is required')
          isValid = false
        }

        if (field.pattern && !new RegExp(field.pattern).test(value)) {
          showFieldError(field.name, field.errorMessage || 'Invalid format')
          isValid = false
        }

        if (field.type === 'number') {
          const numValue = parseFloat(value)
          if (field.min !== undefined && numValue < field.min) {
            showFieldError(field.name, `Minimum value: ${field.min}`)
            isValid = false
          }
          if (field.max !== undefined && numValue > field.max) {
            showFieldError(field.name, `Maximum value: ${field.max}`)
            isValid = false
          }
        }
      })

      // Special validation for discount dates
      if (type === 'discount' && payload.valid_from && payload.valid_until) {
        const validFrom = new Date(payload.valid_from)
        const validUntil = new Date(payload.valid_until)
        if (validFrom >= validUntil) {
          showFieldError('valid_until', 'Must be after Valid From')
          isValid = false
        }
      }

      if (!isValid) return

      try {
        const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.message ||
              errorData.error ||
              `HTTP ${response.status}: Update failed`
          )
        }

        modal.style.display = 'none'
        showError(`${type} updated successfully!`, true)
        refreshData(type)
      } catch (error) {
        errorDisplay.textContent = error.message
        errorDisplay.style.display = 'block'
      }
    }

    modal.style.display = 'flex'
  } catch (error) {
    errorDisplay.textContent = error.message
    errorDisplay.style.display = 'block'
  }

  // Helper functions
  function formatDate(dateString) {
    return dateString ? new Date(dateString).toLocaleString() : 'N/A'
  }

  function createDisplayField(name, label, value) {
    return {
      name,
      label,
      html: `<div class="read-only-field" id="edit-${name}">${value || 'N/A'}</div>`,
      mutable: false,
    }
  }

  function createInputField(
    name,
    label,
    type,
    value,
    mutable,
    pattern,
    min,
    max
  ) {
    return {
      name,
      label,
      type,
      value,
      mutable,
      pattern,
      min,
      max,
      required: !!pattern || type === 'email',
      html: `<input type="${type}" 
                    id="edit-${name}" 
                    value="${value || ''}" 
                    ${mutable ? '' : 'readonly class="read-only"'}
                    ${pattern ? `pattern="${pattern}"` : ''}
                    ${min ? `min="${min}"` : ''}
                    ${max ? `max="${max}"` : ''}
                    ${mutable && (pattern || type === 'email') ? 'required' : ''}>`,
      errorHtml: `<div class="error-message" id="error-${name}"></div>`,
      errorMessage: pattern ? 'Invalid format' : null,
    }
  }

  function createCheckboxField(name, label, checked, mutable) {
    return {
      name,
      label,
      type: 'checkbox',
      checked: !!checked,
      mutable,
      html: `<input type="checkbox" 
                    id="edit-${name}" 
                    ${checked ? 'checked' : ''} 
                    ${mutable ? '' : 'disabled'}>`,
    }
  }

  function createSelectField(name, label, value, options, mutable) {
    return {
      name,
      label,
      type: 'select',
      value,
      options,
      mutable,
      html: `<select id="edit-${name}" ${mutable ? '' : 'disabled'}>
              ${options
                .map(
                  (opt) =>
                    `<option value="${opt}" ${opt === value ? 'selected' : ''}>
                  ${opt.charAt(0).toUpperCase() + opt.slice(1)}
                </option>`
                )
                .join('')}
            </select>`,
    }
  }

  function createDateTimeField(name, label, value, mutable) {
    return {
      name,
      label,
      type: 'datetime-local',
      value: value ? value.slice(0, 16) : '',
      mutable,
      html: `<input type="datetime-local" 
                    id="edit-${name}" 
                    value="${value ? value.slice(0, 16) : ''}"
                    ${mutable ? '' : 'readonly'}>`,
    }
  }

  function showFieldError(fieldName, message) {
    const errorElement = document.getElementById(`error-${fieldName}`)
    if (errorElement) {
      errorElement.textContent = message
      errorElement.style.display = 'block'
    }
  }

  function clearFieldError(fieldName) {
    const errorElement = document.getElementById(`error-${fieldName}`)
    if (errorElement) {
      errorElement.textContent = ''
      errorElement.style.display = 'none'
    }
  }

  function refreshData(type) {
    const loaders = {
      airline: loadAirlines,
      airport: loadAirports,
      flight: loadFlights,
      discount: loadDiscounts,
      user: loadUsers,
    }
    if (loaders[type]) loaders[type]()
  }

  // Close handlers
  document.getElementById('close-edit-modal').onclick = () => {
    modal.style.display = 'none'
  }

  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none'
    }
  }
}

function toggleNav() {
  if (adminNav) adminNav.classList.toggle('active')
}

// Expose functions to global scope for HTML event handlers
window.editAirline = editAirline
window.deleteAirline = deleteAirline
window.toggleAirlineStatus = toggleAirlineStatus

window.deleteAirport = deleteAirport
window.toggleAirportStatus = toggleAirportStatus

window.deleteFlight = deleteFlight
window.editFlight = editFlight
window.rescheduleFlight = rescheduleFlight
window.viewCanceledFlights = viewCanceledFlights

window.deleteDiscount = deleteDiscount
window.toggleDiscountStatus = toggleDiscountStatus
window.editDiscount = editDiscount
window.editUser = editUser
window.toggleUserStatus = toggleUserStatus
window.deleteUser = deleteUser

window.viewTicket = viewTicket
window.processRefundRequest = processRefundRequest
window.viewPassenger = viewPassenger
window.processRefund = processRefund

window.deleteReview = deleteReview
window.submitCreateFlightForm = submitCreateFlightForm
