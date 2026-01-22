const { pool } = require('./db');
require('dotenv').config();

async function debugRoutes() {
    console.log('🐞 Iniciando Debug de Rotas...');
    const client = await pool.connect();

    try {
        // 1. Pegar um usuário real (Admin ou primeiro usuário)
        const userRes = await client.query('SELECT id, email FROM users LIMIT 1');
        if (userRes.rows.length === 0) {
            console.log('❌ Nenhum usuário encontrado para teste.');
            return;
        }
        const user = userRes.rows[0];
        console.log(`👤 Usuário de teste: ${user.email} (ID: ${user.id})`);

        // 2. Pegar Business Unit
        const unitRes = await client.query('SELECT id FROM business_units WHERE "ownerId" = $1 LIMIT 1', [user.id]);
        const unitId = unitRes.rows.length > 0 ? unitRes.rows[0].id : null;
        console.log(`🏢 Unidade de teste: ${unitId}`);

        if (!unitId) {
            console.warn('⚠️ Usuário sem unidade. Testando queries com userId direto (Fallback da rota transactions)...');
        }

        // --- TESTE ROTA /transactions (Erro 500) ---
        console.log('\n🧪 Testando Query: GET /transactions');
        try {
            let query = `
                SELECT t.*, c.name as "categoryName", cr.name as "cardName", b.name as "unitName"
                 FROM finance_transactions t 
                 LEFT JOIN finance_categories c ON t."categoryId" = c.id 
                 LEFT JOIN credit_cards cr ON t."cardId" = cr.id
                 LEFT JOIN business_units b ON t."businessUnitId" = b.id
            `
            let params = [];

            if (unitId) {
                query += ` WHERE t."businessUnitId" = $1`;
                params.push(unitId);
            } else {
                query += ` WHERE t."userId" = $1`;
                params.push(user.id);
            }
            query += ` ORDER BY t.date DESC`;

            await client.query(query, params);
            console.log('✅ /transactions: Query executada com SUCESSO.');
        } catch (err) {
            console.error('❌ /transactions: FALHA na Query:', err.message);
        }

        // --- TESTE ROTA /stats/cash-flow (Erro 500) ---
        console.log('\n🧪 Testando Query: GET /stats/cash-flow');
        try {
            const isConsolidated = false;
            const targetId = unitId || user.id; // Se tem unidade usa ela, senão... wait, rota usa user.id se consolidated

            const query = `
                WITH RECURSIVE last_months AS (
                    SELECT date_trunc('month', CURRENT_DATE) - INTERVAL '5 months' as month_date
                    UNION ALL
                    SELECT month_date + INTERVAL '1 month'
                    FROM last_months
                    WHERE month_date < date_trunc('month', CURRENT_DATE)
                )
                SELECT 
                    TO_CHAR(m.month_date, 'Mon') as name,
                    COALESCE(SUM(CASE WHEN t.type = 'RECEITA' THEN t.amount ELSE 0 END), 0) as entrada,
                    COALESCE(SUM(CASE WHEN t.type = 'DESPESA' THEN t.amount ELSE 0 END), 0) as saida
                FROM last_months m
                LEFT JOIN finance_transactions t ON 
                    date_trunc('month', t.date) = m.month_date AND 
                    t."businessUnitId" = $1 AND
                    t.status = 'PAID'
                GROUP BY m.month_date
                ORDER BY m.month_date ASC
            `;
            // Note: mimicking non-consolidated path
            await client.query(query, [unitId]);
            console.log('✅ /stats/cash-flow: Query executada com SUCESSO.');
        } catch (err) {
            console.error('❌ /stats/cash-flow: FALHA na Query:', err.message);
        }

    } catch (err) {
        console.error('❌ Erro geral:', err);
    } finally {
        client.release();
        pool.end();
    }
}

debugRoutes();
