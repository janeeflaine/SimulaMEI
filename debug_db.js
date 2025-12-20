const { pool } = require('./server/db');

async function debug() {
    try {
        const plans = await pool.query('SELECT * FROM plans');
        console.log('Plans:', plans.rows);

        const settings = await pool.query('SELECT * FROM system_settings');
        console.log('Settings:', settings.rows);

        const users = await pool.query('SELECT id, name, email, "planId", "createdAt" FROM users ORDER BY "createdAt" DESC LIMIT 5');
        console.log('Recent Users:', users.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

debug();
