const redis = require('redis')
const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } = process.env

const client = redis.createClient({
  host: REDIS_HOST || 'localhost',
  port: REDIS_PORT || 6379,
  password: REDIS_PASSWORD || '',
})

client.on('connect', () => {
  console.log('Connected to Redis')
})

client.on('error', (err) => {
  console.error('Redis error:', err)
})

module.exports = client
