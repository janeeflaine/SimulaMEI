const express = require('express')
const router = express.Router()
const { db, pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { validateWalletOwnership, validateReferenceOwnership } = require('../middleware/walletSecurity')
const { calculateBillingDate } = require('../utils/billingDate')
const { isValidCpf, isValidCnpj, formatCpf, formatCnpj } = require('../utils/brDocument')
const { featureGuard } = require('../middleware/planGuard')
const cartoesGuard = featureGuard('cartoes')
const transferenciasGuard = featureGuard('transferencias', 2)

// Valor de lançamento/transferência: número maior que zero
const isValidAmount = (value) => {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') return false
    const n = Number(value)
    return Number.isFinite(n) && n > 0
}

const WALLET_TYPES = ['PF', 'PJ']
const normalizeAccountType = (value) => String(value || 'PF').trim().toUpperCase()

// Limites de carteira do plano: total, PF e PJ (0 = ilimitado)
const getWalletLimits = async (planId) => {
    const [totalRow, pfRow, pjRow] = await Promise.all([
        pool.query('SELECT value FROM system_settings WHERE key = $1', [`wallet_limit_${planId}`]),
        pool.query('SELECT value FROM system_settings WHERE key = $1', [`wallet_pf_limit_${planId}`]),
        pool.query('SELECT value FROM system_settings WHERE key = $1', [`wallet_pj_limit_${planId}`]),
    ])
    return {
        totalLimit: totalRow.rows.length > 0 ? parseInt(totalRow.rows[0].value) : 2,
        pfLimit: pfRow.rows.length > 0 ? parseInt(pfRow.rows[0].value) : 1,
        pjLimit: pjRow.rows.length > 0 ? parseInt(pjRow.rows[0].value) : 1,
    }
}

// Verifica limite de carteiras do plano antes de criar uma nova
const checkWalletLimit = async (req, res, next) => {
    try {
        const planId  = Number(req.user.planId) || 1
        const isAdmin = req.user?.role === 'ADMIN'
        const inTrial = req.user?.isInTrial === true

        if (isAdmin || inTrial) return next()

        const accountType = normalizeAccountType(req.body.account_type) // 'PF' ou 'PJ'
        if (!WALLET_TYPES.includes(accountType)) {
            return res.status(400).json({ message: 'Tipo de carteira inválido. Use PF ou PJ.' })
        }

        // Buscar os 3 limites em paralelo
        const { totalLimit, pfLimit, pjLimit } = await getWalletLimits(planId)

        // Buscar contagens atuais
        const { rows: counts } = await pool.query(
            `SELECT account_type, COUNT(*) as count
             FROM business_units WHERE "ownerId" = $1
             GROUP BY account_type`,
            [req.user.id]
        )
        const pfCount    = parseInt(counts.find(r => r.account_type === 'PF')?.count || 0)
        const pjCount    = parseInt(counts.find(r => r.account_type === 'PJ')?.count || 0)
        const totalCount = pfCount + pjCount

        // Verificar limite total (0 = ilimitado)
        if (totalLimit > 0 && totalCount >= totalLimit) {
            return res.status(403).json({
                message: `Seu plano permite no máximo ${totalLimit} carteira${totalLimit > 1 ? 's' : ''} no total. Faça upgrade para adicionar mais.`
            })
        }

        // Verificar limite por tipo PF
        if (accountType === 'PF' && pfLimit > 0 && pfCount >= pfLimit) {
            return res.status(403).json({
                message: `Seu plano permite no máximo ${pfLimit} carteira${pfLimit > 1 ? 's' : ''} Pessoa Física. Faça upgrade para adicionar mais.`
            })
        }

        // Verificar limite por tipo PJ
        if (accountType === 'PJ' && pjLimit > 0 && pjCount >= pjLimit) {
            return res.status(403).json({
                message: `Seu plano permite no máximo ${pjLimit} carteira${pjLimit > 1 ? 's' : ''} Pessoa Jurídica. Faça upgrade para adicionar mais.`
            })
        }

        next()
    } catch (err) {
        console.error('[checkWalletLimit]', err)
        res.status(500).json({ message: 'Erro ao verificar limite de carteiras' })
    }
}

// Verifica limite mensal de transações do plano antes de criar uma nova
const checkTransactionLimit = async (req, res, next) => {
    try {
        const planId = Number(req.user.planId) || 1
        const isAdmin = req.user?.role === 'ADMIN'
        const inTrial = req.user?.isInTrial === true

        if (isAdmin || inTrial) return next()

        const settingKey = `transaction_limit_${planId}`
        const { rows } = await pool.query(
            'SELECT value FROM system_settings WHERE key = $1',
            [settingKey]
        )
        const limit = rows.length > 0 ? parseInt(rows[0].value) : 0

        if (limit === 0) return next()

        // Conta transações do mês atual
        const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) as count FROM finance_transactions
             WHERE "userId" = $1
               AND date_trunc('month', "createdAt") = date_trunc('month', NOW())`,
            [req.user.id]
        )
        const current = parseInt(countRows[0].count)

        if (current >= limit) {
            return res.status(403).json({
                message: `Seu plano permite no máximo ${limit} lançamento${limit > 1 ? 's' : ''} por mês. Faça upgrade para continuar.`
            })
        }
        next()
    } catch (err) {
        console.error('[checkTransactionLimit]', err)
        res.status(500).json({ message: 'Erro ao verificar limite de lançamentos' })
    }
}

// Plano Gratuito: o extrato mostra só os últimos 30 dias. O servidor trava em 31
// (um dia de folga para o fuso), então mudar as datas na chamada não traz mais nada.
// O Painel do Gratuito pede só o mês atual, que sempre cabe nessa janela.
const FREE_HISTORY_DAYS = 31
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const freeHistoryStart = (user, now = new Date()) => {
    if (!user || user.role === 'ADMIN' || user.isInTrial === true) return null
    if ((Number(user.planId) || 1) !== 1) return null
    const start = new Date(now.getTime() - FREE_HISTORY_DAYS * 24 * 60 * 60 * 1000)
    return start.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

// --- CATEGORIES ---

const CATEGORY_TYPES = ['RECEITA', 'DESPESA_MEI', 'DESPESA_PESSOAL']
const MAX_CATEGORY_NAME = 60
const categoryIdOf = (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null
}
// Confere nome e tipo. Devolve { name, type } limpos ou { error }
const categoryDataOf = (body = {}) => {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
    if (!name) return { error: 'Escreva o nome da categoria.' }
    if (name.length > MAX_CATEGORY_NAME) return { error: `O nome pode ter até ${MAX_CATEGORY_NAME} letras.` }
    if (!CATEGORY_TYPES.includes(body.type)) return { error: 'Escolha se a categoria é de receita, despesa do MEI ou despesa pessoal.' }
    return { name, type: body.type }
}

// Lista as categorias. Com ?uso=1, traz quantos lançamentos e compras de cartão usam
// cada uma e quanto somaram no ano (para a página Categorias).
router.get('/categories', authMiddleware, async (req, res) => {
    try {
        if (req.query.uso === '1') {
            const year = new Date().getFullYear()
            const { rows } = await db.query(
                `SELECT c.*,
                        COALESCE(t.count, 0)::int AS "transactionsCount",
                        COALESCE(t.year_total, 0)::float AS "yearTotal",
                        COALESCE(i.count, 0)::int AS "invoiceItemsCount"
                 FROM finance_categories c
                 LEFT JOIN (
                     SELECT "categoryId", COUNT(*) AS count,
                            SUM(CASE WHEN EXTRACT(YEAR FROM date) = $2 THEN amount ELSE 0 END) AS year_total
                     FROM finance_transactions WHERE "userId" = $1 GROUP BY "categoryId"
                 ) t ON t."categoryId" = c.id
                 LEFT JOIN (
                     -- Compras de cartão que ainda não estão no Extrato (as que estão já contam acima)
                     SELECT ii."categoryId", COUNT(*) AS count
                     FROM invoice_items ii
                     WHERE ii."userId" = $1
                       AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.invoice_item_id = ii.id)
                     GROUP BY ii."categoryId"
                 ) i ON i."categoryId" = c.id
                 WHERE c."userId" = $1
                 ORDER BY c.name ASC`,
                [req.user.id, year]
            )
            const { rows: [none] } = await db.query(
                `SELECT COUNT(*)::int AS count FROM finance_transactions
                 WHERE "userId" = $1 AND "categoryId" IS NULL AND EXTRACT(YEAR FROM date) = $2`,
                [req.user.id, year]
            )
            res.set('X-Uncategorized-Year', String(none?.count || 0))
            return res.json(rows)
        }
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

router.post('/categories', authMiddleware, featureGuard('categorias'), async (req, res) => {
    const data = categoryDataOf(req.body)
    if (data.error) return res.status(400).json({ message: data.error })
    try {
        // Mesmo nome no mesmo tipo vira categoria repetida nas listas
        const { rows: dup } = await db.query(
            'SELECT id FROM finance_categories WHERE "userId" = $1 AND type = $2 AND LOWER(TRIM(name)) = LOWER($3) LIMIT 1',
            [req.user.id, data.type, data.name]
        )
        if (dup.length) return res.status(409).json({ message: `Já existe a categoria "${data.name}" nesse tipo.`, id: dup[0].id })

        const { rows: [newCat] } = await db.query(
            'INSERT INTO finance_categories ("userId", name, type) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, data.name, data.type]
        )
        res.json(newCat)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao criar categoria' })
    }
})

router.patch('/categories/:id', authMiddleware, featureGuard('categorias'), async (req, res) => {
    const id = categoryIdOf(req.params.id)
    if (!id) return res.status(404).json({ message: 'Categoria não encontrada' })
    const data = categoryDataOf(req.body)
    if (data.error) return res.status(400).json({ message: data.error })
    try {
        const { rows: [current] } = await db.query(
            'SELECT * FROM finance_categories WHERE id = $1 AND "userId" = $2',
            [id, req.user.id]
        )
        if (!current) return res.status(404).json({ message: 'Categoria não encontrada' })

        const { rows: dup } = await db.query(
            'SELECT id FROM finance_categories WHERE "userId" = $1 AND type = $2 AND LOWER(TRIM(name)) = LOWER($3) AND id <> $4 LIMIT 1',
            [req.user.id, data.type, data.name, id]
        )
        if (dup.length) return res.status(409).json({ message: `Já existe a categoria "${data.name}" nesse tipo.` })

        // Trocar o tipo de uma categoria em uso deixaria receita com categoria de despesa
        if (data.type !== current.type) {
            const { rows: [used] } = await db.query(
                `SELECT (SELECT COUNT(*) FROM finance_transactions WHERE "categoryId" = $1 AND "userId" = $2)
                      + (SELECT COUNT(*) FROM invoice_items WHERE "categoryId" = $1 AND "userId" = $2) AS total`,
                [id, req.user.id]
            )
            if (Number(used?.total) > 0) {
                return res.status(409).json({ message: 'Essa categoria já tem lançamentos, então o tipo não pode mudar. Crie uma categoria nova no outro tipo.' })
            }
        }

        const { rows: [updated] } = await db.query(
            'UPDATE finance_categories SET name = $1, type = $2 WHERE id = $3 AND "userId" = $4 RETURNING *',
            [data.name, data.type, id, req.user.id]
        )
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao atualizar categoria' })
    }
})

// Excluir: os lançamentos e as compras de cartão que usavam a categoria ficam sem
// categoria (antes o banco recusava a exclusão e a tela não dizia nada).
router.delete('/categories/:id', authMiddleware, featureGuard('categorias'), async (req, res) => {
    const id = categoryIdOf(req.params.id)
    if (!id) return res.status(404).json({ message: 'Categoria não encontrada' })
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const { rows: [cat] } = await client.query(
            'SELECT id FROM finance_categories WHERE id = $1 AND "userId" = $2 FOR UPDATE',
            [id, req.user.id]
        )
        if (!cat) {
            await client.query('ROLLBACK')
            return res.status(404).json({ message: 'Categoria não encontrada' })
        }
        const { rowCount: transactions } = await client.query(
            'UPDATE finance_transactions SET "categoryId" = NULL WHERE "categoryId" = $1 AND "userId" = $2',
            [id, req.user.id]
        )
        const { rowCount: invoiceItems } = await client.query(
            'UPDATE invoice_items SET "categoryId" = NULL WHERE "categoryId" = $1 AND "userId" = $2',
            [id, req.user.id]
        )
        await client.query('DELETE FROM finance_categories WHERE id = $1 AND "userId" = $2', [id, req.user.id])
        await client.query('COMMIT')
        res.json({ message: 'Categoria excluída', uncategorized: { transactions, invoiceItems } })
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        console.error(err)
        res.status(500).json({ message: 'Não deu para excluir a categoria. Nada foi alterado; tente de novo.' })
    } finally {
        client.release()
    }
})

// --- CREDIT CARDS ---

// Confere os dados do cartão. Na edição (partial = true) só confere o que veio.
const MAX_CARD_IMAGE_LENGTH = 3 * 1024 * 1024 // ~2 MB de imagem em base64
const isDayOfMonth = (v) => {
    const n = Number(v)
    return v !== '' && v !== null && v !== undefined && Number.isInteger(n) && n >= 1 && n <= 31
}
const MAX_CARD_LIMIT = 100000000
// Limite do cartão: vazio = sem limite (0); senão número de 0 a R$ 100 milhões
const cardLimitOf = (v) => (v === undefined ? undefined : (v === null || v === '' ? 0 : Number(v)))
const cardDataError = (body = {}, partial = false) => {
    const { name, lastFour, brand, closingDay, dueDate, imageUrl, creditLimit } = body
    if (!partial || name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) return 'Informe o nome do cartão.'
        if (name.trim().length > 60) return 'O nome do cartão pode ter até 60 letras.'
    }
    if (lastFour !== undefined && lastFour !== null && lastFour !== '' && !/^\d{1,4}$/.test(String(lastFour))) {
        return 'O final do cartão deve ter até 4 números.'
    }
    if (brand !== undefined && brand !== null && (typeof brand !== 'string' || brand.length > 30)) {
        return 'Bandeira inválida.'
    }
    if ((!partial || closingDay !== undefined) && !isDayOfMonth(closingDay)) {
        return 'O dia do fechamento deve ser de 1 a 31.'
    }
    if ((!partial || dueDate !== undefined) && !isDayOfMonth(dueDate)) {
        return 'O dia do vencimento deve ser de 1 a 31.'
    }
    if (imageUrl !== undefined && imageUrl !== null && imageUrl !== '') {
        const ok = typeof imageUrl === 'string'
            && imageUrl.length <= MAX_CARD_IMAGE_LENGTH
            && (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(imageUrl) || /^https:\/\/[^\s"'()\\]+$/.test(imageUrl))
        if (!ok) return 'Imagem do cartão inválida ou grande demais. Use PNG, JPG ou WebP de até 2 MB.'
    }
    if (creditLimit !== undefined) {
        const limit = cardLimitOf(creditLimit)
        if (typeof creditLimit === 'boolean' || !Number.isFinite(limit) || limit < 0 || limit > MAX_CARD_LIMIT) {
            return 'O limite do cartão deve ser um valor de 0 a R$ 100 milhões.'
        }
    }
    return null
}

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

router.post('/cards', authMiddleware, cartoesGuard, validateWalletOwnership, async (req, res) => {
    const { name, lastFour, brand, closingDay, dueDate, imageUrl, business_unit_id } = req.body
    const invalid = cardDataError(req.body)
    if (invalid) return res.status(400).json({ message: invalid })
    try {
        const { rows: [newCard] } = await db.query(
            'INSERT INTO credit_cards ("userId", name, "lastFour", brand, "closingDay", "dueDate", "imageUrl", business_unit_id, "creditLimit") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [req.user.id, name.trim(), lastFour || null, brand || null, Number(closingDay), Number(dueDate), imageUrl || null, business_unit_id || null, cardLimitOf(req.body.creditLimit) || 0]
        )
        res.json(newCard)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao criar cartão' })
    }
})

router.patch('/cards/:id', authMiddleware, cartoesGuard, validateWalletOwnership, async (req, res) => {
    const { id } = req.params
    const { name, lastFour, brand, closingDay, dueDate, imageUrl, business_unit_id } = req.body
    const invalid = cardDataError(req.body, true)
    if (invalid) return res.status(400).json({ message: invalid })
    try {
        const { rows: [updated] } = await db.query(
            `UPDATE credit_cards SET
                name = COALESCE($3, name),
                "lastFour" = COALESCE($4, "lastFour"),
                brand = COALESCE($5, brand),
                "closingDay" = COALESCE($6, "closingDay"),
                "dueDate" = COALESCE($7, "dueDate"),
                "imageUrl" = COALESCE($8, "imageUrl"),
                business_unit_id = $9,
                "creditLimit" = COALESCE($10, "creditLimit")
            WHERE id = $1 AND "userId" = $2 RETURNING *`,
            [id, req.user.id, name, lastFour, brand, closingDay, dueDate, imageUrl, business_unit_id || null, cardLimitOf(req.body.creditLimit) ?? null]
        )
        if (!updated) return res.status(404).json({ message: 'Cartão não encontrado' })
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao atualizar cartão' })
    }
})

router.delete('/cards/:id', authMiddleware, cartoesGuard, async (req, res) => {
    const cardId = Number(req.params.id)
    if (!Number.isInteger(cardId) || cardId <= 0) return res.status(404).json({ message: 'Cartão não encontrado' })

    // Antes, um cartão com compras lançadas não podia ser excluído (o banco recusava e a
    // tela não dizia nada). Agora, numa transação só:
    //  1. as compras feitas nele continuam no Extrato, só sem o cartão (inclusive as que
    //     vieram de faturas, que senão seriam apagadas junto com a fatura);
    //  2. os registros de envio de fatura desse cartão saem;
    //  3. o cartão sai, e as faturas e os itens dele saem junto (ON DELETE CASCADE).
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const { rows: [card] } = await client.query(
            'SELECT id FROM credit_cards WHERE id = $1 AND "userId" = $2 FOR UPDATE',
            [cardId, req.user.id]
        )
        if (!card) {
            await client.query('ROLLBACK')
            return res.status(404).json({ message: 'Cartão não encontrado' })
        }

        const { rowCount: keptPurchases } = await client.query(
            `UPDATE finance_transactions
             SET "cardId" = NULL, invoice_item_id = NULL
             WHERE "userId" = $2 AND (
                "cardId" = $1
                OR invoice_item_id IN (
                    SELECT ii.id FROM invoice_items ii
                    JOIN card_invoices ci ON ci.id = ii."invoiceId"
                    WHERE ci."cardId" = $1
                )
             )`,
            [cardId, req.user.id]
        )
        await client.query('DELETE FROM invoice_uploads WHERE "cardId" = $1 AND "userId" = $2', [cardId, req.user.id])
        await client.query('DELETE FROM credit_cards WHERE id = $1 AND "userId" = $2', [cardId, req.user.id])
        await client.query('COMMIT')
        res.json({ message: 'Cartão excluído', keptPurchases })
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        console.error('Erro ao excluir cartão:', err)
        res.status(500).json({ message: 'Não deu para excluir o cartão. Nada foi apagado; tente de novo.' })
    } finally {
        client.release()
    }
})

// --- BILLS (CONTAS A PAGAR) ---
// [REMOVED] Deprecated in favor of 'finance_transactions' with status=PENDING

// --- TRANSACTIONS ---

router.get('/transactions', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 15, walletId, type, search, endDate } = req.query
        let { startDate } = req.query

        const historyStart = freeHistoryStart(req.user)
        if (historyStart && (!DATE_ONLY.test(String(startDate || '')) || startDate < historyStart)) {
            startDate = historyStart
        }

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
            query += ` AND t."categoryId" IN (SELECT id FROM finance_categories WHERE "userId" = $1 AND TRIM(name) = (SELECT TRIM(name) FROM finance_categories WHERE id = $${params.length} AND "userId" = $1))`
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
        // Junto com a contagem, os totais do filtro inteiro (não só da página),
        // para o resumo do Extrato: receitas, despesas e quanto das despesas está pendente
        const countQueryStr = `SELECT COUNT(*),
            COALESCE(SUM(CASE WHEN type = 'RECEITA' THEN amount END), 0) AS receitas,
            COALESCE(SUM(CASE WHEN type = 'DESPESA' THEN amount END), 0) AS despesas,
            COALESCE(SUM(CASE WHEN type = 'DESPESA' AND status = 'PENDING' THEN amount END), 0) AS pendentes
            FROM (` + query + `) as filtered_data`
        const countRes = await db.query(countQueryStr, params)
        const totalCount = parseInt(countRes.rows[0].count)
        const totals = {
            receitas: Number(countRes.rows[0].receitas) || 0,
            despesas: Number(countRes.rows[0].despesas) || 0,
            pendentes: Number(countRes.rows[0].pendentes) || 0
        }

        // Pagination
        query += ` ORDER BY t."billing_date" DESC, t.date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
        params.push(limit, offset)

        const { rows } = await db.query(query, params)

        res.json({
            data: rows,
            totalCount,
            totals,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: Number(page)
        })

    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao buscar transações' })
    }
})

