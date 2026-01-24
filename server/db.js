const { Pool, types } = require('pg')
// Force pg to return DATE columns as strings (YYYY-MM-DD) instead of JS Date objects
types.setTypeParser(1082, (stringValue) => stringValue)
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
        payer_name TEXT NOT NULL,
        payer_cpf TEXT NOT NULL,
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

    // User Alerts Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_alerts (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        config TEXT DEFAULT '{}',
        "lastTriggered" TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Finance Categories
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_categories (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('RECEITA', 'DESPESA_MEI', 'DESPESA_PESSOAL')),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Credit Cards
    await pool.query(`
      CREATE TABLE IF NOT EXISTS credit_cards (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        "lastFour" TEXT,
        brand TEXT,
        "closingDay" INTEGER,
        "dueDate" INTEGER,
        "imageUrl" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Bills to Pay (Contas a Pagar)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bills_to_pay (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        "dueDate" TIMESTAMP NOT NULL,
        "categoryId" INTEGER REFERENCES finance_categories(id),
        "cardId" INTEGER REFERENCES credit_cards(id),
        status TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGO')),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Finance Transactions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_transactions (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK (type IN ('RECEITA', 'DESPESA')),
        target TEXT NOT NULL CHECK (target IN ('PERSONAL', 'BUSINESS')),
        amount REAL NOT NULL,
        date TIMESTAMP NOT NULL,
        "categoryId" INTEGER REFERENCES finance_categories(id),
        "paymentMethod" TEXT,
        "cardId" INTEGER REFERENCES credit_cards(id),
        description TEXT,
        "isRecurring" BOOLEAN DEFAULT FALSE,
        "isSubscription" BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'PAID',
        "dueDate" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Ensure status and dueDate columns exist (migration for existing tables)
    try {
      await pool.query('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'PAID\'')
      await pool.query('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP')
      await pool.query('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS "cardId" INTEGER REFERENCES credit_cards(id)')
      await pool.query('ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS "imageUrl" TEXT')
      await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_name TEXT')
      await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_cpf TEXT')
    } catch (migErr) {
      console.log('Migration note (finance):', migErr.message)
    }

    // Fix Date Offset Bug (Phase 23) - Migrate TIMESTAMP to DATE
    try {
      console.log('🔄 Migrating TIMESTAMP columns to DATE...')
      await pool.query('ALTER TABLE finance_transactions ALTER COLUMN date TYPE DATE')
      await pool.query('ALTER TABLE finance_transactions ALTER COLUMN "dueDate" TYPE DATE')
      await pool.query('ALTER TABLE bills_to_pay ALTER COLUMN "dueDate" TYPE DATE')
      console.log('✅ Date columns migrated successfully')
    } catch (dateMigErr) {
      console.log('Date migration note:', dateMigErr.message)
    }

    console.log('✅ Database Schema Synced')

    // Seed Defaults - Ensure plans and basic rules exist
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
                INSERT INTO plans(name, price, features, "isActive") VALUES
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
      await pool.query(`INSERT INTO calculation_rules("inssPercentage", "icmsValue", "issValue", "employeeCost") VALUES(5, 1, 5, 1412)`)
    }

    // Limits
    const limitsCount = await pool.query('SELECT COUNT(*) FROM mei_limits')
    if (parseInt(limitsCount.rows[0].count) === 0) {
      await pool.query(`INSERT INTO mei_limits("annualLimit", "warningPercentage", "dangerPercentage") VALUES(81000, 70, 90)`)
    }

    // Default System Settings for Trial
    const trialEnabled = await pool.query("SELECT * FROM system_settings WHERE key = 'trial_enabled'")
    if (trialEnabled.rows.length === 0) {
      await pool.query("INSERT INTO system_settings (key, value) VALUES ('trial_enabled', 'false')")
    }
    const trialDays = await pool.query("SELECT * FROM system_settings WHERE key = 'trial_days'")
    if (trialDays.rows.length === 0) {
      await pool.query("INSERT INTO system_settings (key, value) VALUES ('trial_days', '7')")
    }

    // Admin
    const adminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'")
    if (parseInt(adminCount.rows[0].count) === 0) {
      const bcrypt = require('bcryptjs')
      const hashedPassword = await bcrypt.hash('admin123', 10)
      await pool.query(`
                INSERT INTO users(name, email, password, role)
VALUES('Administrador', 'admin@simulamei.com', $1, 'ADMIN')
  `, [hashedPassword])
      console.log('✅ Admin user seeded')
    }

    // Default Alerts for Ouro users (optional seeding for existing users if any, 
    // but better handled on plan upgrade or login)
    // For now, we'll ensure the table is ready.

  } catch (e) {
    console.error('Seeding error:', e)
  }
}

module.exports = {
  db,
  init,
  pool
}
