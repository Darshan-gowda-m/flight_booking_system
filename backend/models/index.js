const User = require('./User')
const Flight = require('./Flight')
const Passenger = require('./Passenger')
const Payment = require('./Payment')
const Airline = require('./Airline')
const Airport = require('./Airport')
const Discount = require('./Discount')
const Refund = require('./Refund')
const Ticket = require('./Ticket')
const Seat = require('./Seat')
const Review = require('./Review')
const Pricing = require('./Pricing')

console.log('Checking if all models are configured...')

if (User) console.log('User model loaded successfully.')
else console.error('User model failed to load.')

if (Flight) console.log('Flight model loaded successfully.')
else console.error('Flight model failed to load.')

if (Passenger) console.log('Passenger model loaded successfully.')
else console.error('Passenger model failed to load.')

if (Payment) console.log('Payment model loaded successfully.')
else console.error('Payment model failed to load.')

if (Airline) console.log('Airline model loaded successfully.')
else console.error('Airline model failed to load.')

if (Airport) console.log('Airport model loaded successfully.')
else console.error('Airport model failed to load.')

if (Discount) console.log('Discount model loaded successfully.')
else console.error('Discount model failed to load.')

if (Refund) console.log('Refund model loaded successfully.')
else console.error('Refund model failed to load.')

if (Ticket) console.log('Ticket model loaded successfully.')
else console.error('Ticket model failed to load.')

if (Seat) console.log('Seat model loaded successfully.')
else console.error('Seat model failed to load.')

if (Review) console.log('Review model loaded successfully.')
else console.error('Review model failed to load.')
if (Pricing) console.log('Pricing model loaded successfully.')
else console.error('Pricing model failed to load.')

console.log('All models checked.')

module.exports = {
  User,
  Flight,
  Airline,
  Passenger,
  Payment,
  Airport,
  Discount,
  Refund,
  Ticket,
  Seat,
  Review,
  Pricing,
}
