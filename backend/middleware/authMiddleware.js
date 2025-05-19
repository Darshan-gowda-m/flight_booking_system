const jwt = require('jsonwebtoken')
const User = require('../models/User')

const tokenBlacklist = new Set()

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const token = authHeader.split(' ')[1]

    if (tokenBlacklist.has(token)) {
      return res
        .status(401)
        .json({ message: 'Session expired. Please log in again.' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findById(decoded.userId)
    if (!user) {
      return res.status(401).json({ message: 'Account not found or inactive' })
    }

    req.user = user
    req.token = token
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired' })
    }
    res.status(401).json({ message: 'Invalid authentication' })
  }
}

const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin privileges required',
      requiredRole: 'admin',
      currentRole: req.user?.role || 'none',
    })
  }
  next()
}

module.exports = { authMiddleware, adminMiddleware, tokenBlacklist }
