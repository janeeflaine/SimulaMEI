/**
 * Fix billing_date for all finance_transactions linked to invoice_items.
 * 
 * Problem: billing_date was calculated from the purchase date using calculateBillingDate(),
 * which gives the same date for all installments of the same purchase.
 * Fix: billing_date should be dueDay/referenceMonth/referenceYear from the linked invoice.
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
        // Get all finance_transactions linked to invoice items, with invoice + card info
        const { rows: transactions } = await pool.query(`
            SELECT ft.id, ft.invoice_item_id, ft."billing_date" as current_billing,
                   ci."referenceMonth", ci."referenceYear",
                   c."dueDate" as "dueDateDay"
            FROM finance_transactions ft
            JOIN invoice_items ii ON ii.id = ft.invoice_item_id
            JOIN card_invoices ci ON ci.id = ii."invoiceId"
            JOIN credit_cards c ON c.id = ci."cardId"
            WHERE ft.invoice_item_id IS NOT NULL
        `)

        console.log(`📋 Found ${transactions.length} invoice-linked transactions to check.`)

        let fixedCount = 0

        for (const tx of transactions) {
            const refMonth = parseInt(tx.referenceMonth, 10)
            const refYear = parseInt(tx.referenceYear, 10)
            const dueDay = parseInt(tx.dueDateDay, 10)

            if (!refMonth || !refYear || !dueDay) {
                console.log(`  ⚠️ Skipping tx #${tx.id} — missing referenceMonth/Year or dueDay`)
                continue
            }

            // Calculate correct billing_date
            const maxDay = new Date(refYear, refMonth, 0).getDate()
            const finalDay = Math.min(dueDay, maxDay)
            const mm = String(refMonth).padStart(2, '0')
            const dd = String(finalDay).padStart(2, '0')
            const correctBillingDate = `${refYear}-${mm}-${dd}`

            // Compare with current billing_date
            const currentStr = tx.current_billing
                ? (typeof tx.current_billing === 'string' ? tx.current_billing.substring(0, 10) : new Date(tx.current_billing).toISOString().substring(0, 10))
                : null

            if (currentStr !== correctBillingDate) {
                await pool.query(
                    'UPDATE finance_transactions SET "billing_date" = $1 WHERE id = $2',
                    [correctBillingDate, tx.id]
                )
                fixedCount++
                console.log(`  ✅ tx #${tx.id}: ${currentStr} → ${correctBillingDate}`)
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
