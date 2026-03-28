const { Pool } = require('pg')
require('dotenv').config()

const runMigration = async () => {
    const isProduction = process.env.NODE_ENV === 'production'
    const connectionString = process.env.DATABASE_URL
    console.log('Connecting to:', connectionString ? connectionString.replace(/:[^:@]+@/, ':***@') : 'undefined')

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    })

    try {
        console.log('Running ALTER TABLE...')
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordToken" TEXT')
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordExpires" TIMESTAMP')
        console.log('Migration completed successfully!')
    } catch (err) {
        console.error('Migration failed:', err)
    } finally {
        await pool.end()
    }
}

runMigration()
