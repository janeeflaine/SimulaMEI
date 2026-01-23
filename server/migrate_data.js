const { pool } = require('./db');
require('dotenv').config();

async function migrateData() {
    const client = await pool.connect();
    try {
        const sourceId = 2; // Jane
        const targetId = 1; // Admin

        console.log(`🚀 Iniciando Migração de Dados (User ${sourceId} -> User ${targetId})...`);

        // Check if target is empty to avoid double-migration/duplication
        const targetCount = await client.query('SELECT count(*) FROM finance_transactions WHERE "userId" = $1', [targetId]);
        if (parseInt(targetCount.rows[0].count) > 0) {
            console.log(`⚠️ Abortando: O usuário destino (ID ${targetId}) já possui ${targetCount.rows[0].count} transações.`);
            // Optional: Continue if you want to merge, but safety first.
            return;
        }

        // Migrate Business Units (ownership)
        // We need to ensure Admin has a primary unit.
        // Option A: Transfer Jane's units to Admin.
        const unitUpdate = await client.query('UPDATE business_units SET "ownerId" = $1 WHERE "ownerId" = $2', [targetId, sourceId]);
        console.log(`✅ Unidades de Negócio transferidas: ${unitUpdate.rowCount}`);

        // Migrate Transactions
        const transUpdate = await client.query('UPDATE finance_transactions SET "userId" = $1 WHERE "userId" = $2', [targetId, sourceId]);
        console.log(`✅ Transações transferidas: ${transUpdate.rowCount}`);

        // Migrate Bills
        const billsUpdate = await client.query('UPDATE bills_to_pay SET "userId" = $1 WHERE "userId" = $2', [targetId, sourceId]);
        console.log(`✅ Contas a Pagar transferidas: ${billsUpdate.rowCount}`);

        // Migrate Categories
        const catUpdate = await client.query('UPDATE finance_categories SET "userId" = $1 WHERE "userId" = $2', [targetId, sourceId]);
        console.log(`✅ Categorias transferidas: ${catUpdate.rowCount}`);

        // Migrate Cards
        const cardUpdate = await client.query('UPDATE credit_cards SET "userId" = $1 WHERE "userId" = $2', [targetId, sourceId]);
        console.log(`✅ Cartões transferidos: ${cardUpdate.rowCount}`);

        console.log('🏁 Migração Concluída com Sucesso.');

    } catch (err) {
        console.error('❌ Erro na migração:', err);
    } finally {
        client.release();
        pool.end();
    }
}

migrateData();
