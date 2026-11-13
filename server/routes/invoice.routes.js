/**
 * Invoice Routes — /api/finance/invoices
 * 
 * Handles CRUD for card invoices, invoice items, and dashboard data.
 * Isolated from finance.routes.js to avoid breaking existing functionality.
 */
const express = require('express')
const router = express.Router()
const { db, pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { validateReferenceOwnership } = require('../middleware/walletSecurity')
const { featureGuard } = require('../middleware/planGuard')
const cartoesGuard = featureGuard('cartoes')
const uploadFaturasGuard = featureGuard('upload_faturas')
const { calculateBillingDate } = require('../utils/billingDate')
const multer = require('multer')
const { parseInvoice, validateFile, SUPPORTED_MIME_TYPES, MAX_FILE_SIZE } = require('../utils/geminiService')

// Multer config — store in memory (no disk), limit 10MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error(`Formato não suportado: ${file.mimetype}`), false)
        }
    }
})

// =============================================
// === CONFERÊNCIA DOS DADOS ===================
// =============================================

const MAX_DESCRIPTION = 200
const MAX_AMOUNT = 100000000 // R$ 100 milhões: acima disso é erro de digitação
const MAX_BULK_IDS = 500

// Número inteiro positivo que cabe numa coluna INTEGER do banco
const toId = (value) => {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
    return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null
}

const isValidDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const d = new Date(`${value}T12:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

// Valor de compra: pode ser negativo (estorno), nunca zero nem absurdo
const isValidItemAmount = (value) => {
    if (value === null || value === '' || typeof value === 'boolean') return false
    const n = Number(value)
    return Number.isFinite(n) && n !== 0 && Math.abs(n) <= MAX_AMOUNT
}

// Confere os campos de um item. partial = edição (só confere o que veio).
function itemDataError(body, partial) {
    if (!partial || body.description !== undefined) {
        if (typeof body.description !== 'string' || !body.description.trim()) return 'Escreva a descrição da compra.'
        if (body.description.trim().length > MAX_DESCRIPTION) return `A descrição pode ter até ${MAX_DESCRIPTION} letras.`
    }
    if (!partial || body.amount !== undefined) {
        if (!isValidItemAmount(body.amount)) return 'Informe um valor diferente de zero.'
    }
    if (body.transactionDate !== undefined && body.transactionDate !== null && body.transactionDate !== '') {
        if (!isValidDate(body.transactionDate)) return 'A data da compra não é válida.'
    }
    if (body.isConfirmed !== undefined && typeof body.isConfirmed !== 'boolean') return 'Campo de confirmação inválido.'
    if (body.categoryName !== undefined && body.categoryName !== null && typeof body.categoryName !== 'string') return 'Categoria inválida.'
    if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== '' && !toId(body.categoryId)) return 'Categoria inválida.'
    return null
}

// Ids inválidos na URL viram 404 (antes viravam erro 500 no banco)
router.param('id', (req, res, next, value) => toId(value) ? next() : res.status(404).json({ message: 'Fatura não encontrada' }))
router.param('itemId', (req, res, next, value) => toId(value) ? next() : res.status(404).json({ message: 'Item não encontrado' }))
router.param('cardId', (req, res, next, value) => toId(value) ? next() : res.status(404).json({ message: 'Cartão não encontrado' }))

// Soma os itens e grava o total da fatura
async function recalcInvoiceTotal(q, invoiceId) {
    const { rows: [totals] } = await q.query(
        'SELECT COALESCE(SUM(amount), 0) as "totalAmount" FROM invoice_items WHERE "invoiceId" = $1',
        [invoiceId]
    )
    await q.query(
        'UPDATE card_invoices SET "totalAmount" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [totals?.totalAmount || 0, invoiceId]
    )
}

// Item confirmado aparece no Extrato (finance_transactions); não confirmado sai de lá.
// cardInfo: { cardId, business_unit_id, account_type, invoiceDueDate }
async function syncItemToStatement(q, userId, item, cardInfo) {
    if (!item.isConfirmed) {
        await q.query('DELETE FROM finance_transactions WHERE invoice_item_id = $1 AND "userId" = $2', [item.id, userId])
        return
    }
    if (!cardInfo || !cardInfo.business_unit_id) return

    const targetType = cardInfo.account_type === 'PJ' ? 'BUSINESS' : 'PERSONAL'
    const transactionDate = item.transactionDate || new Date()
    // A compra entra no Extrato na data de vencimento da fatura
    const billingDate = cardInfo.invoiceDueDate || transactionDate

    const existCheck = await q.query('SELECT id FROM finance_transactions WHERE invoice_item_id = $1', [item.id])

    if (existCheck.rows.length > 0) {
        await q.query(`
            UPDATE finance_transactions
            SET amount = $1, date = $2, "categoryId" = $3, description = $4, "business_unit_id" = $5, target = $6, "billing_date" = $7
            WHERE invoice_item_id = $8
        `, [item.amount, transactionDate, item.categoryId, item.description, cardInfo.business_unit_id, targetType, billingDate, item.id])
    } else {
        await q.query(`
            INSERT INTO finance_transactions
            ("userId", type, target, amount, date, "categoryId", "paymentMethod", "cardId", description, status, "business_unit_id", "invoice_item_id", "billing_date")
            VALUES ($1, 'DESPESA', $2, $3, $4, $5, 'Cartão de Crédito', $6, $7, 'PAID', $8, $9, $10)
        `, [userId, targetType, item.amount, transactionDate, item.categoryId, cardInfo.cardId, item.description, cardInfo.business_unit_id, item.id, billingDate])
    }
}

// Tipo de categoria que combina com a carteira do cartão
const categoryTypeFor = (accountType) => accountType === 'PJ' ? 'DESPESA_MEI' : 'DESPESA_PESSOAL'

// Roda fn dentro de uma transação: ou tudo é gravado, ou nada.
async function withTransaction(fn) {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const result = await fn(client)
        await client.query('COMMIT')
        return result
    } catch (err) {
        try { await client.query('ROLLBACK') } catch { /* conexão já caiu */ }
        throw err
    } finally {
        client.release()
    }
}

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status }
}

// =============================================
// === INVOICES CRUD ===========================
// =============================================

// GET /api/finance/invoices — List invoices (optionally filtered by cardId)
router.get('/', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const { cardId, year } = req.query
        let query = `
            SELECT ci.*, cc.name as "cardName", cc.brand as "cardBrand"
            FROM card_invoices ci
            JOIN credit_cards cc ON cc.id = ci."cardId"
            WHERE ci."userId" = $1
        `
        const params = [req.user.id]

        if (cardId !== undefined) {
            if (!toId(cardId)) return res.status(400).json({ message: 'Cartão inválido.' })
            params.push(toId(cardId))
            query += ` AND ci."cardId" = $${params.length}`
        }

        if (year !== undefined) {
            const y = Number(year)
            if (!Number.isInteger(y) || y < 2000 || y > 2100) return res.status(400).json({ message: 'Ano inválido.' })
            params.push(y)
            query += ` AND ci."referenceYear" = $${params.length}`
        }

        query += ' ORDER BY ci."referenceYear" DESC, ci."referenceMonth" DESC'

        const { rows } = await db.query(query, params)
        res.json(rows)
    } catch (err) {
        console.error('Erro ao buscar faturas:', err)
        res.status(500).json({ message: 'Erro ao buscar faturas' })
    }
})

// POST /api/finance/invoices — Create a new invoice
router.post('/', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const { totalAmount, dueDate, closingDate } = req.body
        const cardId = toId(req.body.cardId)
        const referenceMonth = Number(req.body.referenceMonth)
        const referenceYear = Number(req.body.referenceYear)

        if (!cardId) return res.status(404).json({ message: 'Cartão não encontrado' })
        if (!Number.isInteger(referenceMonth) || referenceMonth < 1 || referenceMonth > 12) {
            return res.status(400).json({ message: 'Mês da fatura inválido.' })
        }
        if (!Number.isInteger(referenceYear) || referenceYear < 2000 || referenceYear > 2100) {
            return res.status(400).json({ message: 'Ano da fatura inválido.' })
        }
        for (const d of [dueDate, closingDate]) {
            if (d !== undefined && d !== null && d !== '' && !isValidDate(d)) {
                return res.status(400).json({ message: 'Data da fatura inválida.' })
            }
        }

        // Validate totalAmount
        if (totalAmount !== undefined && totalAmount !== null) {
            const n = Number(totalAmount)
            if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: 'O valor total não pode ser negativo' })
            if (n > MAX_AMOUNT) return res.status(400).json({ message: 'Valor total muito alto.' })
        }

        // Check card exists and belongs to user
        const cardResult = await db.query(
            'SELECT id FROM credit_cards WHERE id = $1 AND "userId" = $2',
            [cardId, req.user.id]
        )
        if (cardResult.rows.length === 0) {
            return res.status(404).json({ message: 'Cartão não encontrado' })
        }

        // Check duplicate (same month/year/card)
        const duplicateCheck = await db.query(
            'SELECT id FROM card_invoices WHERE "cardId" = $1 AND "referenceMonth" = $2 AND "referenceYear" = $3',
            [cardId, referenceMonth, referenceYear]
        )
        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ message: 'Fatura já existe para este mês/ano neste cartão' })
        }

        // Insert
        const { rows: [newInvoice] } = await db.query(
            `INSERT INTO card_invoices ("userId", "cardId", "referenceMonth", "referenceYear", "totalAmount", "dueDate", "closingDate")
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [req.user.id, cardId, referenceMonth, referenceYear, Number(totalAmount) || 0, dueDate || null, closingDate || null]
        )

        res.status(201).json(newInvoice)
    } catch (err) {
        // Duas abas criando a mesma fatura ao mesmo tempo: a segunda bate no UNIQUE
        if (err && err.code === '23505') {
            return res.status(409).json({ message: 'Fatura já existe para este mês/ano neste cartão' })
        }
        console.error('Erro ao criar fatura:', err)
        res.status(500).json({ message: 'Erro ao criar fatura' })
    }
})

