/**
 * Fix billing_date for all finance_transactions linked to invoice_items.
 * 
 * The simplest fix: use the invoice's actual dueDate field directly as billing_date.
 * The card_invoices table already stores the exact due date (extracted by AI from PDF).
 * 
 * Usage: node server/scripts/fixInvoiceBillingDates.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { Pool, types } = require('pg')

types.setTypeParser(1082, (stringValue) => stringValue)

const isProduction = process.env.NODE_ENV === 'production'
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
})

async function fixInvoiceBillingDates() {
    console.log('🔄 Fixing billing_date for invoice-linked transactions...')

    try {
        const { rows: transactions } = await pool.query(`
            SELECT ft.id, ft."billing_date" as current_billing, ft.description,
                   ci."dueDate" as invoice_due_date
            FROM finance_transactions ft
            JOIN invoice_items ii ON ii.id = ft.invoice_item_id
            JOIN card_invoices ci ON ci.id = ii."invoiceId"
            WHERE ft.invoice_item_id IS NOT NULL
        `)

        console.log(`📋 Found ${transactions.length} invoice-linked transactions to check.`)

        let fixedCount = 0

        for (const tx of transactions) {
            if (!tx.invoice_due_date) {
                console.log(`  ⚠️ Skipping tx #${tx.id} — invoice has no dueDate`)
                continue
            }

            const correctBillingDate = typeof tx.invoice_due_date === 'string'
                ? tx.invoice_due_date.substring(0, 10)
                : tx.invoice_due_date.toISOString().substring(0, 10)

            const currentStr = tx.current_billing
                ? (typeof tx.current_billing === 'string' ? tx.current_billing.substring(0, 10) : tx.current_billing.toISOString().substring(0, 10))
                : null

            if (currentStr !== correctBillingDate) {
                await pool.query(
                    'UPDATE finance_transactions SET "billing_date" = $1 WHERE id = $2',
                    [correctBillingDate, tx.id]
                )
                fixedCount++
                console.log(`  ✅ tx #${tx.id}: ${currentStr} → ${correctBillingDate} (${(tx.description || '').substring(0, 30)})`)
            }
        }

        console.log(`\n🎉 Done! Fixed ${fixedCount} of ${transactions.length} transactions.`)
    } catch (err) {
        console.error('❌ Error:', err)
    } finally {
        await pool.end()
    }
}

fixInvoiceBillingDates()
