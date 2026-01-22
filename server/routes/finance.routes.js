const express = require('express')
const router = express.Router()
const { pool: db } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const checkTenant = require('../middleware/tenant')

// Utilitário para permissões de plano Ouro
const ouroOnly = (req, res, next) => {
    const isOuro = req.user.plan === 'Ouro' || Number(req.user.planId) === 3 || req.user.isInTrial === true
    if (!isOuro) {
        return res.status(403).json({ message: 'Acesso exclusivo para assinantes do plano Ouro' })
    }
    next()
}

// --- ROTA RESTAURADA: CONTAS DO DIA (Isso corrige o erro 404) ---
router.get('/transactions/due-today', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT t.*, c.name as "categoryName" 
             FROM finance_transactions t 
             LEFT JOIN finance_categories c ON t."categoryId" = c.id 
             WHERE t."userId" = $1 
             AND t.status = 'PENDING' 
             AND DATE(t."dueDate") = CURRENT_DATE 
             ORDER BY t."dueDate" ASC`,
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        console.error('Erro ao buscar contas do dia:', err)
        res.status(500).json({ message: 'Erro ao buscar contas do dia' })
    }
})

// --- CATEGORIAS ---
router.get('/categories', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM finance_categories WHERE "userId" = $1 ORDER BY name ASC',
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar categorias' })
    }
})

router.post('/categories', authMiddleware, ouroOnly, async (req, res) => {
    const { name, type } = req.body
    try {
        const { rows: [newCat] } = await db.query(
            'INSERT INTO finance_categories ("userId", name, type) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, name, type]
        )
        res.json(newCat)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao criar categoria' })
    }
})

router.delete('/categories/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM finance_categories WHERE id = $1 AND "userId" = $2', [req.params.id, req.user.id])
        res.json({ message: 'Categoria excluída' })
    } catch (err) {
        res.status(500).json({ message: 'Erro ao excluir categoria' })
    }
})

// --- CARTÕES ---
router.get('/cards', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM credit_cards WHERE "userId" = $1 ORDER BY name ASC',
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar cartões' })
    }
})

router.post('/cards', authMiddleware, ouroOnly, async (req, res) => {
    const { name, lastFour, brand, closingDay, dueDate, imageUrl } = req.body
    try {
        const { rows: [newCard] } = await db.query(
            'INSERT INTO credit_cards ("userId", name, "lastFour", brand, "closingDay", "dueDate", "imageUrl") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [req.user.id, name, lastFour, brand, closingDay, dueDate, imageUrl]
        )
        res.json(newCard)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao criar cartão' })
    }
})

router.delete('/cards/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM credit_cards WHERE id = $1 AND "userId" = $2', [req.params.id, req.user.id])
        res.json({ message: 'Cartão excluído' })
    } catch (err) {
        res.status(500).json({ message: 'Erro ao excluir cartão' })
    }
})

// --- CONTAS A PAGAR ---
router.get('/bills', authMiddleware, checkTenant, async (req, res) => {
    try {
        let query = `
            SELECT b.*, c.name as "categoryName", cr.name as "cardName"
            FROM bills_to_pay b
            LEFT JOIN finance_categories c ON b."categoryId" = c.id
            LEFT JOIN credit_cards cr ON b."cardId" = cr.id
        `
        const params = []

        // Fallback de segurança: Se não houver tenant, busca tudo do usuário (evita erro 500)
        if (!req.tenant || !req.tenant.id) {
            query += ` WHERE b."userId" = $1`
            params.push(req.user.id)
        } else if (req.tenant.id === 'consolidated') {
            query += ` WHERE b."businessUnitId" IN (SELECT "businessUnitId" FROM user_permissions WHERE "userId" = $1)`
            params.push(req.user.id)
        } else {
            query += ` WHERE b."businessUnitId" = $1`
            params.push(req.tenant.id)
        }

        query += ` ORDER BY b."dueDate" ASC`

        const { rows } = await db.query(query, params)
        res.json(rows)
    } catch (err) {
        console.error('Erro bills:', err)
        res.status(500).json({ message: 'Erro ao buscar contas' })
    }
})

router.post('/bills', authMiddleware, checkTenant, ouroOnly, async (req, res) => {
    const { description, amount, dueDate, categoryId, cardId } = req.body
    if (req.tenant.id === 'consolidated') return res.status(400).json({ message: 'Selecione uma empresa específica.' })

    try {
        const { rows: [newBill] } = await db.query(
            'INSERT INTO bills_to_pay ("userId", "businessUnitId", description, amount, "dueDate", "categoryId", "cardId") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [req.user.id, req.tenant.id, description, amount, dueDate, categoryId, cardId]
        )
        res.json(newBill)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao criar conta' })
    }
})

router.patch('/bills/:id/status', authMiddleware, ouroOnly, async (req, res) => {
    const { status } = req.body
    try {
        const { rows: [updated] } = await db.query(
            'UPDATE bills_to_pay SET status = $1 WHERE id = $2 AND "userId" = $3 RETURNING *',
            [status, req.params.id, req.user.id]
        )
        res.json(updated)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao atualizar status' })
    }
})

router.delete('/bills/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM bills_to_pay WHERE id = $1 AND "userId" = $2', [req.params.id, req.user.id])
        res.json({ message: 'Conta excluída' })
    } catch (err) {
        res.status(500).json({ message: 'Erro ao excluir conta' })
    }
})

// --- TRANSAÇÕES (Corrige o erro 500) ---
router.get('/transactions/due-today', authMiddleware, checkTenant, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

        // CORREÇÃO: Usar a conexão do DB correta (db.query) e incluir filtro de status
        let query = `
            SELECT b.*, c.name as "categoryName"
            FROM bills_to_pay b
            LEFT JOIN finance_categories c ON b."categoryId" = c.id
            WHERE b."dueDate" = $1 AND b.status != 'PAID'
        `
        const params = [today]

        if (req.tenant.id === 'consolidated') {
            query += ` AND b."businessUnitId" IN (SELECT "businessUnitId" FROM user_permissions WHERE "userId" = $2)`
            params.push(req.user.id)
        } else {
            query += ` AND b."businessUnitId" = $2`
            params.push(req.tenant.id)
        }

        const { rows } = await db.query(query, params)
        res.json(rows)
    } catch (err) {
        console.error('Erro ao buscar contas vencendo hoje:', err)
        res.status(500).json({ message: 'Erro ao buscar contas do dia', error: err.message })
    }
})

router.get('/transactions', authMiddleware, checkTenant, async (req, res) => {
    try {
        let query = `
            SELECT t.*, c.name as "categoryName", cr.name as "cardName", b.name as "unitName"
             FROM finance_transactions t 
             LEFT JOIN finance_categories c ON t."categoryId" = c.id 
             LEFT JOIN credit_cards cr ON t."cardId" = cr.id
             LEFT JOIN business_units b ON t."businessUnitId" = b.id
        `
        const params = []

        // Lógica Blindada: Se req.tenant for nulo, busca pelo usuário
        if (!req.tenant || !req.tenant.id) {
            query += ` WHERE t."userId" = $1`
            params.push(req.user.id)
        } else if (req.tenant.id === 'consolidated') {
            query += ` WHERE t."businessUnitId" IN (SELECT "businessUnitId" FROM user_permissions WHERE "userId" = $1)`
            params.push(req.user.id)
        } else {
            query += ` WHERE t."businessUnitId" = $1`
            params.push(req.tenant.id)
        }

        query += ` ORDER BY t.date DESC`

        const { rows } = await db.query(query, params)
        res.json(rows)
    } catch (err) {
        console.error('Erro transactions:', err)
        res.status(500).json({ message: 'Erro ao buscar transações', error: err.message, stack: err.stack })
    }
})

router.post('/transactions', authMiddleware, checkTenant, ouroOnly, async (req, res) => {
    if (req.tenant.id === 'consolidated') return res.status(400).json({ message: 'Selecione uma empresa específica.' })

    let { type, target, amount, date, categoryId, paymentMethod, cardId, description, isRecurring, isSubscription, dueDate } = req.body

    // Normalização de dados
    const finalCategoryId = categoryId || null
    const finalCardId = paymentMethod === 'Cartão de Crédito' ? (cardId || null) : null
    const finalDueDate = dueDate || null
    const status = paymentMethod === 'Boleto' ? 'PENDING' : 'PAID'

    try {
        const { rows: [newTransaction] } = await db.query(
            `INSERT INTO finance_transactions 
            ("userId", "businessUnitId", type, target, amount, date, "categoryId", "paymentMethod", "cardId", description, "isRecurring", "isSubscription", status, "dueDate") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [req.user.id, req.tenant.id, type, target, amount, date, finalCategoryId, paymentMethod, finalCardId, description, isRecurring, isSubscription, status, finalDueDate]
        )
        res.json(newTransaction)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao criar transação' })
    }
})

