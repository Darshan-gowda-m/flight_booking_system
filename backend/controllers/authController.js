const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { body, validationResult } = require('express-validator')
const User = require('../models/User')
const logger = require('../config/logger')
const redis = require('../config/redis') // Ensure Redis client is properly initialized

/**
 * Register a new user.
 */
const register = [
  // Input validation
  body('username')
    .notEmpty()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Username must be ≤50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be ≥8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    )
    .withMessage(
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),

  // Handler
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { username, email, password, role = 'user' } = req.body

    try {
      const existingUser = await User.findByEmail(email)
      if (existingUser) {
        return res.status(409).json({ message: 'Email already exists' })
      }

      // Create the user
      const userId = await User.create({ username, email, password, role })

      logger.info(`User registered successfully: ${userId}`)
      res.status(201).json({ message: 'User registered successfully', userId })
    } catch (error) {
      logger.error(`Registration failed: ${error.message}`)
      res
        .status(500)
        .json({ message: 'Registration failed', error: error.message })
    }
  },
]

/**
 * Login a user.
 */
const login = [
  // Input validation
  body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
  body('password').notEmpty().withMessage('Password is required'),

  // Handler
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { email, password } = req.body

    try {
      // Verify credentials
      const user = await User.verifyCredentials(email, password)
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' })
      }

      // Check if the user is active
      if (!user.is_active) {
        return res
          .status(403)
          .json({ message: 'Account is blocked. Please contact the admin.' })
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.user_id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      )

      logger.info(`User logged in successfully: ${user.user_id}`)
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      })
    } catch (error) {
      logger.error(`Login failed: ${error.message}`)
      res.status(500).json({ message: 'Login failed', error: error.message })
    }
  },
]
/**
 * Get the authenticated user's profile.
 */
const getProfile = async (req, res) => {
  const userId = req.user.user_id // Assuming the user ID is extracted from the JWT token

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    logger.info(`Profile fetched successfully: ${userId}`)
    res.json({
      id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    })
  } catch (error) {
    logger.error(`Profile fetch failed: ${error.message}`)
    res
      .status(500)
      .json({ message: 'Profile fetch failed', error: error.message })
  }
}

module.exports = { register, login, getProfile }
