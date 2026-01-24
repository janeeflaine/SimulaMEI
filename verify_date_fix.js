
const { Pool, types } = require('pg');
require('dotenv').config({ path: 'server/.env' });

// Force pg to return DATE columns as strings (YYYY-MM-DD)
types.setTypeParser(1082, (stringValue) => stringValue);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false // Assuming local dev for verification
});

const verify = async () => {
    try {
        console.log('🧪 Testing Date Persistence...');

        // 1. Insert a transaction with a specific date
        const testDate = '2026-01-15';
        // We need a valid userId. Let's pick the first one.
        const userRes = await pool.query('SELECT id FROM users LIMIT 1');
        if (userRes.rows.length === 0) {
            console.log('⚠️ No users found. Cannot test.');
            return;
        }
        const userId = userRes.rows[0].id;

        console.log(`INSERTING date: ${testDate} for user ${userId}`);

        // Insert directly
        const insertRes = await pool.query(
            `INSERT INTO finance_transactions 
        ("userId", type, target, amount, date, description, status) 
        VALUES ($1, 'DESPESA', 'PERSONAL', 100, $2, 'Test Date Bug', 'PAID') 
        RETURNING id, date`,
            [userId, testDate]
        );

        const insertedId = insertRes.rows[0].id;
        const returnedDate = insertRes.rows[0].date;

        console.log(`RETURNING... ID: ${insertedId}`);
        console.log(`RAW VALUE FROM DB:`, returnedDate);
        console.log(`TYPE OF RETURN:`, typeof returnedDate);

        if (returnedDate === testDate) {
            console.log('✅ PASS: returned date matches inserted date exactly.');
        } else {
            console.error('❌ FAIL: returned date DOES NOT match.');
            console.error(`Expected: ${testDate}`);
            console.error(`Received: ${returnedDate}`);
        }

        // Cleanup
        await pool.query('DELETE FROM finance_transactions WHERE id = $1', [insertedId]);

    } catch (err) {
        console.error('❌ Error during verification:', err);
    } finally {
        await pool.end();
    }
};

verify();
