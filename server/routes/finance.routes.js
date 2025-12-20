const express = require('express')
const router = express.Router()
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')

// Utility to ensure only Ouro plan users can change data
const ouroOnly = (req, res, next) => {
    if (req.user.plan !== 'Ouro' && Number(req.user.planId) !== 3) {
        return res.status(403).json({ message: 'Acesso exclusivo para assinantes do plano Ouro' })
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
    let { type, target, amount, date, categoryId, paymentMethod, cardId, description, isRecurring, isSubscription, dueDate } = req.body

    // Normalize empty strings to null for ID and date columns
    const finalCategoryId = categoryId === '' || categoryId === null ? null : categoryId
    const finalCardId = (paymentMethod === 'Cartão de Crédito' && cardId !== '' && cardId !== null) ? cardId : null
    const finalDueDate = dueDate === '' || dueDate === null ? null : dueDate

    // If it's a Boleto, it starts as PENDING
    const status = paymentMethod === 'Boleto' ? 'PENDING' : 'PAID'

    try {
        const { rows: [newTransaction] } = await db.query(
            `INSERT INTO finance_transactions 
            ("userId", type, target, amount, date, "categoryId", "paymentMethod", "cardId", description, "isRecurring", "isSubscription", status, "dueDate") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [req.user.id, type, target, amount, date, finalCategoryId, paymentMethod, finalCardId, description, isRecurring, isSubscription, status, finalDueDate]
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

module.exports = router