// GET /api/finance/invoices/:id/items — Get items for an invoice
router.get('/:id/items', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const { id } = req.params

        // Check invoice belongs to user
        const invoiceResult = await db.query(
            'SELECT id FROM card_invoices WHERE id = $1 AND "userId" = $2',
            [id, req.user.id]
        )
        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ message: 'Fatura não encontrada' })
        }

        // Get items with category name
        const { rows } = await db.query(
            `SELECT ii.*, fc.name as "categoryName"
             FROM invoice_items ii
             LEFT JOIN finance_categories fc ON fc.id = ii."categoryId"
             WHERE ii."invoiceId" = $1 AND ii."userId" = $2
             ORDER BY ii."transactionDate" ASC, ii.id ASC`,
            [id, req.user.id]
        )

        res.json(rows)
    } catch (err) {
        console.error('Erro ao buscar itens da fatura:', err)
        res.status(500).json({ message: 'Erro ao buscar itens da fatura' })
    }
})

// PATCH /api/finance/invoices/:id/confirm — Confirm/pay an invoice
router.patch('/:id/confirm', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const { id } = req.params
        const { paidAmount } = req.body

        if (paidAmount !== undefined && paidAmount !== null) {
            const n = Number(paidAmount)
            if (paidAmount === '' || typeof paidAmount === 'boolean' || !Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
                return res.status(400).json({ message: 'Valor pago inválido.' })
            }
        }

        // Check invoice exists and belongs to user
        const invoiceResult = await db.query(
            'SELECT * FROM card_invoices WHERE id = $1 AND "userId" = $2',
            [id, req.user.id]
        )
        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ message: 'Fatura não encontrada' })
        }

        const invoice = invoiceResult.rows[0]
        const finalPaidAmount = paidAmount !== undefined && paidAmount !== null ? Number(paidAmount) : (Number(invoice.totalAmount) || 0)
        const newStatus = finalPaidAmount >= (Number(invoice.totalAmount) || 0) ? 'PAID' : 'PARTIAL'

        const { rows: [updated] } = await db.query(
            `UPDATE card_invoices
             SET status = $1, "paidAmount" = $2, "paidAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $3 AND "userId" = $4
             RETURNING *`,
            [newStatus, finalPaidAmount, id, req.user.id]
        )

        res.json(updated)
    } catch (err) {
        console.error('Erro ao confirmar fatura:', err)
        res.status(500).json({ message: 'Erro ao confirmar fatura' })
    }
})

// GET /api/finance/invoices/:id/dashboard — Dashboard summary for a card
router.get('/:id/dashboard', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const { id } = req.params // invoiceId

        // Get category breakdown for this invoice
        const { rows: categories } = await db.query(
            `SELECT
                COALESCE(fc.name, ii."aiCategory", 'Sem Categoria') as category,
                SUM(ii.amount) as total,
                COUNT(ii.id) as count
             FROM invoice_items ii
             LEFT JOIN finance_categories fc ON fc.id = ii."categoryId"
             WHERE ii."invoiceId" = $1 AND ii."userId" = $2
             GROUP BY COALESCE(fc.name, ii."aiCategory", 'Sem Categoria')
             ORDER BY total DESC`,
            [id, req.user.id]
        )

        // Get invoice summary
        const invoiceResult = await db.query(
            'SELECT * FROM card_invoices WHERE id = $1 AND "userId" = $2',
            [id, req.user.id]
        )

        res.json({
            invoice: invoiceResult.rows[0] || null,
            categories,
            totalItems: categories.reduce((acc, c) => acc + parseInt(c.count), 0),
            totalAmount: categories.reduce((acc, c) => acc + parseFloat(c.total), 0)
        })
    } catch (err) {
        console.error('Erro ao buscar dashboard:', err)
        res.status(500).json({ message: 'Erro ao buscar dados do dashboard' })
    }
})

// DELETE /api/finance/invoices/:id — Delete an invoice (cascade deletes items)
router.delete('/:id', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const { id } = req.params

        // Check invoice exists and belongs to user
        const invoiceResult = await db.query(
            'SELECT id FROM card_invoices WHERE id = $1 AND "userId" = $2',
            [id, req.user.id]
        )
        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ message: 'Fatura não encontrada' })
        }

        // Delete (items cascade via ON DELETE CASCADE)
        await db.query('DELETE FROM card_invoices WHERE id = $1 AND "userId" = $2', [id, req.user.id])

        res.json({ message: 'Fatura excluída com sucesso' })
    } catch (err) {
        console.error('Erro ao excluir fatura:', err)
        res.status(500).json({ message: 'Erro ao excluir fatura' })
    }
})

