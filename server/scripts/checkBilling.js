require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })
const { Pool, types } = require('pg')
types.setTypeParser(1082, s => s)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
})

async function main() {
    const { rows } = await pool.query(`SELECT id, "cardId", "referenceMonth", "referenceYear", "totalAmount", "dueDate", "closingDate", status FROM card_invoices ORDER BY id DESC LIMIT 5`)
    console.log(JSON.stringify(rows, null, 2))
    await pool.end()
}
main().catch(e => { console.error(e); pool.end() })
