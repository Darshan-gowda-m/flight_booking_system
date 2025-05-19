const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const bcrypt = require('bcryptjs')
const mysql = require('mysql2/promise')
const session = require('express-session')
const adminRoutes = require('./routes/adminRoutes')
const authRoutes = require('./routes/authRoutes')
const userRoutes = require('./routes/userRoutes')

require('dotenv').config()

const app = express()

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
)

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }))
app.use(express.json())
app.use(morgan('dev'))

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

// Routes

app.use('/api/admin', adminRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.stack)
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : null,
  })
})

module.exports = app
