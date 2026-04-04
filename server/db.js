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
        "stripePriceId" TEXT,
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

    // Card Invoices (Faturas)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS card_invoices (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        "cardId" INTEGER NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
        "referenceMonth" INTEGER NOT NULL,
        "referenceYear" INTEGER NOT NULL,
        "totalAmount" REAL DEFAULT 0,
        "dueDate" DATE,
        "closingDate" DATE,
        status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE', 'PARTIAL')),
        "paidAmount" REAL DEFAULT 0,
        "paidAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("cardId", "referenceMonth", "referenceYear")
      );
    `)

    // Invoice Items (Itens da Fatura)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        "invoiceId" INTEGER NOT NULL REFERENCES card_invoices(id) ON DELETE CASCADE,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        "transactionDate" DATE,
        "categoryId" INTEGER REFERENCES finance_categories(id),
        "aiCategory" TEXT,
        "aiConfidence" REAL DEFAULT 0,
        "isConfirmed" BOOLEAN DEFAULT FALSE,
        installment TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Invoice Uploads (Controle de Uploads de Faturas)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_uploads (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        "cardId" INTEGER NOT NULL REFERENCES credit_cards(id),
        "invoiceId" INTEGER REFERENCES card_invoices(id),
        "fileType" TEXT NOT NULL CHECK ("fileType" IN ('PDF', 'IMAGE')),
        "fileSize" INTEGER,
        "originalName" TEXT,
        status TEXT DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'REVIEW')),
        "aiRawResponse" TEXT,
        "errorMessage" TEXT,
        "processedAt" TIMESTAMP,
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
        "business_unit_id" INTEGER,
        "invoice_item_id" INTEGER REFERENCES invoice_items(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Audit Logs (structured security/audit trail)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        level TEXT DEFAULT 'INFO' CHECK(level IN ('INFO', 'WARN', 'ERROR', 'CRITICAL')),
        event_type TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_role TEXT,
        ip_address TEXT,
        user_agent TEXT,
        device_fingerprint TEXT,
        resource_type TEXT,
        resource_id TEXT,
        old_value TEXT,
        new_value TEXT,
        metadata TEXT
      );
    `)

    // User Sessions (concurrent session tracking)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ip_address TEXT,
        user_agent TEXT,
        device_fingerprint TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        invalidated_at TIMESTAMP
      );
    `)

    // Business Units (Wallets/Accounts)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS business_units (
        id SERIAL PRIMARY KEY,
        "ownerId" INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        "account_type" TEXT NOT NULL CHECK ("account_type" IN ('PF', 'PJ')),
        cnpj TEXT, 
        "logo_url" TEXT,
        "isPrimary" BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Ensure status and dueDate columns exist (migration for existing tables)
    try {
      await pool.query('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'PAID\'')
      await pool.query('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP')
      await pool.query('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS "cardId" INTEGER REFERENCES credit_cards(id)')
      await pool.query('ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS "imageUrl" TEXT')
      await pool.query('ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS business_unit_id INTEGER')
      await pool.query('ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS "creditLimit" REAL DEFAULT 0')
      await pool.query('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS "billing_date" DATE')
      await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_name TEXT')
      await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_cpf TEXT')
      await pool.query('ALTER TABLE plans ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT')

      // Fix for business_units schema change (userId -> ownerId, photo_url -> logo_url)
      // We check if "userId" exists and rename it
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='business_units' AND column_name='userId') THEN
             ALTER TABLE business_units RENAME COLUMN "userId" TO "ownerId";
          END IF;
          IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='business_units' AND column_name='photo_url') THEN
             ALTER TABLE business_units RENAME COLUMN "photo_url" TO "logo_url";
          END IF;
        END $$;
      `)

      // Add columns for users table hardening/logic
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER DEFAULT 1')
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "isBlocked" INTEGER DEFAULT 0')
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP')
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "planExpiresAt" TIMESTAMP')
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT DEFAULT \'active\'')
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordToken" TEXT')
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordExpires" TIMESTAMP')

      // Add columns for Stripe Subscriptions
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT')
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT')
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT')

    } catch (migErr) {
      console.log('Migration note (finance):', migErr.message)
    }

    // Fix Date Offset Bug (Phase 23) - Migrate TIMESTAMP to DATE
    try {
      console.log('🔄 Migrating TIMESTAMP columns to DATE...')
      await pool.query('ALTER TABLE finance_transactions ALTER COLUMN date TYPE DATE')
      await pool.query('ALTER TABLE finance_transactions ALTER COLUMN "dueDate" TYPE DATE')

      console.log('✅ Date columns migrated successfully')
    } catch (dateMigErr) {
      console.log('Date migration note:', dateMigErr.message)
    }

    // Security: Enable Row Level Security (RLS) on all tables to prevent public Supabase API access
    try {
      console.log('🔒 Applying Row Level Security (RLS) lockdown...')
      const tablesToLock = [
        'users', 'plans', 'simulations', 'calculation_rules', 'mei_limits',
        'admin_logs', 'audit_logs', 'user_sessions', 'payments', 'system_settings', 'user_alerts',
        'business_units', 'invoice_uploads', 'credit_cards',
        'finance_categories', 'card_invoices', 'invoice_items',
        'finance_transactions', 'bills_to_pay'
      ]

      for (const table of tablesToLock) {
        // Create table first if it doesn't exist to prevent errors, though they should exist by now
        await pool.query(`ALTER TABLE IF EXISTS ${table} ENABLE ROW LEVEL SECURITY;`)
      }
      console.log('✅ RLS Security lockdown applied to all tables')
    } catch (rlsErr) {
      console.log('RLS lock failed (this is normal if not using Supabase or connected as non-superuser):', rlsErr.message)
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
        JSON.stringify({ historico: false, pdf: false, comparativo: true, alertas: true }),
        JSON.stringify({ historico: true,  pdf: true,  comparativo: true, alertas: true }),
        JSON.stringify({ historico: true,  pdf: true,  comparativo: true, alertas: true })
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
      const crypto = require('crypto')
      const adminPass = process.env.ADMIN_DEFAULT_PASSWORD || crypto.randomBytes(12).toString('base64url')
      const hashedPassword = await bcrypt.hash(adminPass, 12)
      await pool.query(`
                INSERT INTO users(name, email, password, role)
VALUES('Administrador', 'admin@simulamei.com', $1, 'ADMIN')
  `, [hashedPassword])
      console.log('✅ Admin user seeded')
      if (!process.env.ADMIN_DEFAULT_PASSWORD) {
        console.log('⚠️ SENHA ADMIN GERADA AUTOMATICAMENTE:', adminPass)
        console.log('⚠️ ANOTE ESTA SENHA! Ela não será exibida novamente.')
      }
    }

    // Transaction limits per plan (0 = ilimitado)
    const transactionLimits = [
      { key: 'transaction_limit_1', value: '0' },  // Gratuito: ilimitado por padrão
      { key: 'transaction_limit_2', value: '0' },  // Prata: ilimitado
      { key: 'transaction_limit_3', value: '0' },  // Ouro: ilimitado
    ]
    for (const tl of transactionLimits) {
      const exists = await pool.query('SELECT 1 FROM system_settings WHERE key = $1', [tl.key])
      if (exists.rows.length === 0) {
        await pool.query('INSERT INTO system_settings (key, value) VALUES ($1, $2)', [tl.key, tl.value])
      }
    }

    // Wallet limits per plan (0 = ilimitado)
    const walletLimits = [
      { key: 'wallet_limit_1', value: '2' },   // Gratuito: 2 carteiras (1 PF + 1 PJ)
      { key: 'wallet_limit_2', value: '4' },   // Prata: 4 carteiras (2 PF + 2 PJ)
      { key: 'wallet_limit_3', value: '8' },   // Ouro: 8 carteiras (5 PF + 3 PJ)
    ]
    for (const wl of walletLimits) {
      const exists = await pool.query('SELECT 1 FROM system_settings WHERE key = $1', [wl.key])
      if (exists.rows.length === 0) {
        await pool.query('INSERT INTO system_settings (key, value) VALUES ($1, $2)', [wl.key, wl.value])
      }
    }

    // PF/PJ type limits per plan (0 = ilimitado por tipo)
    const walletTypeLimits = [
      { key: 'wallet_pf_limit_1', value: '1' }, // Gratuito: 1 PF
      { key: 'wallet_pj_limit_1', value: '1' }, // Gratuito: 1 PJ
      { key: 'wallet_pf_limit_2', value: '2' }, // Prata: 2 PF
      { key: 'wallet_pj_limit_2', value: '2' }, // Prata: 2 PJ
      { key: 'wallet_pf_limit_3', value: '5' }, // Ouro: 5 PF
      { key: 'wallet_pj_limit_3', value: '3' }, // Ouro: 3 PJ
    ]
    for (const tl of walletTypeLimits) {
      const exists = await pool.query('SELECT 1 FROM system_settings WHERE key = $1', [tl.key])
      if (exists.rows.length === 0) {
        await pool.query('INSERT INTO system_settings (key, value) VALUES ($1, $2)', [tl.key, tl.value])
      }
    }

    // ─── Migration v5: categorias disponível no plano Gratuito ──────────────────
    const migV5 = await pool.query("SELECT * FROM system_settings WHERE key = 'plan_migration_v5'")
    if (migV5.rows.length === 0) {
      // Lê features atuais do Gratuito e habilita apenas categorias, preservando o resto
      const gratuitoRow = await pool.query(`SELECT features FROM plans WHERE name = 'Gratuito'`)
      if (gratuitoRow.rows.length > 0) {
        let f = {}
        try { f = JSON.parse(gratuitoRow.rows[0].features || '{}') } catch (_) {}
        f.categorias = true
        await pool.query(`UPDATE plans SET features = $1 WHERE name = 'Gratuito'`, [JSON.stringify(f)])
      }
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('plan_migration_v5', 'done')`)
      console.log('✅ Migration v5: categorias habilitadas no plano Gratuito')
    }

    // ─── Migration v4: atualiza wallet limits existentes para novos padrões ─────
    const migV4 = await pool.query("SELECT * FROM system_settings WHERE key = 'plan_migration_v4'")
    if (migV4.rows.length === 0) {
      await pool.query("UPDATE system_settings SET value = '2' WHERE key = 'wallet_limit_1'")
      await pool.query("UPDATE system_settings SET value = '4' WHERE key = 'wallet_limit_2'")
      await pool.query("UPDATE system_settings SET value = '8' WHERE key = 'wallet_limit_3'")
      await pool.query("INSERT INTO system_settings (key, value) VALUES ('plan_migration_v4', 'done') ON CONFLICT (key) DO NOTHING")
      console.log('[DB] Migration v4: wallet limits atualizados (2/4/8 com PF/PJ por tipo)')
    }

    // ─── Migration v3: features completas — admin controla tudo pelo painel ─────
    const migV3 = await pool.query("SELECT * FROM system_settings WHERE key = 'plan_migration_v3'")
    if (migV3.rows.length === 0) {
      const gratuitoV3 = JSON.stringify({
        historico: false, pdf: false, comparativo: true, alertas: true,
        categorias: false, contas_pagar: false, transferencias: false,
        multi_carteiras: false, cartoes: false, upload_faturas: false
      })
      const prataV3 = JSON.stringify({
        historico: true, pdf: true, comparativo: true, alertas: true,
        categorias: true, contas_pagar: true, transferencias: true,
        multi_carteiras: true, cartoes: true, upload_faturas: false
      })
      const ouroV3 = JSON.stringify({
        historico: true, pdf: true, comparativo: true, alertas: true,
        categorias: true, contas_pagar: true, transferencias: true,
        multi_carteiras: true, cartoes: true, upload_faturas: true
      })
      await pool.query(`UPDATE plans SET features = $1 WHERE name = 'Gratuito'`, [gratuitoV3])
      await pool.query(`UPDATE plans SET features = $1 WHERE name = 'Prata'`,    [prataV3])
      await pool.query(`UPDATE plans SET features = $1 WHERE name = 'Ouro'`,     [ouroV3])
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('plan_migration_v3', 'done')`)
      console.log('✅ Migration v3: features completas aplicadas a todos os planos')
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── Migration v2: comparativo e alertas passam a ser Grátis ───────────────
    // Roda apenas uma vez. Não sobrescreve alterações futuras feitas pelo admin.
    const migV2 = await pool.query("SELECT * FROM system_settings WHERE key = 'plan_migration_v2'")
    if (migV2.rows.length === 0) {
      const gratuitoFeatures = JSON.stringify({ historico: false, pdf: false, comparativo: true, alertas: true })
      const prataFeatures    = JSON.stringify({ historico: true,  pdf: true,  comparativo: true, alertas: true })
      const ouroFeatures     = JSON.stringify({ historico: true,  pdf: true,  comparativo: true, alertas: true })
      await pool.query(`UPDATE plans SET features = $1 WHERE name = 'Gratuito'`, [gratuitoFeatures])
      await pool.query(`UPDATE plans SET features = $1 WHERE name = 'Prata'`,    [prataFeatures])
      await pool.query(`UPDATE plans SET features = $1 WHERE name = 'Ouro'`,     [ouroFeatures])
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('plan_migration_v2', 'done')`)
      console.log('✅ Migration v2: comparativo e alertas liberados para Gratuito')
    }
    // ─────────────────────────────────────────────────────────────────────────

  } catch (e) {
    console.error('Seeding error:', e)
  }
}

module.exports = {
  db,
  init,
  pool
}