router.patch('/transactions/:id/confirm', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { rows: [updated] } = await db.query(
            'UPDATE finance_transactions SET status = \'PAID\', date = CURRENT_TIMESTAMP WHERE id = $1 AND "userId" = $2 RETURNING *',
            [req.params.id, req.user.id]
        )
        if (!updated) return res.status(404).json({ message: 'Transação não encontrada' })
        res.json(updated)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao confirmar pagamento' })
    }
})

router.patch('/transactions/:id', authMiddleware, ouroOnly, async (req, res) => {
    let { type, target, amount, date, categoryId, paymentMethod, cardId, description, isRecurring, isSubscription, dueDate } = req.body

    const finalCategoryId = categoryId || null
    const finalCardId = paymentMethod === 'Cartão de Crédito' ? (cardId || null) : null
    const finalDueDate = dueDate || null

    try {
        const { rows: [updated] } = await db.query(
            `UPDATE finance_transactions 
            SET type = $1, target = $2, amount = $3, date = $4, "categoryId" = $5, 
                "paymentMethod" = $6, "cardId" = $7, description = $8, 
                "isRecurring" = $9, "isSubscription" = $10, "dueDate" = $11
            WHERE id = $12 AND "userId" = $13 RETURNING *`,
            [type, target, amount, date, finalCategoryId, paymentMethod, finalCardId, description, isRecurring, isSubscription, finalDueDate, req.params.id, req.user.id]
        )
        if (!updated) return res.status(404).json({ message: 'Transação não encontrada' })
        res.json(updated)
    } catch (err) {
        res.status(500).json({ message: 'Erro ao atualizar transação' })
    }
})

