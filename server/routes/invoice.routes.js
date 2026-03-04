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
const { ouroOnly } = require('../middleware/ouroGuard')
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
// === INVOICES CRUD ===========================
// =============================================

// GET /api/finance/invoices — List invoices (optionally filtered by cardId)
router.get('/', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { cardId, year } = req.query
        let query = `
            SELECT ci.*, cc.name as "cardName", cc.brand as "cardBrand"
            FROM card_invoices ci
            JOIN credit_cards cc ON cc.id = ci."cardId"
            WHERE ci."userId" = $1
        `
        const params = [req.user.id]

        if (cardId) {
            params.push(cardId)
            query += ` AND ci."cardId" = $${params.length}`
        }

        if (year) {
            params.push(year)
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
router.post('/', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { cardId, referenceMonth, referenceYear, totalAmount, dueDate, closingDate } = req.body

        // Validate totalAmount
        if (totalAmount !== undefined && totalAmount < 0) {
            return res.status(400).json({ message: 'O valor total não pode ser negativo' })
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
            [req.user.id, cardId, referenceMonth, referenceYear, totalAmount || 0, dueDate || null, closingDate || null]
        )

        res.status(201).json(newInvoice)
    } catch (err) {
        console.error('Erro ao criar fatura:', err)
        res.status(500).json({ message: 'Erro ao criar fatura' })
    }
})

