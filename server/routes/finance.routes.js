const express = require('express')
const router = express.Router()
const { db, pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')

// Utility to ensure only Ouro plan users can change data
const ouroOnly = (req, res, next) => {
    const isOuro = req.user.plan === 'Ouro' || Number(req.user.planId) === 3 || req.user.isInTrial === true

    if (!isOuro) {
        console.log(`[ouroOnly] Access Denied for user ${req.user.id}. Plan: ${req.user.plan}, PlanId: ${req.user.planId}, Trial: ${req.user.isInTrial}`)
        return res.status(403).json({
            message: 'Acesso exclusivo para assinantes do plano Ouro',
            debug: {
                plan: req.user.plan,
                planId: req.user.planId,
                isInTrial: req.user.isInTrial
            }
        })
    }
    next()
}

// --- CATEGORIES ---

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

router.patch('/categories/:id', authMiddleware, ouroOnly, async (req, res) => {
    const { name, type } = req.body
    try {
        const { rows: [updated] } = await db.query(
            'UPDATE finance_categories SET name = $1, type = $2 WHERE id = $3 AND "userId" = $4 RETURNING *',
            [name, type, req.params.id, req.user.id]
        )
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao atualizar categoria' })
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

// --- CREDIT CARDS ---

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

router.post('/cards', authMiddleware, ouroOnly, async (req, res) => {
    const { name, lastFour, brand, closingDay, dueDate, imageUrl } = req.body
    try {
        const { rows: [newCard] } = await db.query(
            'INSERT INTO credit_cards ("userId", name, "lastFour", brand, "closingDay", "dueDate", "imageUrl") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [req.user.id, name, lastFour, brand, closingDay, dueDate, imageUrl]
        )
        res.json(newCard)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao criar cartão' })
    }
})

router.delete('/cards/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM credit_cards WHERE id = $1 AND "userId" = $2', [req.params.id, req.user.id])
        res.json({ message: 'Cartão excluído' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao excluir cartão' })
    }
})

// --- BILLS (CONTAS A PAGAR) ---

router.get('/bills', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT b.*, c.name as "categoryName", cr.name as "cardName"
            FROM bills_to_pay b
            LEFT JOIN finance_categories c ON b."categoryId" = c.id
            LEFT JOIN credit_cards cr ON b."cardId" = cr.id
            WHERE b."userId" = $1
            ORDER BY b."dueDate" ASC
        `, [req.user.id])
        res.json(rows)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar contas' })
    }
})

router.post('/bills', authMiddleware, ouroOnly, async (req, res) => {
    const { description, amount, dueDate, categoryId, cardId } = req.body
    try {
        const { rows: [newBill] } = await db.query(
            'INSERT INTO bills_to_pay ("userId", description, amount, "dueDate", "categoryId", "cardId") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [req.user.id, description, amount, dueDate, categoryId, cardId]
        )
        res.json(newBill)
    } catch (err) {
        console.error(err)
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
        console.error(err)
        res.status(500).json({ message: 'Erro ao atualizar status' })
    }
})

router.delete('/bills/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM bills_to_pay WHERE id = $1 AND "userId" = $2', [req.params.id, req.user.id])
        res.json({ message: 'Conta excluída' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao excluir conta' })
    }
})

// --- TRANSACTIONS ---

router.get('/transactions', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT t.*, c.name as "categoryName", cr.name as "cardName" 
             FROM finance_transactions t 
             LEFT JOIN finance_categories c ON t."categoryId" = c.id 
             LEFT JOIN credit_cards cr ON t."cardId" = cr.id
             WHERE t."userId" = $1 
             ORDER BY t.date DESC`,
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar transações' })
    }
})

router.post('/transactions', authMiddleware, ouroOnly, async (req, res) => {
    let { type, target, amount, date, categoryId, paymentMethod, cardId, description, isRecurring, isSubscription, dueDate, business_unit_id } = req.body

    // Normalize empty strings to null for ID and date columns
    const finalCategoryId = categoryId === '' || categoryId === null ? null : categoryId
    const finalCardId = (paymentMethod === 'Cartão de Crédito' && cardId !== '' && cardId !== null) ? cardId : null
    const finalDueDate = dueDate === '' || dueDate === null ? null : dueDate
    const finalBusinessUnitId = business_unit_id === '' || business_unit_id === null ? null : business_unit_id

    // If it's a Boleto, it starts as PENDING
    const status = paymentMethod === 'Boleto' ? 'PENDING' : 'PAID'

    try {
        const { rows: [newTransaction] } = await db.query(
            `INSERT INTO finance_transactions 
            ("userId", type, target, amount, date, "categoryId", "paymentMethod", "cardId", description, "isRecurring", "isSubscription", status, "dueDate", "business_unit_id") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [req.user.id, type, target, amount, date, finalCategoryId, paymentMethod, finalCardId, description, isRecurring, isSubscription, status, finalDueDate, finalBusinessUnitId]
        )
        res.json(newTransaction)
    } catch (err) {
        console.error('Erro ao criar transação:', err)
        res.status(500).json({ message: 'Erro ao criar transação' })
    }
})

// Confirm payment of a pending transaction
router.patch('/transactions/:id/confirm', authMiddleware, ouroOnly, async (req, res) => {
    try {
        // Update status to PAID and date to current timestamp
        const { rows: [updated] } = await db.query(
            'UPDATE finance_transactions SET status = \'PAID\', date = CURRENT_TIMESTAMP WHERE id = $1 AND "userId" = $2 RETURNING *',
            [req.params.id, req.user.id]
        )
        if (!updated) return res.status(404).json({ message: 'Transação não encontrada' })
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao confirmar pagamento' })
    }
})

// Get bills due today (for alerts)
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
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar contas do dia' })
    }
})

// Update a transaction
router.patch('/transactions/:id', authMiddleware, ouroOnly, async (req, res) => {
    let { type, target, amount, date, categoryId, paymentMethod, cardId, description, isRecurring, isSubscription, dueDate } = req.body

    // Normalize empty strings to null
    const finalCategoryId = categoryId === '' || categoryId === null ? null : categoryId
    const finalCardId = (paymentMethod === 'Cartão de Crédito' && cardId !== '' && cardId !== null) ? cardId : null
    const finalDueDate = dueDate === '' || dueDate === null ? null : dueDate

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
        console.error('Erro ao atualizar transação:', err)
        res.status(500).json({ message: 'Erro ao atualizar transação' })
    }
})

// Delete a transaction
router.delete('/transactions/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { rowCount } = await db.query(
            'DELETE FROM finance_transactions WHERE id = $1 AND "userId" = $2',
            [req.params.id, req.user.id]
        )
        if (rowCount === 0) return res.status(404).json({ message: 'Transação não encontrada' })
        res.json({ message: 'Transação excluída com sucesso' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao excluir transação' })
    }
})

// Get monthly cash flow stats for charts (last 6 months)
router.get('/stats/cash-flow', authMiddleware, async (req, res) => {
    try {
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
                t."userId" = $1 AND 
                t.status = 'PAID'
            GROUP BY m.month_date
            ORDER BY m.month_date ASC
        `;
        const { rows } = await db.query(query, [req.user.id]);
        res.json(rows);
    } catch (err) {
        console.error('Erro ao buscar estatísticas de fluxo de caixa:', err);
        res.status(500).json({ message: 'Erro ao buscar dados do gráfico' });
    }
});

// --- TRANSFERS ---

router.post('/transfers', authMiddleware, ouroOnly, async (req, res) => {
    const { sourceWalletId, targetWalletId, amount, date, description } = req.body;

    if (!sourceWalletId || !targetWalletId || !amount || !date) {
        return res.status(400).json({ message: 'Dados incompletos para transferência.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Create Expense in Source Wallet
        await client.query(
            `INSERT INTO finance_transactions 
            ("userId", type, target, amount, date, "business_unit_id", description, "paymentMethod", status) 
            VALUES ($1, 'DESPESA', 'BUSINESS', $2, $3, $4, $5, 'Transferência', 'PAID')`,
            [req.user.id, amount, date, sourceWalletId, `Transferência para carteira #${targetWalletId} - ${description || ''}`]
        );

        // 2. Create Income in Target Wallet
        await client.query(
            `INSERT INTO finance_transactions 
            ("userId", type, target, amount, date, "business_unit_id", description, "paymentMethod", status) 
            VALUES ($1, 'RECEITA', 'BUSINESS', $2, $3, $4, $5, 'Transferência', 'PAID')`,
            [req.user.id, amount, date, targetWalletId, `Transferência de carteira #${sourceWalletId} - ${description || ''}`]
        );

        await client.query('COMMIT');
        res.json({ message: 'Transferência realizada com sucesso!' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro na transferência:', err);
        res.status(500).json({ message: 'Erro ao realizar transferência.' });
    } finally {
        client.release();
    }
});

// --- BUSINESS UNITS (Wallets) ---

router.get('/business-units', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM business_units WHERE "ownerId" = $1 ORDER BY "isPrimary" DESC, name ASC',
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar carteiras' })
    }
})

router.post('/business-units', authMiddleware, ouroOnly, async (req, res) => {
    // Recebe os dados do Frontend
    const { name, account_type, cnpj, photo_url, isPrimary } = req.body

    try {
        // CORREÇÃO: 
        // 1. Mudamos "userId" para "ownerId" (para bater com seu banco)
        // 2. Mudamos "photo_url" para "logo_url" (se sua coluna no banco for logo_url)

        const { rows: [newUnit] } = await db.query(
            `INSERT INTO business_units 
            ("ownerId", name, account_type, cnpj, logo_url, "isPrimary") 
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *`,
            [
                req.user.id,        // $1: Vai para ownerId
                name,               // $2: Vai para name
                account_type,       // $3: Vai para account_type
                cnpj,               // $4: Vai para cnpj
                photo_url,          // $5: Salva em logo_url
                isPrimary || false  // $6: isPrimary
            ]
        )
        res.json(newUnit)

    } catch (err) {
        console.error("ERRO AO CRIAR CARTEIRA:", err)
        res.status(500).json({ message: 'Erro ao criar carteira. Verifique o console do servidor.' })
    }
})

router.put('/business-units/:id', authMiddleware, ouroOnly, async (req, res) => {
    const { name, account_type, cnpj, photo_url, isPrimary } = req.body
    try {
        const { rows: [updated] } = await db.query(
            'UPDATE business_units SET name = $1, "account_type" = $2, cnpj = $3, "logo_url" = $4, "isPrimary" = $5 WHERE id = $6 AND "ownerId" = $7 RETURNING *',
            [name, account_type, cnpj, photo_url, isPrimary, req.params.id, req.user.id]
        )
        if (!updated) return res.status(404).json({ message: 'Carteira não encontrada' })
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao atualizar carteira' })
    }
})

router.delete('/business-units/:id', authMiddleware, ouroOnly, async (req, res) => {
    try {
        await db.query('DELETE FROM business_units WHERE id = $1 AND "ownerId" = $2', [req.params.id, req.user.id])
        res.json({ message: 'Carteira excluída' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao excluir carteira' })
    }
});

module.exports = router
