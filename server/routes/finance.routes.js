const express = require('express')
const router = express.Router()
const { pool: db } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const checkTenant = require('../middleware/tenant')

// Utilitário para garantir que apenas usuários do plano Ouro (ou Trial) alterem dados
const ouroOnly = (req, res, next) => {
    const isOuro = req.user.plan === 'Ouro' || Number(req.user.planId) === 3 || req.user.isInTrial === true

    if (!isOuro) {
        console.log(`[ouroOnly] Acesso Negado: Usuário ${req.user.id}. Plano: ${req.user.plan}`);
        return res.status(403).json({
            message: 'Acesso exclusivo para assinantes do plano Ouro',
            debug: { plan: req.user.plan, isInTrial: req.user.isInTrial }
        })
    }
    next()
}

// --- CATEGORIAS ---

router.get('/categories', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM finance_categories WHERE "userId" = $1 ORDER BY name ASC',
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        console.error(err)
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
        console.error(err)
        res.status(500).json({ message: 'Erro ao criar categoria' })
    }
})

router.delete('/categories/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM finance_categories WHERE id = $1 AND "userId" = $2', [req.params.id, req.user.id])
        res.json({ message: 'Categoria excluída' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao excluir categoria' })
    }
})

// --- CARTÕES DE CRÉDITO ---

router.get('/cards', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM credit_cards WHERE "userId" = $1 ORDER BY name ASC',
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar cartões' })
    }
})

// --- CONTAS A PAGAR (BILLS) ---

router.get('/bills', authMiddleware, checkTenant, async (req, res) => {
    try {
        let query = `
            SELECT b.*, c.name as "categoryName", cr.name as "cardName"
            FROM bills_to_pay b
            LEFT JOIN finance_categories c ON b."categoryId" = c.id
            LEFT JOIN credit_cards cr ON b."cardId" = cr.id
        `
        const params = []

        if (req.tenant.id === 'consolidated') {
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
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar contas' })
    }
})

router.post('/bills', authMiddleware, checkTenant, ouroOnly, async (req, res) => {
    const { description, amount, dueDate, categoryId, cardId } = req.body

    if (req.tenant.id === 'consolidated') {
        return res.status(400).json({ message: 'Selecione uma empresa específica para adicionar registros.' })
    }

    try {
        const { rows: [newBill] } = await db.query(
            'INSERT INTO bills_to_pay ("userId", "businessUnitId", description, amount, "dueDate", "categoryId", "cardId") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [req.user.id, req.tenant.id, description, amount, dueDate, categoryId, cardId]
        )
        res.json(newBill)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao criar conta' })
    }
})

// --- TRANSAÇÕES (Onde entra o limite familiar) ---

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

        if (req.tenant.id === 'consolidated') {
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
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar transações' })
    }
})

router.post('/transactions', authMiddleware, checkTenant, ouroOnly, async (req, res) => {
    if (req.tenant.id === 'consolidated') {
        return res.status(400).json({ message: 'Selecione uma empresa específica para adicionar registros.' })
    }

    let { type, target, amount, date, categoryId, paymentMethod, cardId, description, isRecurring, isSubscription, dueDate } = req.body

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
        console.error('Erro ao criar transação:', err)
        res.status(500).json({ message: 'Erro ao criar transação' })
    }
})

// --- ESTATÍSTICAS DO GRÁFICO ---

router.get('/stats/cash-flow', authMiddleware, checkTenant, async (req, res) => {
    try {
        const isConsolidated = req.tenant.id === 'consolidated'

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
        const { rows } = await db.query(query, [isConsolidated ? req.user.id : req.tenant.id]);
        res.json(rows);
    } catch (err) {
        console.error('Erro no gráfico:', err);
        res.status(500).json({ message: 'Erro ao buscar dados do gráfico' });
    }
});

module.exports = router
