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
    console.log('🔄 Tentando conectar ao banco...')

    // Simple verification query instead of full migration
    const res = await pool.query('SELECT NOW()')
    console.log('✅ Banco conectado! Time:', res.rows[0].now)

    /* 
    // AUTO-MIGRATION DISABLED FOR PRODUCTION STABILITY
    // The following logic previously auto-created tables and migrated data.
    // Since the database is already migrated, we disable this to prevent 
    // startup loops or race conditions on "Service Waking Up".

    // Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
         ...
      );
    `)
    ... (rest of the schema creation and migration logic commented out) ...
    */

  } catch (err) {
    console.error('❌ Erro crítico ao conectar no banco:', err)
    // Do not throw here to allow server to stay alive for debugging
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