// GET /api/finance/invoices/:id/items — Get items for an invoice
router.get('/:id/items', authMiddleware, ouroOnly, async (req, res) => {
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

// DELETE /api/finance/invoices/:id — Delete an entire invoice (and cascade items)
router.delete('/:id', authMiddleware, ouroOnly, async (req, res) => {
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

        // Delete invoice (items will cascade if foreign key is setup with ON DELETE CASCADE, which is true in db.js)
        await db.query('DELETE FROM card_invoices WHERE id = $1', [id])

        res.json({ message: 'Fatura excluída com sucesso' })
    } catch (err) {
        console.error('Erro ao excluir fatura:', err)
        res.status(500).json({ message: 'Erro ao excluir fatura' })
    }
})

// PATCH /api/finance/invoices/:id/confirm — Confirm/pay an invoice
router.patch('/:id/confirm', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { id } = req.params
        const { paidAmount } = req.body

        // Check invoice exists and belongs to user
        const invoiceResult = await db.query(
            'SELECT * FROM card_invoices WHERE id = $1 AND "userId" = $2',
            [id, req.user.id]
        )
        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ message: 'Fatura não encontrada' })
        }

        const invoice = invoiceResult.rows[0]
        const finalPaidAmount = paidAmount !== undefined ? paidAmount : invoice.totalAmount
        const newStatus = finalPaidAmount >= invoice.totalAmount ? 'PAID' : 'PARTIAL'

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
router.get('/:id/dashboard', authMiddleware, ouroOnly, async (req, res) => {
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
router.delete('/:id', authMiddleware, ouroOnly, async (req, res) => {
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

// POST /api/finance/invoices/:id/items — Add item to invoice
router.post('/:id/items', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { id: invoiceId } = req.params
        const { description, amount, transactionDate, categoryId, aiCategory, aiConfidence, installment } = req.body

        // Check invoice exists and belongs to user
        const invoiceResult = await db.query(
            'SELECT id FROM card_invoices WHERE id = $1 AND "userId" = $2',
            [invoiceId, req.user.id]
        )
        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ message: 'Fatura não encontrada' })
        }

        // Insert item
        const { rows: [newItem] } = await db.query(
            `INSERT INTO invoice_items ("invoiceId", "userId", description, amount, "transactionDate", "categoryId", "aiCategory", "aiConfidence", installment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [invoiceId, req.user.id, description, amount, transactionDate || null, categoryId || null, aiCategory || null, aiConfidence || 0, installment || null]
        )

        // Recalculate invoice totalAmount
        const { rows: [totals] } = await db.query(
            'SELECT COALESCE(SUM(amount), 0) as "totalAmount" FROM invoice_items WHERE "invoiceId" = $1',
            [invoiceId]
        )
        await db.query(
            'UPDATE card_invoices SET "totalAmount" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
            [totals.totalAmount, invoiceId]
        )

        res.status(201).json(newItem)
    } catch (err) {
        console.error('Erro ao adicionar item:', err)
        res.status(500).json({ message: 'Erro ao adicionar item à fatura' })
    }
})

// PATCH /api/finance/invoices/items/:itemId — Update an item
router.patch('/items/:itemId', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { itemId } = req.params
        const { categoryId, categoryName, isConfirmed, description, amount } = req.body

        // Check item exists and belongs to user
        const itemResult = await db.query(
            'SELECT * FROM invoice_items WHERE id = $1 AND "userId" = $2',
            [itemId, req.user.id]
        )
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ message: 'Item não encontrado' })
        }

        // Resolve categoryName to categoryId
        let finalCategoryId = categoryId
        let finalAiCategory = undefined

        if (categoryName !== undefined) {
            if (categoryName) {
                const catRes = await db.query(
                    'SELECT id FROM finance_categories WHERE name = $1 AND "userId" = $2 AND type = $3',
                    [categoryName, req.user.id, 'DESPESA_PESSOAL']
                )
                if (catRes.rows.length > 0) {
                    finalCategoryId = catRes.rows[0].id
                } else {
                    finalCategoryId = null
                    finalAiCategory = categoryName // Fallback to storing as text if not mapped
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
            values.push(description)
        }
        if (amount !== undefined) {
            updates.push(`amount = $${paramIdx++}`)
            values.push(amount)
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'Nenhum campo para atualizar' })
        }

        values.push(itemId, req.user.id)
        const query = `UPDATE invoice_items SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND "userId" = $${paramIdx} RETURNING *`

        const { rows: [updated] } = await db.query(query, values)

        // --- SYNCHRONIZATION WITH FINANCE_TRANSACTIONS ---
        if (updated.isConfirmed) {
            const cardInfoRes = await db.query(
                `SELECT c.id as "cardId", c.business_unit_id, b.account_type 
                 FROM invoice_items ii
                 JOIN card_invoices ci ON ci.id = ii."invoiceId"
                 JOIN credit_cards c ON c.id = ci."cardId"
                 LEFT JOIN business_units b ON b.id = c.business_unit_id
                 WHERE ii.id = $1`, [itemId]
            )

            const cardInfo = cardInfoRes?.rows?.[0]

            if (cardInfo && cardInfo.business_unit_id) {
                const targetType = cardInfo.account_type === 'PJ' ? 'BUSINESS' : 'PERSONAL'
                const transactionDate = updated.transactionDate || new Date()

                const existCheck = await db.query('SELECT id FROM finance_transactions WHERE invoice_item_id = $1', [itemId])

                if (existCheck.rows.length > 0) {
                    await db.query(`
                        UPDATE finance_transactions 
                        SET amount = $1, date = $2, "categoryId" = $3, description = $4, "business_unit_id" = $5, target = $6
                        WHERE invoice_item_id = $7
                     `, [updated.amount, transactionDate, updated.categoryId, updated.description, cardInfo.business_unit_id, targetType, itemId])
                } else {
                    await db.query(`
                        INSERT INTO finance_transactions 
                        ("userId", type, target, amount, date, "categoryId", "paymentMethod", "cardId", description, status, "business_unit_id", "invoice_item_id")
                        VALUES ($1, 'DESPESA', $2, $3, $4, $5, 'Cartão de Crédito', $6, $7, 'PAID', $8, $9)
                    `, [req.user.id, targetType, updated.amount, transactionDate, updated.categoryId, cardInfo.cardId, updated.description, cardInfo.business_unit_id, itemId])
                }
            }
        } else {
            await db.query('DELETE FROM finance_transactions WHERE invoice_item_id = $1', [itemId])
        }

        res.json(updated)
    } catch (err) {
        console.error('Erro ao atualizar item:', err)
        res.status(500).json({ message: 'Erro ao atualizar item' })
    }
})

// DELETE /api/finance/invoices/items/:itemId — Delete an item
router.delete('/items/:itemId', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { itemId } = req.params

        // Check item exists and belongs to user
        const itemResult = await db.query(
            'SELECT * FROM invoice_items WHERE id = $1 AND "userId" = $2',
            [itemId, req.user.id]
        )
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ message: 'Item não encontrado' })
        }

        const invoiceId = itemResult.rows[0].invoiceId

        // Delete item
        await db.query('DELETE FROM invoice_items WHERE id = $1 AND "userId" = $2', [itemId, req.user.id])

        // Recalculate invoice totalAmount
        const { rows: [totals] } = await db.query(
            'SELECT COALESCE(SUM(amount), 0) as "totalAmount" FROM invoice_items WHERE "invoiceId" = $1',
            [invoiceId]
        )
        await db.query(
            'UPDATE card_invoices SET "totalAmount" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
            [totals.totalAmount, invoiceId]
        )

        res.json({ message: 'Item excluído com sucesso' })
    } catch (err) {
        console.error('Erro ao excluir item:', err)
        res.status(500).json({ message: 'Erro ao excluir item' })
    }
})

// =============================================
// === CARD DASHBOARD DATA =====================
// =============================================

// GET /api/finance/invoices/card/:cardId/summary — Full card dashboard data
router.get('/card/:cardId/summary', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { cardId } = req.params
        const { year } = req.query
        const targetYear = year || new Date().getFullYear()

        // Check card belongs to user
        const cardResult = await db.query(
            'SELECT * FROM credit_cards WHERE id = $1 AND "userId" = $2',
            [cardId, req.user.id]
        )
        if (cardResult.rows.length === 0) {
            return res.status(404).json({ message: 'Cartão não encontrado' })
        }

        const card = cardResult.rows[0]

        // Monthly totals (bar chart data)
        const { rows: monthlyTotals } = await db.query(
            `SELECT "referenceMonth", "totalAmount", status
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

        res.json({
            card,
            year: targetYear,
            monthlyTotals,
            categoryBreakdown,
            totalSpent,
            creditLimit: card.creditLimit || 0,
            utilizationPercent: card.creditLimit > 0
                ? Math.round((totalSpent / 12 / card.creditLimit) * 100)
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
router.post('/upload', authMiddleware, ouroOnly, (req, res, next) => {
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
            const refMonth = meta.referenceMonth || new Date().getMonth() + 1
            const refYear = meta.referenceYear || new Date().getFullYear()

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
router.get('/dashboard-summary', authMiddleware, ouroOnly, async (req, res) => {
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

        res.json(summary)
    } catch (err) {
        console.error('Erro ao buscar resumo de cartões para dashboard:', err)
        res.status(500).json({ message: 'Erro ao buscar resumo de cartões' })
    }
})

module.exports = router
