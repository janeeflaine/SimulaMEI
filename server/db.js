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

const ensureMultiTenantData = async () => {
  try {
    console.log('🔧 Verificando integridade Multi-Tenant...')

    // 1. Ensure Column
    await pool.query('ALTER TABLE business_units ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE business_units ADD COLUMN IF NOT EXISTS "cnpj" TEXT');

    // 2. Create Units for Users without any
    await pool.query(`
          INSERT INTO business_units ("ownerId", name, "isPrimary")
          SELECT DISTINCT t."userId", 'Principal', true
          FROM finance_transactions t
          LEFT JOIN business_units b ON t."userId" = b."ownerId"
          WHERE b.id IS NULL AND t."userId" IS NOT NULL
      `);

    // 3. Create Permissions
    await pool.query(`
          INSERT INTO user_permissions ("userId", "businessUnitId", role)
          SELECT b."ownerId", b.id, 'OWNER'
          FROM business_units b
          LEFT JOIN user_permissions p ON b.id = p."businessUnitId" AND b."ownerId" = p."userId"
          WHERE p.id IS NULL
      `);

    // 4. Link Transactions
    await pool.query(`
          UPDATE finance_transactions t
          SET "businessUnitId" = (
              SELECT id FROM business_units WHERE "ownerId" = t."userId" ORDER BY "isPrimary" DESC, id ASC LIMIT 1
          )
          WHERE t."businessUnitId" IS NULL AND t."userId" IS NOT NULL
      `);

    // 5. Link Bills
    await pool.query(`
          UPDATE bills_to_pay b
          SET "businessUnitId" = (
              SELECT id FROM business_units WHERE "ownerId" = b."userId" ORDER BY "isPrimary" DESC, id ASC LIMIT 1
          )
          WHERE b."businessUnitId" IS NULL AND b."userId" IS NOT NULL
      `);

    // 6. Ensure Primary
    await pool.query(`
          UPDATE business_units
          SET "isPrimary" = true
          WHERE id IN (
              SELECT MIN(id) FROM business_units GROUP BY "ownerId"
          ) AND "ownerId" NOT IN (
              SELECT "ownerId" FROM business_units WHERE "isPrimary" = true
          )
      `);

    console.log('✅ Auto-migração Multi-Tenant concluída.')

  } catch (err) {
    console.error('⚠️ Erro na auto-migração (não crítico):', err.message)
  }
}

const init = async () => {
  try {
    console.log('🔄 Tentando conectar ao banco...')
    const res = await pool.query('SELECT NOW()')
    console.log('✅ Banco conectado! Time:', res.rows[0].now)

    // Run Auto-Migration
    await ensureMultiTenantData()
    await seedDefaults()

  } catch (err) {
    console.error('❌ Erro crítico ao conectar no banco:', err)
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
