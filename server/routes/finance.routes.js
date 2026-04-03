const express = require('express')
const router = express.Router()
const { db, pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { validateWalletOwnership } = require('../middleware/walletSecurity')
const { calculateBillingDate } = require('../utils/billingDate')

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

router.post('/categories', authMiddleware, async (req, res) => {
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

router.patch('/categories/:id', authMiddleware, async (req, res) => {
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

router.delete('/categories/:id', authMiddleware, async (req, res) => {
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
            `SELECT c.*, b.name as "walletName", b."account_type" as "walletType"
             FROM credit_cards c
             LEFT JOIN business_units b ON c.business_unit_id = b.id
             WHERE c."userId" = $1 ORDER BY c.name ASC`,
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar cartões' })
    }
})

router.post('/cards', authMiddleware, ouroOnly, async (req, res) => {
    const { name, lastFour, brand, closingDay, dueDate, imageUrl, business_unit_id } = req.body
    try {
        const { rows: [newCard] } = await db.query(
            'INSERT INTO credit_cards ("userId", name, "lastFour", brand, "closingDay", "dueDate", "imageUrl", business_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [req.user.id, name, lastFour, brand, closingDay, dueDate, imageUrl, business_unit_id || null]
        )
        res.json(newCard)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao criar cartão' })
    }
})

router.patch('/cards/:id', authMiddleware, ouroOnly, async (req, res) => {
    const { id } = req.params
    const { name, lastFour, brand, closingDay, dueDate, imageUrl, business_unit_id } = req.body
    try {
        const { rows: [updated] } = await db.query(
            `UPDATE credit_cards SET
                name = COALESCE($3, name),
                "lastFour" = COALESCE($4, "lastFour"),
                brand = COALESCE($5, brand),
                "closingDay" = COALESCE($6, "closingDay"),
                "dueDate" = COALESCE($7, "dueDate"),
                "imageUrl" = COALESCE($8, "imageUrl"),
                business_unit_id = $9
            WHERE id = $1 AND "userId" = $2 RETURNING *`,
            [id, req.user.id, name, lastFour, brand, closingDay, dueDate, imageUrl, business_unit_id || null]
        )
        if (!updated) return res.status(404).json({ message: 'Cartão não encontrado' })
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao atualizar cartão' })
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
// [REMOVED] Deprecated in favor of 'finance_transactions' with status=PENDING

// --- TRANSACTIONS ---

router.get('/transactions', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 15, walletId, type, search, startDate, endDate } = req.query

        const offset = (page - 1) * limit
        const params = [req.user.id]
        let query = `
            SELECT t.*, c.name as "categoryName", cr.name as "cardName" 
            FROM finance_transactions t 
            LEFT JOIN finance_categories c ON t."categoryId" = c.id 
            LEFT JOIN credit_cards cr ON t."cardId" = cr.id
            WHERE t."userId" = $1
        `

        // Dynamic Filtering
        if (walletId && walletId !== 'ALL') {
            params.push(parseInt(walletId))
            query += ` AND t."business_unit_id" = $${params.length}`
        }

        if (type && type !== 'ALL') {
            params.push(type)
            query += ` AND t.type = $${params.length}`
        }

        // New Category Filter
        if (req.query.categoryId && req.query.categoryId !== 'ALL') {
            params.push(req.query.categoryId)
            query += ` AND t."categoryId" = $${params.length}`
        }

        if (search) {
            params.push(`%${search}%`)
            query += ` AND (t.description ILIKE $${params.length} OR c.name ILIKE $${params.length})` // Case-insensitive
        }

        if (startDate) {
            params.push(startDate)
            query += ` AND t."billing_date" >= $${params.length}`
        }

        if (endDate) {
            params.push(endDate)
            query += ` AND t."billing_date" <= $${params.length}`
        }

        // Count Total (for pagination metadata)
        // We use a separate query to count the total filtered records
        // Simple regex replace to get count query might be fragile, but effective here
        const countQueryStr = `SELECT COUNT(*) FROM (` + query + `) as filtered_data`
        const countRes = await db.query(countQueryStr, params)
        const totalCount = parseInt(countRes.rows[0].count)

        // Pagination
        query += ` ORDER BY t."billing_date" DESC, t.date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
        params.push(limit, offset)

        const { rows } = await db.query(query, params)

        res.json({
            data: rows,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: Number(page)
        })

    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar transações' })
    }
})

router.post('/transactions', authMiddleware, ouroOnly, validateWalletOwnership, async (req, res) => {
    let { type, target, amount, date, categoryId, paymentMethod, cardId, description, isRecurring, isSubscription, dueDate, business_unit_id } = req.body

    // Normalize empty strings to null for ID and date columns
    const finalCategoryId = categoryId === '' || categoryId === null ? null : categoryId
    const finalCardId = (paymentMethod === 'Cartão de Crédito' && cardId !== '' && cardId !== null) ? cardId : null
    const finalDueDate = dueDate === '' || dueDate === null ? null : dueDate
    const finalBusinessUnitId = business_unit_id === '' || business_unit_id === null ? null : business_unit_id

    // If it's a Boleto, it starts as PENDING
    const status = paymentMethod === 'Boleto' ? 'PENDING' : 'PAID'

    try {
        // Calculate billing_date based on payment method
        let billingDate = date // Default: same as purchase date

        if (paymentMethod === 'Cartão de Crédito' && finalCardId) {
            // Fetch card's closing and due day to calculate billing_date
            const { rows: cardRows } = await db.query(
                'SELECT "closingDay", "dueDate" FROM credit_cards WHERE id = $1',
                [finalCardId]
            )
            if (cardRows.length > 0 && cardRows[0].closingDay && cardRows[0].dueDate) {
                billingDate = calculateBillingDate(date, cardRows[0].closingDay, cardRows[0].dueDate)
            }
        }

        const { rows: [newTransaction] } = await db.query(
            `INSERT INTO finance_transactions 
            ("userId", type, target, amount, date, "categoryId", "paymentMethod", "cardId", description, "isRecurring", "isSubscription", status, "dueDate", "business_unit_id", "billing_date") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
            [req.user.id, type, target, amount, date, finalCategoryId, paymentMethod, finalCardId, description, isRecurring, isSubscription, status, finalDueDate, finalBusinessUnitId, billingDate]
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
        const { business_unit_id } = req.body || {}
        // Update status to PAID, date to current timestamp, billing_date to current date, and optionally assign wallet
        let query = 'UPDATE finance_transactions SET status = \'PAID\', date = CURRENT_TIMESTAMP, "billing_date" = CURRENT_DATE'
        const params = [req.params.id, req.user.id]
        if (business_unit_id) {
            params.push(parseInt(business_unit_id))
            query += `, business_unit_id = $${params.length}`
        }
        query += ' WHERE id = $1 AND "userId" = $2 RETURNING *'
        const { rows: [updated] } = await db.query(query, params)
        if (!updated) return res.status(404).json({ message: 'Transação não encontrada' })
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao confirmar pagamento' })
    }
})

// Get bills due today AND overdue (for alerts)
router.get('/transactions/due-today', authMiddleware, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT t.*, c.name as "categoryName",
                    CASE 
                        WHEN DATE(t."dueDate") < CURRENT_DATE THEN 'OVERDUE'
                        ELSE 'DUE_TODAY'
                    END as "alertType"
             FROM finance_transactions t 
             LEFT JOIN finance_categories c ON t."categoryId" = c.id 
             WHERE t."userId" = $1 
             AND t.status = 'PENDING' 
             AND DATE(t."dueDate") <= CURRENT_DATE 
             ORDER BY t."dueDate" ASC`,
            [req.user.id]
        )
        res.json(rows)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar contas pendentes' })
    }
})

// Update a transaction
// Update a transaction (supports partial updates)
router.patch('/transactions/:id', authMiddleware, ouroOnly, validateWalletOwnership, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const allowedUpdates = [
        'type', 'target', 'amount', 'date', 'categoryId',
        'paymentMethod', 'cardId', 'description', 'isRecurring',
        'isSubscription', 'dueDate', 'business_unit_id'
    ];

    try {
        // Filter out invalid updates
        const keys = Object.keys(updates).filter(key => allowedUpdates.includes(key));

        if (keys.length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização' });
        }

        // Build dynamic query
        const setClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(', ');
        const values = keys.map(key => {
            let value = updates[key];
            if (value === '') value = null; // Normalize empty strings
            return value;
        });

        // Add ID and UserId to values array
        values.push(id, req.user.id);

        const query = `
            UPDATE finance_transactions 
            SET ${setClause}
            WHERE id = $${keys.length + 1} AND "userId" = $${keys.length + 2}
            RETURNING *
        `;

        const { rows: [updated] } = await db.query(query, values);

        if (!updated) return res.status(404).json({ message: 'Transação não encontrada' });

        // Recalculate billing_date if date, paymentMethod, or cardId changed
        const needsBillingRecalc = keys.includes('date') || keys.includes('paymentMethod') || keys.includes('cardId');
        if (needsBillingRecalc) {
            const txDate = updated.date;
            const txPaymentMethod = updated.paymentMethod;
            const txCardId = updated.cardId;

            let newBillingDate = txDate; // Default: same as transaction date

            if (txPaymentMethod === 'Cartão de Crédito' && txCardId) {
                const { rows: cardRows } = await db.query(
                    'SELECT "closingDay", "dueDate" FROM credit_cards WHERE id = $1',
                    [txCardId]
                );
                if (cardRows.length > 0 && cardRows[0].closingDay && cardRows[0].dueDate) {
                    newBillingDate = calculateBillingDate(txDate, cardRows[0].closingDay, cardRows[0].dueDate);
                }
            }

            await db.query(
                'UPDATE finance_transactions SET "billing_date" = $1 WHERE id = $2',
                [newBillingDate, id]
            );
            updated.billing_date = newBillingDate;
        }

        res.json(updated);
    } catch (err) {
        console.error('Erro ao atualizar transação:', err);
        res.status(500).json({ message: 'Erro ao atualizar transação' });
    }
});

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

// Bulk delete transactions
router.post('/transactions/bulk-delete', authMiddleware, ouroOnly, async (req, res) => {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Nenhuma transação selecionada.' })
    }
    try {
        const { rowCount } = await db.query(
            'DELETE FROM finance_transactions WHERE id = ANY($1::int[]) AND "userId" = $2',
            [ids, req.user.id]
        )
        res.json({ message: `${rowCount} transação(ões) excluída(s) com sucesso.`, deletedCount: rowCount })
    } catch (err) {
        console.error('Erro ao excluir transações em lote:', err)
        res.status(500).json({ message: 'Erro ao excluir transações.' })
    }
})

// Get monthly cash flow stats for charts (last 6 months)
router.get('/stats/cash-flow', authMiddleware, async (req, res) => {
    try {
        const { year } = req.query;
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        const params = [req.user.id, targetYear];

        const query = `
            WITH months AS (
                SELECT generate_series(
                    make_date($2, 1, 1),
                    make_date($2, 12, 1),
                    '1 month'::interval
                )::date as month_date
            )
            SELECT 
                TO_CHAR(m.month_date, 'Mon') as name,
                COALESCE(SUM(CASE WHEN t.type = 'RECEITA' THEN t.amount ELSE 0 END), 0) as entrada,
                COALESCE(SUM(CASE WHEN t.type = 'DESPESA' THEN t.amount ELSE 0 END), 0) as saida
            FROM months m
            LEFT JOIN finance_transactions t ON 
                date_trunc('month', t."billing_date") = m.month_date AND 
                t."userId" = $1 AND 
                t.status = 'PAID'
            GROUP BY m.month_date
            ORDER BY m.month_date ASC
        `;
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Erro ao buscar estatísticas de fluxo de caixa:', err);
        res.status(500).json({ message: 'Erro ao buscar dados do gráfico' });
    }
});

// --- TRANSFERS ---

router.post('/transfers', authMiddleware, ouroOnly, validateWalletOwnership, async (req, res) => {
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
            ("userId", type, target, amount, date, "business_unit_id", description, "paymentMethod", status, "billing_date") 
            VALUES ($1, 'DESPESA', 'BUSINESS', $2, $3, $4, $5, 'Transferência', 'PAID', $3)`,
            [req.user.id, amount, date, sourceWalletId, `Transferência para carteira #${targetWalletId} - ${description || ''}`]
        );

        // 2. Create Income in Target Wallet
        await client.query(
            `INSERT INTO finance_transactions 
            ("userId", type, target, amount, date, "business_unit_id", description, "paymentMethod", status, "billing_date") 
            VALUES ($1, 'RECEITA', 'BUSINESS', $2, $3, $4, $5, 'Transferência', 'PAID', $3)`,
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

// Get spending/revenue breakdown by wallet
router.get('/stats/wallet-breakdown', authMiddleware, async (req, res) => {
    try {
        const { type, startDate, endDate } = req.query;
        const txType = type === 'RECEITA' ? 'RECEITA' : 'DESPESA';
        const params = [req.user.id, txType];

        let dateFilter = '';
        if (startDate) {
            params.push(startDate);
            dateFilter += ` AND t."billing_date" >= $${params.length}::date`;
        }
        if (endDate) {
            params.push(endDate);
            dateFilter += ` AND t."billing_date" <= $${params.length}::date`;
        }

        const query = `
            SELECT 
                b.id,
                b.name,
                b.account_type,
                b.logo_url,
                COALESCE(SUM(t.amount), 0) as total
            FROM business_units b
            LEFT JOIN finance_transactions t ON 
                t.business_unit_id = b.id AND 
                t."userId" = $1 AND 
                t.type = $2 AND 
                t.status = 'PAID'${dateFilter}
            WHERE b."ownerId" = $1
            GROUP BY b.id, b.name, b.account_type, b.logo_url
            ORDER BY total DESC
        `;
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Erro ao buscar breakdown por carteira:', err);
        res.status(500).json({ message: 'Erro ao buscar dados por carteira' });
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