// =============================================
// === INVOICE ITEMS CRUD ======================
// =============================================

// Dados do cartão e da carteira de uma fatura (para categoria e Extrato)
const INVOICE_CARD_SQL = `
    SELECT ci.id, ci."dueDate" as "invoiceDueDate", c.id as "cardId", c.business_unit_id, b.account_type
    FROM card_invoices ci
    JOIN credit_cards c ON c.id = ci."cardId"
    LEFT JOIN business_units b ON b.id = c.business_unit_id
    WHERE ci.id = $1 AND ci."userId" = $2
`

// POST /api/finance/invoices/:id/items — Add item to invoice
router.post('/:id/items', authMiddleware, cartoesGuard, validateReferenceOwnership, async (req, res) => {
    const problem = itemDataError(req.body, false)
    if (problem) return res.status(400).json({ message: problem })

    try {
        const invoiceId = toId(req.params.id)
        const { transactionDate, categoryId, aiCategory, aiConfidence, installment } = req.body
        const isConfirmed = req.body.isConfirmed === true

        const newItem = await withTransaction(async (client) => {
            // Check invoice exists and belongs to user
            const { rows: [cardInfo] } = await client.query(`${INVOICE_CARD_SQL} FOR UPDATE OF ci`, [invoiceId, req.user.id])
            if (!cardInfo) throw new HttpError(404, 'Fatura não encontrada')

            const { rows: [item] } = await client.query(
                `INSERT INTO invoice_items ("invoiceId", "userId", description, amount, "transactionDate", "categoryId", "aiCategory", "aiConfidence", installment, "isConfirmed")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [invoiceId, req.user.id, req.body.description.trim(), Number(req.body.amount), transactionDate || null,
                    toId(categoryId), typeof aiCategory === 'string' ? aiCategory.slice(0, 80) : null,
                    Number(aiConfidence) || 0, typeof installment === 'string' ? installment.slice(0, 20) : null, isConfirmed]
            )

            // Item lançado à mão já confirmado vai direto para o Extrato
            await syncItemToStatement(client, req.user.id, item, cardInfo)
            await recalcInvoiceTotal(client, invoiceId)
            return item
        })

        res.status(201).json(newItem)
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ message: err.message })
        console.error('Erro ao adicionar item:', err)
        res.status(500).json({ message: 'Erro ao adicionar item à fatura' })
    }
})

// PATCH /api/finance/invoices/items/:itemId — Update an item
router.patch('/items/:itemId', authMiddleware, cartoesGuard, validateReferenceOwnership, async (req, res) => {
    const problem = itemDataError(req.body, true)
    if (problem) return res.status(400).json({ message: problem })

    try {
        const itemId = toId(req.params.itemId)
        const { categoryId, categoryName, isConfirmed, description, amount, transactionDate } = req.body

        const updated = await withTransaction(async (client) => {
            // Check item exists and belongs to user (com os dados do cartão)
            const { rows: [current] } = await client.query(
                `SELECT ii.*, ci."dueDate" as "invoiceDueDate", c.id as "cardId", c.business_unit_id, b.account_type
                 FROM invoice_items ii
                 JOIN card_invoices ci ON ci.id = ii."invoiceId"
                 JOIN credit_cards c ON c.id = ci."cardId"
                 LEFT JOIN business_units b ON b.id = c.business_unit_id
                 WHERE ii.id = $1 AND ii."userId" = $2
                 FOR UPDATE OF ii`,
                [itemId, req.user.id]
            )
            if (!current) throw new HttpError(404, 'Item não encontrado')

            // Resolve categoryName to categoryId (categoria do tipo da carteira do cartão)
            let finalCategoryId = categoryId === undefined ? undefined : (categoryId === null || categoryId === '' ? null : toId(categoryId))
            let finalAiCategory = undefined

            if (categoryName !== undefined) {
                const name = typeof categoryName === 'string' ? categoryName.trim() : ''
                if (name) {
                    const catRes = await client.query(
                        'SELECT id FROM finance_categories WHERE name = $1 AND "userId" = $2 AND type = $3 ORDER BY id LIMIT 1',
                        [name, req.user.id, categoryTypeFor(current.account_type)]
                    )
                    if (catRes.rows.length > 0) {
                        finalCategoryId = catRes.rows[0].id
                    } else {
                        finalCategoryId = null
                        finalAiCategory = name.slice(0, 80) // Fallback to storing as text if not mapped
                    }
                } else {
                    finalCategoryId = null
                }
            }

            // Build dynamic update
            const updates = []
            const values = []
            let paramIdx = 1

            if (finalCategoryId !== undefined) {
                updates.push(`"categoryId" = $${paramIdx++}`)
                values.push(finalCategoryId)
            }
            if (finalAiCategory !== undefined) {
                updates.push(`"aiCategory" = $${paramIdx++}`)
                values.push(finalAiCategory)
            }
            if (isConfirmed !== undefined) {
                updates.push(`"isConfirmed" = $${paramIdx++}`)
                values.push(isConfirmed)
            }
            if (description !== undefined) {
                updates.push(`description = $${paramIdx++}`)
                values.push(description.trim())
            }
            if (amount !== undefined) {
                updates.push(`amount = $${paramIdx++}`)
                values.push(Number(amount))
            }
            if (transactionDate !== undefined) {
                updates.push(`"transactionDate" = $${paramIdx++}`)
                values.push(transactionDate || null)
            }

            if (updates.length === 0) throw new HttpError(400, 'Nenhum campo para atualizar')

            values.push(itemId, req.user.id)
            const { rows: [row] } = await client.query(
                `UPDATE invoice_items SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND "userId" = $${paramIdx} RETURNING *`,
                values
            )

            await syncItemToStatement(client, req.user.id, row, current)
            // Valor mudou: o total da fatura acompanha
            if (amount !== undefined) await recalcInvoiceTotal(client, current.invoiceId)
            return row
        })

        res.json(updated)
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ message: err.message })
        console.error('Erro ao atualizar item:', err)
        res.status(500).json({ message: 'Erro ao atualizar item' })
    }
})

// DELETE /api/finance/invoices/items/:itemId — Delete an item
router.delete('/items/:itemId', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const itemId = toId(req.params.itemId)

        await withTransaction(async (client) => {
            // Check item exists and belongs to user
            const itemResult = await client.query(
                'SELECT * FROM invoice_items WHERE id = $1 AND "userId" = $2 FOR UPDATE',
                [itemId, req.user.id]
            )
            if (itemResult.rows.length === 0) throw new HttpError(404, 'Item não encontrado')

            const invoiceId = itemResult.rows[0].invoiceId

            // A compra sai do Extrato junto com o item
            await client.query('DELETE FROM finance_transactions WHERE invoice_item_id = $1 AND "userId" = $2', [itemId, req.user.id])
            await client.query('DELETE FROM invoice_items WHERE id = $1 AND "userId" = $2', [itemId, req.user.id])
            await recalcInvoiceTotal(client, invoiceId)
        })

        res.json({ message: 'Item excluído com sucesso' })
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ message: err.message })
        console.error('Erro ao excluir item:', err)
        res.status(500).json({ message: 'Erro ao excluir item' })
    }
})

// POST /api/finance/invoices/items/bulk-delete — Bulk delete invoice items
router.post('/items/bulk-delete', authMiddleware, cartoesGuard, async (req, res) => {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Nenhum item selecionado.' })
    }
    if (ids.length > MAX_BULK_IDS) {
        return res.status(400).json({ message: `Selecione até ${MAX_BULK_IDS} itens por vez.` })
    }
    const cleanIds = [...new Set(ids.map(toId))]
    if (cleanIds.some(id => id === null)) {
        return res.status(400).json({ message: 'Seleção de itens inválida.' })
    }
    try {
        const rowCount = await withTransaction(async (client) => {
            // Get invoiceIds for recalculation (before deleting)
            const { rows: affectedItems } = await client.query(
                'SELECT DISTINCT "invoiceId" FROM invoice_items WHERE id = ANY($1::int[]) AND "userId" = $2',
                [cleanIds, req.user.id]
            )

            // Delete linked finance_transactions
            await client.query(
                'DELETE FROM finance_transactions WHERE invoice_item_id = ANY($1::int[]) AND "userId" = $2',
                [cleanIds, req.user.id]
            )

            // Delete invoice items
            const { rowCount: deleted } = await client.query(
                'DELETE FROM invoice_items WHERE id = ANY($1::int[]) AND "userId" = $2',
                [cleanIds, req.user.id]
            )

            // Recalculate totals for affected invoices
            for (const row of affectedItems) {
                await recalcInvoiceTotal(client, row.invoiceId)
            }
            return deleted
        })

        res.json({ message: `${rowCount} item(ns) excluído(s) com sucesso.`, deletedCount: rowCount })
    } catch (err) {
        console.error('Erro ao excluir itens em lote:', err)
        res.status(500).json({ message: 'Erro ao excluir itens.' })
    }
})

// =============================================
// === CARD DASHBOARD DATA =====================
// =============================================

// GET /api/finance/invoices/card/:cardId/summary — Full card dashboard data
router.get('/card/:cardId/summary', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const cardId = toId(req.params.cardId)
        const targetYear = req.query.year === undefined ? new Date().getFullYear() : Number(req.query.year)
        if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
            return res.status(400).json({ message: 'Ano inválido.' })
        }

        // Check card belongs to user (com o tipo da carteira, para as categorias)
        const cardResult = await db.query(
            `SELECT c.*, b.account_type as "walletType", b.name as "walletName"
             FROM credit_cards c
             LEFT JOIN business_units b ON b.id = c.business_unit_id
             WHERE c.id = $1 AND c."userId" = $2`,
            [cardId, req.user.id]
        )
        if (cardResult.rows.length === 0) {
            return res.status(404).json({ message: 'Cartão não encontrado' })
        }

        const card = cardResult.rows[0]

        // Monthly totals (bar chart data)
        const { rows: monthlyTotals } = await db.query(
            `SELECT "referenceMonth", "totalAmount", status, "dueDate"
             FROM card_invoices
             WHERE "cardId" = $1 AND "userId" = $2 AND "referenceYear" = $3
             ORDER BY "referenceMonth" ASC`,
            [cardId, req.user.id, targetYear]
        )

        // Category breakdown (donut chart data) — aggregate across all invoices of the year
        const { rows: categoryBreakdown } = await db.query(
            `SELECT
                COALESCE(fc.name, ii."aiCategory", 'Sem Categoria') as category,
                SUM(ii.amount) as total,
                COUNT(ii.id) as count
             FROM invoice_items ii
             JOIN card_invoices ci ON ci.id = ii."invoiceId"
             LEFT JOIN finance_categories fc ON fc.id = ii."categoryId"
             WHERE ci."cardId" = $1 AND ii."userId" = $2 AND ci."referenceYear" = $3
             GROUP BY COALESCE(fc.name, ii."aiCategory", 'Sem Categoria')
             ORDER BY total DESC`,
            [cardId, req.user.id, targetYear]
        )

        // Total spent this year
        const totalSpent = monthlyTotals.reduce((sum, m) => sum + (parseFloat(m.totalAmount) || 0), 0)
        const creditLimit = Number(card.creditLimit) || 0
        const monthsWithInvoice = monthlyTotals.length

        res.json({
            card,
            year: targetYear,
            monthlyTotals,
            categoryBreakdown,
            totalSpent,
            creditLimit,
            // Média dos meses com fatura em relação ao limite (antes dividia sempre por 12)
            utilizationPercent: creditLimit > 0 && monthsWithInvoice > 0
                ? Math.round((totalSpent / monthsWithInvoice / creditLimit) * 100)
                : null
        })
    } catch (err) {
        console.error('Erro ao buscar resumo do cartão:', err)
        res.status(500).json({ message: 'Erro ao buscar resumo do cartão' })
    }
})

// =============================================
// === INVOICE UPLOAD (GEMINI AI) ==============
// =============================================

// POST /api/finance/invoices/upload — Upload invoice PDF/image for AI parsing
router.post('/upload', authMiddleware, uploadFaturasGuard, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ message: 'Arquivo excede o limite de 10MB' })
            }
            return res.status(400).json({ message: err.message || 'Erro no upload do arquivo' })
        }
        next()
    })
}, async (req, res) => {
    const client = await pool.connect()

    try {
        const { cardId } = req.body

        if (!req.file) {
            return res.status(400).json({ message: 'Nenhum arquivo enviado' })
        }

        if (!cardId) {
            return res.status(400).json({ message: 'cardId é obrigatório' })
        }

        // Check card belongs to user
        const cardResult = await client.query(
            'SELECT * FROM credit_cards WHERE id = $1 AND "userId" = $2',
            [cardId, req.user.id]
        )
        if (cardResult.rows.length === 0) {
            client.release()
            return res.status(404).json({ message: 'Cartão não encontrado' })
        }

        // Get user categories for prompt context (PF only since card is personal)
        const { rows: userCategories } = await client.query(
            'SELECT name FROM finance_categories WHERE "userId" = $1 AND type = $2',
            [req.user.id, 'DESPESA_PESSOAL']
        )
        const categoryNames = userCategories.map(c => c.name)

        // Determine file type
        const fileType = req.file.mimetype === 'application/pdf' ? 'PDF' : 'IMAGE'

        // Record upload attempt
        const { rows: [uploadRecord] } = await client.query(
            `INSERT INTO invoice_uploads ("userId", "cardId", "fileType", "fileSize", "originalName", status)
             VALUES ($1, $2, $3, $4, $5, 'PROCESSING')
             RETURNING id`,
            [req.user.id, cardId, fileType, req.file.size, req.file.originalname]
        )

        let aiResult
        try {
            // Call Gemini API
            aiResult = await parseInvoice(req.file.buffer, req.file.mimetype, categoryNames)
        } catch (aiErr) {
            // Update upload status to FAILED
            await client.query(
                `UPDATE invoice_uploads SET status = 'FAILED', "errorMessage" = $1, "processedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
                [aiErr.message, uploadRecord.id]
            )
            client.release()
            return res.status(503).json({
                message: `Erro ao processar fatura via IA: ${aiErr.message}`,
                error: aiErr.message,
                uploadId: uploadRecord.id
            })
        }

        // Begin SQL transaction for invoice + items creation
        await client.query('BEGIN')

        try {
            const meta = aiResult.metadata
            let refMonth = meta.referenceMonth
            let refYear = meta.referenceYear

            // Priority: In Brazilian credit cards, invoice reference month and year ALWAYS match dueDate
            if (meta.dueDate && typeof meta.dueDate === 'string') {
                const parts = meta.dueDate.split('-')
                if (parts.length === 3) {
                    const dueYear = parseInt(parts[0], 10)
                    const dueMonth = parseInt(parts[1], 10)
                    if (!isNaN(dueYear) && !isNaN(dueMonth) && dueMonth >= 1 && dueMonth <= 12) {
                        refMonth = dueMonth
                        refYear = dueYear
                        meta.referenceMonth = refMonth
                        meta.referenceYear = refYear
                    }
                }
            }

            if (!refMonth) refMonth = new Date().getMonth() + 1
            if (!refYear) refYear = new Date().getFullYear()

            // Check for duplicate invoice
            const dupCheck = await client.query(
                'SELECT id FROM card_invoices WHERE "cardId" = $1 AND "referenceMonth" = $2 AND "referenceYear" = $3',
                [cardId, refMonth, refYear]
            )

            let invoiceId
            if (dupCheck.rows.length > 0) {
                // Use existing invoice
                invoiceId = dupCheck.rows[0].id

                // CRITICAL FIX: Delete any previous unconfirmed items for this invoice
                // so we don't duplicate items if user uploads the same invoice again
                await client.query(
                    'DELETE FROM invoice_items WHERE "invoiceId" = $1 AND "isConfirmed" = FALSE',
                    [invoiceId]
                )
            } else {
                // Create new invoice
                const { rows: [newInv] } = await client.query(
                    `INSERT INTO card_invoices ("userId", "cardId", "referenceMonth", "referenceYear", "totalAmount", "dueDate", "closingDate", status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
                     RETURNING id`,
                    [req.user.id, cardId, refMonth, refYear, meta.totalAmount || 0, meta.dueDate || null, meta.closingDate || null]
                )
                invoiceId = newInv.id
            }

            // Insert all items
            const insertedItems = []
            for (const item of aiResult.items) {
                const { rows: [inserted] } = await client.query(
                    `INSERT INTO invoice_items ("invoiceId", "userId", description, amount, "transactionDate", "aiCategory", "aiConfidence", installment, "isConfirmed")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
                     RETURNING *`,
                    [invoiceId, req.user.id, item.description, item.amount, item.transactionDate, item.category, item.confidence, item.installment]
                )
                insertedItems.push(inserted)
            }

            // Recalculate invoice total
            const { rows: [totals] } = await client.query(
                'SELECT COALESCE(SUM(amount), 0) as "totalAmount" FROM invoice_items WHERE "invoiceId" = $1',
                [invoiceId]
            )
            await client.query(
                'UPDATE card_invoices SET "totalAmount" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
                [totals.totalAmount, invoiceId]
            )

            await client.query('COMMIT')

            // Update upload record
            await client.query(
                `UPDATE invoice_uploads SET status = 'REVIEW', "invoiceId" = $1, "aiRawResponse" = $2, "processedAt" = CURRENT_TIMESTAMP WHERE id = $3`,
                [invoiceId, JSON.stringify(aiResult), uploadRecord.id]
            )

            res.status(201).json({
                message: 'Fatura processada com sucesso. Revise os itens antes de confirmar.',
                uploadId: uploadRecord.id,
                invoiceId,
                metadata: aiResult.metadata,
                items: insertedItems,
                totalItems: insertedItems.length,
                totalAmount: parseFloat(totals.totalAmount)
            })
        } catch (txErr) {
            await client.query('ROLLBACK')
            // Update upload status
            await client.query(
                `UPDATE invoice_uploads SET status = 'FAILED', "errorMessage" = $1, "processedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
                [txErr.message, uploadRecord.id]
            )
            throw txErr
        }
    } catch (err) {
        console.error('Erro no upload de fatura:', err)
        res.status(500).json({ message: 'Erro interno ao processar upload' })
    } finally {
        client.release()
    }
})

// GET /api/finance/invoices/dashboard-summary — Consolidated cards summary for main dashboard
router.get('/dashboard-summary', authMiddleware, cartoesGuard, async (req, res) => {
    try {
        const currentDate = new Date()
        const currentMonth = currentDate.getMonth() + 1
        const currentYear = currentDate.getFullYear()

        let nextMonth = currentMonth + 1
        let nextYear = currentYear
        if (nextMonth > 12) {
            nextMonth = 1
            nextYear = currentYear + 1
        }

        const query = `
            SELECT 
                c.id, 
                c.name, 
                c."lastFour", 
                c.brand, 
                c."closingDay", 
                c."dueDate", 
                c."imageUrl",
                b.account_type as "walletType",
                COALESCE(act."totalAmount", 0) as "currentMonthTotal",
                COALESCE(act.status, 'PAID') as "currentMonthStatus",
                COALESCE(nx."totalAmount", 0) as "nextMonthTotal"
            FROM credit_cards c
            LEFT JOIN business_units b ON c.business_unit_id = b.id
            LEFT JOIN LATERAL (
                SELECT "totalAmount", status, "referenceMonth", "referenceYear"
                FROM card_invoices
                WHERE "cardId" = c.id AND status != 'CANCELLED'
                ORDER BY 
                    CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END ASC,
                    CASE WHEN status = 'PENDING' THEN "referenceYear" END ASC, 
                    CASE WHEN status = 'PENDING' THEN "referenceMonth" END ASC,
                    "referenceYear" DESC,
                    "referenceMonth" DESC
                LIMIT 1
            ) act ON true
            LEFT JOIN LATERAL (
                SELECT "totalAmount"
                FROM card_invoices
                WHERE "cardId" = c.id AND status != 'CANCELLED'
                  AND ("referenceYear" > act."referenceYear" OR ("referenceYear" = act."referenceYear" AND "referenceMonth" > act."referenceMonth"))
                ORDER BY "referenceYear" ASC, "referenceMonth" ASC
                LIMIT 1
            ) nx ON true
            WHERE c."userId" = $1
            ORDER BY c.name ASC
        `
        const { rows } = await db.query(query, [req.user.id])

        const summary = {
            totalCurrentMonth: rows.reduce((acc, card) => acc + parseFloat(card.currentMonthTotal), 0),
            totalNextMonth: rows.reduce((acc, card) => acc + parseFloat(card.nextMonthTotal), 0),
            cards: rows
        }

        // === CONSOLIDATED DATA (additive, only when requested) ===
        if (req.query.consolidated === 'true') {
            const targetYear = parseInt(req.query.year) || currentYear

            // 1. Monthly totals per card (stacked data)
            const { rows: monthlyRows } = await db.query(
                `SELECT ci."referenceMonth" as month,
                        COALESCE(SUM(ci."totalAmount"), 0) as total,
                        c.name as "cardName",
                        COALESCE(SUM(ci."totalAmount"), 0) as "cardTotal"
                 FROM card_invoices ci
                 JOIN credit_cards c ON c.id = ci."cardId"
                 WHERE ci."userId" = $1 AND ci."referenceYear" = $2
                 GROUP BY ci."referenceMonth", c.name
                 ORDER BY ci."referenceMonth" ASC`,
                [req.user.id, targetYear]
            )

            // Build monthlyTotals with byCard breakdown
            const monthlyMap = new Map()
            for (const r of monthlyRows) {
                const month = parseInt(r.month)
                if (!monthlyMap.has(month)) {
                    monthlyMap.set(month, { month, total: 0, byCard: {} })
                }
                const entry = monthlyMap.get(month)
                const cardTotal = parseFloat(r.cardTotal) || 0
                entry.byCard[r.cardName] = cardTotal
                entry.total += cardTotal
            }
            const monthlyTotals = Array.from(monthlyMap.values()).sort((a, b) => a.month - b.month)

            // 2. Category breakdown across ALL cards
            const { rows: categoryRows } = await db.query(
                `SELECT 
                    COALESCE(fc.name, ii."aiCategory", 'Sem Categoria') as category,
                    SUM(ii.amount) as total,
                    COUNT(ii.id) as count
                 FROM invoice_items ii
                 JOIN card_invoices ci ON ci.id = ii."invoiceId"
                 LEFT JOIN finance_categories fc ON fc.id = ii."categoryId"
                 WHERE ii."userId" = $1 AND ci."referenceYear" = $2
                 GROUP BY COALESCE(fc.name, ii."aiCategory", 'Sem Categoria')
                 ORDER BY total DESC`,
                [req.user.id, targetYear]
            )

            // 3. Card breakdown (total per card for the year)
            const { rows: cardRows } = await db.query(
                `SELECT c.id as "cardId", c.name,
                        COALESCE(SUM(ci."totalAmount"), 0) as total
                 FROM credit_cards c
                 LEFT JOIN card_invoices ci ON ci."cardId" = c.id AND ci."referenceYear" = $2
                 WHERE c."userId" = $1
                 GROUP BY c.id, c.name
                 ORDER BY total DESC`,
                [req.user.id, targetYear]
            )

            const totalSpent = cardRows.reduce((sum, c) => sum + (parseFloat(c.total) || 0), 0)

            summary.consolidated = {
                year: targetYear,
                totalSpent,
                monthlyTotals,
                categoryBreakdown: categoryRows.map(r => ({
                    category: r.category,
                    total: parseFloat(r.total) || 0,
                    count: parseInt(r.count) || 0
                })),
                cardBreakdown: cardRows.map(r => ({
                    cardId: parseInt(r.cardId),
                    name: r.name,
                    total: parseFloat(r.total) || 0
                }))
            }
        }

        res.json(summary)
    } catch (err) {
        console.error('Erro ao buscar resumo de cartões para dashboard:', err)
        res.status(500).json({ message: 'Erro ao buscar resumo de cartões' })
    }
})

module.exports = router