router.delete('/transactions/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { rowCount } = await db.query(
            'DELETE FROM finance_transactions WHERE id = $1 AND "userId" = $2',
            [req.params.id, req.user.id]
        )
        if (rowCount === 0) return res.status(404).json({ message: 'Transação não encontrada' })
        res.json({ message: 'Transação excluída com sucesso' })
    } catch (err) {
        res.status(500).json({ message: 'Erro ao excluir transação' })
    }
})

// --- ESTATÍSTICAS (Corrige o erro 500 no gráfico) ---
router.get('/stats/cash-flow', authMiddleware, checkTenant, async (req, res) => {
    try {
        // Fallback: Se não houver tenant definido, assume 'consolidated' do usuário para evitar crash
        const tenantId = (req.tenant && req.tenant.id) ? req.tenant.id : 'consolidated';
        const isConsolidated = tenantId === 'consolidated';

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
                ${isConsolidated
                ? `t."businessUnitId" IN (SELECT "businessUnitId" FROM user_permissions WHERE "userId" = $1)`
                : `t."businessUnitId" = $1`
            } AND
                t.status = 'PAID'
            GROUP BY m.month_date
            ORDER BY m.month_date ASC
        `;
        const { rows } = await db.query(query, [isConsolidated ? req.user.id : tenantId]);
        res.json(rows);
    } catch (err) {
        console.error('Erro no gráfico:', err);
        res.status(500).json({ message: 'Erro ao buscar dados do gráfico', error: err.message });
    }
});

module.exports = router
