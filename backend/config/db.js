const mysql = require('mysql2/promise')
require('dotenv').config()

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  supportBigNumbers: true,
  bigNumberStrings: true,
  typeCast: function (field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      return field.string() === '1'
    }
    if (field.type.includes('INT') || field.type.includes('DECIMAL')) {
      const value = field.string()
      return value === null ? null : Number(value)
    }
    return next()
  },
})

pool
  .getConnection()
  .then((conn) => {
    console.log('Database connected successfully')

    conn
      .query('SELECT @@session.sql_mode AS sql_mode')
      .then(([rows]) => {
        console.log('SQL Mode:', rows[0].sql_mode)
        conn.release()
      })
      .catch((err) => {
        console.error('Error checking SQL mode:', err)
        conn.release()
      })
  })
  .catch((err) => {
    console.error('Database connection failed:', err)
    process.exit(1)
  })

module.exports = pool
