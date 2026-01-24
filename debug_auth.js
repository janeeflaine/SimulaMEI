const { Pool } = require('pg')
require('dotenv').config()

const connectionString = process.env.DATABASE_URL
const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
})

const test = async () => {
    try {
        console.log('Testing DB connection and auth tables...')
        const users = await pool.query('SELECT COUNT(*) FROM users')
        console.log('Users count:', users.rows[0].count)

        const plans = await pool.query('SELECT * FROM plans')
        console.log('Plans:', plans.rows)

        const settings = await pool.query('SELECT * FROM system_settings')
        console.log('Settings:', settings.rows)

        console.log('✅ DB seems OK')
    } catch (err) {
        console.error('❌ DB Test Failed:', err.message)
    } finally {
        await pool.end()
    }
}

test()
