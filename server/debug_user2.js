const { pool } = require('./db');
require('dotenv').config();

async function debugUser2() {
    const client = await pool.connect();
    try {
        const userId = 2; // Jane Eflaine
        console.log(`🐞 Debugging Data for User ID: ${userId}`);

        // 1. Check Units
        const units = await client.query('SELECT * FROM business_units WHERE "ownerId" = $1', [userId]);
        console.log(`🏢 Units found: ${units.rows.length}`);
        console.table(units.rows);

        // 2. Check Transactions
        const trans = await client.query('SELECT id, "businessUnitId", amount, date FROM finance_transactions WHERE "userId" = $1 LIMIT 5', [userId]);
        console.log(`💸 Transactions sample (Total: ${trans.rowCount}):`);
        console.table(trans.rows);

        // 3. Mismatch Check
        if (units.rows.length > 0) {
            const unitIds = units.rows.map(u => u.id);
            const orphaned = await client.query(`
                SELECT count(*) FROM finance_transactions 
                WHERE "userId" = $1 AND "businessUnitId" NOT IN (${unitIds.map((_, i) => '$' + (i + 2)).join(',')})
            `, [userId, ...unitIds]);
            console.log(`⚠️ Transactions belonging to User ${userId} but linked to unknown units: ${orphaned.rows[0].count}`);
        } else {
            console.log(`⚠️ User has NO business units! All ${trans.rowCount} transactions are potentially hidden if filtering by unit.`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

debugUser2();
