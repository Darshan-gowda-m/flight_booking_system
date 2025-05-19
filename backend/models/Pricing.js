const db = require('../config/db')

class Pricing {
  static validate(data) {
    const errors = []
    const requiredFields = ['flight_id', 'class', 'base_price', 'ceil_price']

    requiredFields.forEach((field) => {
      if (!data[field]) errors.push(`${field.replace('_', ' ')} is required`)
    })

    const validClasses = ['Economy', 'Business', 'First']
    if (data.class && !validClasses.includes(data.class)) {
      errors.push(`Invalid class: ${data.class}`)
    }

    if (data.base_price && data.base_price <= 0) {
      errors.push('Base price must be positive')
    }

    if (data.ceil_price && data.ceil_price <= 0) {
      errors.push('Ceiling price must be positive')
    }

    if (data.base_price > data.ceil_price) {
      errors.push('Base price cannot exceed ceiling price')
    }

    if (errors.length > 0) {
      throw new Error(`Pricing validation failed: ${errors.join(', ')}`)
    }
  }

  static async findByFlightId(flightId) {
    try {
      const [rows] = await db.query(
        'SELECT * FROM pricing WHERE flight_id = ?',
        [flightId]
      )
      return rows
    } catch (error) {
      throw new Error(`Error fetching pricing: ${error.message}`)
    }
  }
}

module.exports = Pricing
