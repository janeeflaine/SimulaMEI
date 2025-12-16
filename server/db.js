const { Pool } = require('pg')
require('dotenv').config()

const isProduction = process.env.NODE_ENV === 'production'

// Use DATABASE_URL from environment or fallback for dev (if user sets it)
// For now, if no detailed config, it tries to connect via standard env vars
const connectionString = process.env.DATABASE_URL

const pool = new Pool({
  connectionString: connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false
})

const db = {
  query: (text, params) => pool.query(text, params)
}

const init = async () => {
  try {
    console.log('🔄 Connecting to PostgreSQL...')

    // Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'USER' CHECK(role IN ('USER', 'ADMIN')),
        "planId" INTEGER,
        "isBlocked" INTEGER DEFAULT 0,
        "planExpiresAt" TIMESTAMP,
        "subscriptionStatus" TEXT DEFAULT 'active',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP
      );
    `)

    // Plans Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL DEFAULT 0,
        features TEXT DEFAULT '{}',
        "isActive" INTEGER DEFAULT 1,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Simulations Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS simulations (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER REFERENCES users(id),
        "activityType" TEXT NOT NULL,
        revenue REAL NOT NULL,
        "revenueType" TEXT DEFAULT 'mensal',
        "hasEmployee" INTEGER DEFAULT 0,
        "dasMonthly" REAL NOT NULL,
        "dasAnnual" REAL NOT NULL,
        "limitPercentage" REAL NOT NULL,
        "rulesSnapshot" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Calculation Rules
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calculation_rules (
        id SERIAL PRIMARY KEY,
        "inssPercentage" REAL DEFAULT 5,
        "icmsValue" REAL DEFAULT 1,
        "issValue" REAL DEFAULT 5,
        "employeeCost" REAL DEFAULT 1412,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedBy" INTEGER REFERENCES users(id)
      );
    `)

    // MEI Limits
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mei_limits (
        id SERIAL PRIMARY KEY,
        "annualLimit" REAL DEFAULT 81000,
        "warningPercentage" REAL DEFAULT 70,
        "dangerPercentage" REAL DEFAULT 90,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedBy" INTEGER REFERENCES users(id)
      );
    `)

    // Admin Logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        details TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Payments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        "externalId" TEXT,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        "planId" INTEGER NOT NULL REFERENCES plans(id),
        "qrCode" TEXT,
        "qrCodeBase64" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // System Settings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        "isEncrypted" INTEGER DEFAULT 0,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    console.log('✅ Database Schema Synced')

    // Seed Defaults
    await seedDefaults()

  } catch (err) {
    console.error('❌ Database Initialization Error:', err)
  }
}

const seedDefaults = async () => {
  try {
    // Plans
    const plansCount = await pool.query('SELECT COUNT(*) FROM plans')
    if (parseInt(plansCount.rows[0].count) === 0) {
      await pool.query(`
                INSERT INTO plans (name, price, features, "isActive") VALUES
                ('Gratuito', 0, $1, 1),
                ('Prata', 19.90, $2, 1),
                ('Ouro', 39.90, $3, 1)
            `, [
        JSON.stringify({ historico: false, pdf: false, comparativo: false, alertas: false }),
        JSON.stringify({ historico: true, pdf: true, comparativo: false, alertas: false }),
        JSON.stringify({ historico: true, pdf: true, comparativo: true, alertas: true })
      ])
      console.log('✅ Default plans seeded')
    }

    // Rules
    const rulesCount = await pool.query('SELECT COUNT(*) FROM calculation_rules')
    if (parseInt(rulesCount.rows[0].count) === 0) {
      await pool.query(`INSERT INTO calculation_rules ("inssPercentage", "icmsValue", "issValue", "employeeCost") VALUES (5, 1, 5, 1412)`)
    }

    // Limits
    const limitsCount = await pool.query('SELECT COUNT(*) FROM mei_limits')
    if (parseInt(limitsCount.rows[0].count) === 0) {
      await pool.query(`INSERT INTO mei_limits ("annualLimit", "warningPercentage", "dangerPercentage") VALUES (81000, 70, 90)`)
    }

    // Admin
    const adminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'")
    if (parseInt(adminCount.rows[0].count) === 0) {
      const bcrypt = require('bcryptjs')
      const hashedPassword = await bcrypt.hash('admin123', 10)
      await pool.query(`
                INSERT INTO users (name, email, password, role)
                VALUES ('Administrador', 'admin@simulamei.com', $1, 'ADMIN')
            `, [hashedPassword])
      console.log('✅ Admin user seeded')
    }

  } catch (e) {
    console.error('Seeding error:', e)
  }
}

module.exports = {
  db,
  init,
  pool
}
