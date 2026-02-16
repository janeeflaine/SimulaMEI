const { pool } = require('../db');

async function dropTable() {
    try {
        console.log('Dropping table bills_to_pay...');
        await pool.query('DROP TABLE IF EXISTS bills_to_pay');
        console.log('Table dropped successfully.');
    } catch (err) {
        console.error('Error dropping table:', err);
    } finally {
        await pool.end();
    }
}

dropTable();
