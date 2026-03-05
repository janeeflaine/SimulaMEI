/**
 * Migration Script: Recalculate billing_date for all existing transactions.
 * 
 * Usage: node server/scripts/migrateHistoricBillingDates.js
 * 
 * This script:
 * 1. Sets billing_date = date for all non-credit-card transactions
 * 2. For credit card transactions with a valid cardId, calculates the correct billing_date
 *    using the card's closingDay and dueDate
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { Pool, types } = require('pg')
const { calculateBillingDate } = require('../utils/billingDate')

types.setTypeParser(1082, (stringValue) => stringValue)

const isProduction = process.env.NODE_ENV === 'production'
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
})

async function migrate() {
    console.log('🔄 Starting billing_date migration...')

    try {
        // Step 1: Ensure column exists
        await pool.query('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS "billing_date" DATE')
        console.log('✅ Column billing_date ensured.')

        // Step 2: Set billing_date = date for all non-credit-card transactions (or where cardId is null)
        const nonCardResult = await pool.query(`
            UPDATE finance_transactions
            SET "billing_date" = date
            WHERE "billing_date" IS NULL
              AND ("paymentMethod" != 'Cartão de Crédito' OR "cardId" IS NULL)
        `)
        console.log(`✅ Updated ${nonCardResult.rowCount} non-credit-card transactions (billing_date = date).`)

        // Step 3: Fetch all credit card transactions with valid cardId that need billing_date
        const { rows: cardTransactions } = await pool.query(`
            SELECT t.id, t.date, t."cardId", c."closingDay", c."dueDate"
            FROM finance_transactions t
            JOIN credit_cards c ON c.id = t."cardId"
            WHERE t."paymentMethod" = 'Cartão de Crédito'
              AND t."cardId" IS NOT NULL
              AND (t."billing_date" IS NULL OR t."billing_date" = t.date)
        `)

        console.log(`📋 Found ${cardTransactions.length} credit card transactions to recalculate.`)

        let updated = 0
        let skipped = 0

        for (const tx of cardTransactions) {
            if (!tx.closingDay || !tx.dueDate) {
                // Card doesn't have closing/due day configured, fallback to date
                await pool.query(
                    'UPDATE finance_transactions SET "billing_date" = date WHERE id = $1',
                    [tx.id]
                )
                skipped++
                continue
            }

            const txDateStr = typeof tx.date === 'string'
                ? tx.date.substring(0, 10)
                : tx.date.toISOString().substring(0, 10)

            const billingDate = calculateBillingDate(txDateStr, tx.closingDay, tx.dueDate)

            await pool.query(
                'UPDATE finance_transactions SET "billing_date" = $1 WHERE id = $2',
                [billingDate, tx.id]
            )
            updated++
        }

        console.log(`✅ Recalculated billing_date for ${updated} credit card transactions.`)
        if (skipped > 0) {
            console.log(`⚠️  Skipped ${skipped} transactions (card missing closingDay/dueDate, set billing_date = date).`)
        }

        // Step 4: Final safety — set billing_date = date for any remaining NULL values
        const safetyResult = await pool.query(`
            UPDATE finance_transactions
            SET "billing_date" = date
            WHERE "billing_date" IS NULL
        `)
        if (safetyResult.rowCount > 0) {
            console.log(`🔧 Safety pass: set billing_date = date for ${safetyResult.rowCount} remaining transactions.`)
        }

        console.log('🎉 Migration complete!')

    } catch (err) {
        console.error('❌ Migration error:', err)
    } finally {
        await pool.end()
    }
}

migrate()