router.post('/transactions', authMiddleware, checkTransactionLimit, validateWalletOwnership, validateReferenceOwnership, async (req, res) => {
    let { type, target, amount, date, categoryId, paymentMethod, cardId, description, isRecurring, isSubscription, dueDate, business_unit_id } = req.body

    if (!isValidAmount(amount)) {
        return res.status(400).json({ message: 'Informe um valor maior que zero.' })
    }

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
                'SELECT "closingDay", "dueDate" FROM credit_cards WHERE id = $1 AND "userId" = $2',
                [finalCardId, req.user.id]
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
router.patch('/transactions/:id/confirm', authMiddleware, validateWalletOwnership, async (req, res) => {
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
router.patch('/transactions/:id', authMiddleware, validateWalletOwnership, validateReferenceOwnership, async (req, res) => {
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

        if (keys.includes('amount') && !isValidAmount(updates.amount)) {
            return res.status(400).json({ message: 'Informe um valor maior que zero.' });
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
                    'SELECT "closingDay", "dueDate" FROM credit_cards WHERE id = $1 AND "userId" = $2',
                    [txCardId, req.user.id]
                );
                if (cardRows.length > 0 && cardRows[0].closingDay && cardRows[0].dueDate) {
                    newBillingDate = calculateBillingDate(txDate, cardRows[0].closingDay, cardRows[0].dueDate);
                }
            }

            await db.query(
                'UPDATE finance_transactions SET "billing_date" = $1 WHERE id = $2 AND "userId" = $3',
                [newBillingDate, id, req.user.id]
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
router.delete('/transactions/:id', authMiddleware, async (req, res) => {
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
router.post('/transactions/bulk-delete', authMiddleware, async (req, res) => {
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

router.post('/transfers', authMiddleware, transferenciasGuard, validateWalletOwnership, async (req, res) => {
    const { sourceWalletId, targetWalletId, amount, date, description } = req.body;

    if (!sourceWalletId || !targetWalletId || !amount || !date) {
        return res.status(400).json({ message: 'Dados incompletos para transferência.' });
    }

    if (!isValidAmount(amount)) {
        return res.status(400).json({ message: 'Informe um valor maior que zero.' });
    }

    if (Number(sourceWalletId) === Number(targetWalletId)) {
        return res.status(400).json({ message: 'Escolha carteiras diferentes para a transferência.' });
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

const MAX_WALLET_NAME = 60
const MAX_WALLET_LOGO_LENGTH = 3 * 1024 * 1024 // ~2 MB de imagem em base64
const walletIdOf = categoryIdOf
const walletLabel = (type) => (type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física')
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Confere os dados da carteira. Na edição só confere o que veio; documento e
// foto que já estavam gravados e não mudaram passam sem conferir de novo (dado
// antigo não trava a troca do nome). Devolve { data } com os campos limpos ou { error }.
const walletDataOf = (body = {}, current = null) => {
    const data = {}

    if (!current || body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
        if (!name) return { error: 'Escreva o nome da carteira.' }
        if (name.length > MAX_WALLET_NAME) return { error: `O nome da carteira pode ter até ${MAX_WALLET_NAME} letras.` }
        data.name = name
    } else data.name = current.name

    const type = body.account_type === undefined && current ? current.account_type : normalizeAccountType(body.account_type)
    if (!WALLET_TYPES.includes(type)) return { error: 'Tipo de carteira inválido. Use PF ou PJ.' }
    data.account_type = type

    // Documento: opcional; CPF na PF e CNPJ (com números ou letras) na PJ
    const doc = body.cnpj
    if (doc === undefined && current) data.cnpj = current.cnpj
    else if (doc === undefined || doc === null || doc === '' || (typeof doc === 'string' && !doc.trim())) data.cnpj = null
    else if (typeof doc !== 'string' || doc.length > 30) return { error: type === 'PJ' ? 'CNPJ inválido.' : 'CPF inválido.' }
    else if (current && doc === current.cnpj && type === current.account_type) data.cnpj = current.cnpj
    else if (type === 'PF') {
        if (!isValidCpf(doc)) return { error: 'CPF inválido. Confira os 11 números ou deixe em branco.' }
        data.cnpj = formatCpf(doc)
    } else {
        if (!isValidCnpj(doc)) return { error: 'CNPJ inválido. Confira os 14 caracteres ou deixe em branco.' }
        data.cnpj = formatCnpj(doc)
    }

    // Foto: imagem PNG/JPG/WebP/GIF em base64 de até 2 MB ou endereço https
    const logo = body.photo_url
    if (logo === undefined && current) data.logo_url = current.logo_url
    else if (logo === undefined || logo === null || logo === '') data.logo_url = null
    else if (current && logo === current.logo_url) data.logo_url = current.logo_url
    else {
        const ok = typeof logo === 'string'
            && logo.length <= MAX_WALLET_LOGO_LENGTH
            && (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(logo)
                || (logo.length <= 2048 && /^https:\/\/[^\s"'()\\<>]+$/.test(logo)))
        if (!ok) return { error: 'Foto inválida ou grande demais. Use PNG, JPG ou WebP de até 2 MB.' }
        data.logo_url = logo
    }

    return { data }
}

// Quantos lançamentos e cartões usam a carteira
const walletUsage = async (q, walletId, userId) => {
    const { rows: [row] } = await q.query(
        `SELECT (SELECT COUNT(*) FROM finance_transactions WHERE business_unit_id = $1 AND "userId" = $2)::int AS transactions,
                (SELECT COUNT(*) FROM credit_cards WHERE business_unit_id = $1 AND "userId" = $2)::int AS cards`,
        [walletId, userId]
    )
    return { transactions: Number(row?.transactions) || 0, cards: Number(row?.cards) || 0 }
}

const usageText = ({ transactions, cards }) => [
    transactions ? plural(transactions, 'lançamento', 'lançamentos') : null,
    cards ? plural(cards, 'cartão', 'cartões') : null
].filter(Boolean).join(' e ')

// Lista as carteiras (principal primeiro). Com ?uso=1, traz quantos lançamentos e
// cartões cada uma tem (a página Carteiras trava o tipo e explica a exclusão).
router.get('/business-units', authMiddleware, async (req, res) => {
    try {
        if (req.query.uso === '1') {
            const { rows } = await db.query(
                `SELECT b.*,
                        COALESCE(t.count, 0)::int AS "transactionsCount",
                        COALESCE(c.count, 0)::int AS "cardsCount"
                 FROM business_units b
                 LEFT JOIN (SELECT business_unit_id, COUNT(*) AS count FROM finance_transactions
                            WHERE "userId" = $1 GROUP BY business_unit_id) t ON t.business_unit_id = b.id
                 LEFT JOIN (SELECT business_unit_id, COUNT(*) AS count FROM credit_cards
                            WHERE "userId" = $1 GROUP BY business_unit_id) c ON c.business_unit_id = b.id
                 WHERE b."ownerId" = $1
                 ORDER BY b."isPrimary" DESC, b.name ASC`,
                [req.user.id]
            )
            return res.json(rows)
        }
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

// Criar: a carteira principal é decidida aqui (só a primeira carteira da pessoa vira
// principal; quem já tem carteiras não ganha principal nova), nunca pelo navegador.
router.post('/business-units', authMiddleware, checkWalletLimit, async (req, res) => {
    const { data, error } = walletDataOf(req.body)
    if (error) return res.status(400).json({ message: error })
    try {
        const { rows: [newUnit] } = await db.query(
            `INSERT INTO business_units ("ownerId", name, account_type, cnpj, logo_url, "isPrimary")
             VALUES ($1, $2, $3, $4, $5,
                     NOT EXISTS (SELECT 1 FROM business_units WHERE "ownerId" = $1))
             RETURNING *`,
            [req.user.id, data.name, data.account_type, data.cnpj, data.logo_url]
        )
        res.json(newUnit)
    } catch (err) {
        console.error('ERRO AO CRIAR CARTEIRA:', err)
        res.status(500).json({ message: 'Não deu para criar a carteira. Tente de novo.' })
    }
})

// Trocar uma carteira de PF para PJ (ou o contrário) conta no limite do novo tipo
const walletTypeChangeBlocked = async (user, newType) => {
    if (user?.role === 'ADMIN' || user?.isInTrial === true) return null
    const planId = Number(user.planId) || 1
    const { pfLimit, pjLimit } = await getWalletLimits(planId)
    const limit = newType === 'PF' ? pfLimit : pjLimit
    if (!(limit > 0)) return null
    const { rows: [row] } = await pool.query(
        'SELECT COUNT(*) as count FROM business_units WHERE "ownerId" = $1 AND account_type = $2',
        [user.id, newType]
    )
    if (parseInt(row?.count || 0) < limit) return null
    return `Seu plano permite no máximo ${limit} carteira${limit > 1 ? 's' : ''} ${walletLabel(newType)}. Faça upgrade para adicionar mais.`
}

// Editar: o que não veio fica como está; "isPrimary" do navegador é ignorado.
router.put('/business-units/:id', authMiddleware, async (req, res) => {
    const id = walletIdOf(req.params.id)
    if (!id) return res.status(404).json({ message: 'Carteira não encontrada' })
    try {
        const { rows: [current] } = await db.query(
            'SELECT * FROM business_units WHERE id = $1 AND "ownerId" = $2',
            [id, req.user.id]
        )
        if (!current) return res.status(404).json({ message: 'Carteira não encontrada' })

        const { data, error } = walletDataOf(req.body, current)
        if (error) return res.status(400).json({ message: error })

        if (data.account_type !== current.account_type) {
            // Lançamentos e cartões ficariam com o tipo errado (despesa do MEI numa carteira pessoal)
            const usage = await walletUsage(db, id, req.user.id)
            if (usage.transactions || usage.cards) {
                return res.status(409).json({
                    message: `Essa carteira já tem ${usageText(usage)}, então o tipo não pode mudar. Crie uma carteira nova de ${walletLabel(data.account_type)}.`,
                    usage
                })
            }
            const blocked = await walletTypeChangeBlocked(req.user, data.account_type)
            if (blocked) return res.status(403).json({ message: blocked })
        }

        const { rows: [updated] } = await db.query(
            'UPDATE business_units SET name = $1, "account_type" = $2, cnpj = $3, "logo_url" = $4 WHERE id = $5 AND "ownerId" = $6 RETURNING *',
            [data.name, data.account_type, data.cnpj, data.logo_url, id, req.user.id]
        )
        if (!updated) return res.status(404).json({ message: 'Carteira não encontrada' })
        res.json(updated)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao atualizar carteira' })
    }
})

// Excluir: a principal não sai, e carteira com lançamentos ou cartões também não
// (antes saía e deixava os lançamentos apontando para uma carteira que não existe).
router.delete('/business-units/:id', authMiddleware, async (req, res) => {
    const id = walletIdOf(req.params.id)
    if (!id) return res.status(404).json({ message: 'Carteira não encontrada' })
    try {
        const { rows: [wallet] } = await db.query(
            'SELECT id, "isPrimary" FROM business_units WHERE id = $1 AND "ownerId" = $2',
            [id, req.user.id]
        )
        if (!wallet) return res.status(404).json({ message: 'Carteira não encontrada' })
        if (wallet.isPrimary) {
            return res.status(409).json({ message: 'A carteira principal não pode ser excluída.', reason: 'primary' })
        }
        const usage = await walletUsage(db, id, req.user.id)
        if (usage.transactions || usage.cards) {
            return res.status(409).json({
                message: `Essa carteira tem ${usageText(usage)}. Mova ou exclua esses itens antes de excluir a carteira.`,
                reason: 'in_use',
                usage
            })
        }
        // Confere de novo na mesma instrução, caso algo tenha entrado entre a conta e a exclusão
        const { rowCount } = await db.query(
            `DELETE FROM business_units b
             WHERE b.id = $1 AND b."ownerId" = $2 AND b."isPrimary" IS NOT TRUE
               AND NOT EXISTS (SELECT 1 FROM finance_transactions t WHERE t.business_unit_id = b.id AND t."userId" = $2)
               AND NOT EXISTS (SELECT 1 FROM credit_cards c WHERE c.business_unit_id = b.id AND c."userId" = $2)`,
            [id, req.user.id]
        )
        if (!rowCount) return res.status(409).json({ message: 'A carteira mudou enquanto você excluía. Atualize a página e tente de novo.', reason: 'changed' })
        res.json({ message: 'Carteira excluída' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao excluir carteira' })
    }
});

module.exports = router
