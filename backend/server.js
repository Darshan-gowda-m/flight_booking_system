const express = require('express')
const path = require('path')
const app = require('./app')

const port = process.env.PORT || 3000

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')))

// Handle client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'))
})
app.get('/api/*', (req, res, next) => {
  res.set('Content-Type', 'application/json')
  next()
})
// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`)
  console.log(
    '🔒 Session secret:',
    process.env.SESSION_SECRET?.substring(0, 4) + '...'
  )
  console.log('💾 Database:', process.env.DB_NAME)
})
