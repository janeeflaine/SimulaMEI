const { pool } = require('./db');
require('dotenv').config();

async function listUsers() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT id, name, email, "planId" FROM users ORDER BY id ASC');
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

listUsers();
