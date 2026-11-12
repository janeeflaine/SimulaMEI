/**
 * financeActions.js — Ações financeiras usadas fora das rotas HTTP (canal WhatsApp).
 *
 * Reproduz as mesmas regras das rotas de finanças (features do plano, limite
 * mensal de lançamentos, status PENDING para contas a pagar), sem depender de
 * req/res. As rotas existentes não usam este módulo e continuam como estão.
 */
const { db } = require('../db')

const TIME_ZONE = 'America/Sao_Paulo'
const PLAN_FALLBACK = { whatsapp: 2, whatsapp_midia: 3, contas_pagar: 2 }
// Números de WhatsApp por plano (Gratuito, Prata, Ouro) quando o admin ainda não
// definiu "whatsapp_numbers_<planId>" em system_settings (0 = ilimitado).
const WHATSAPP_NUMBERS_DEFAULT = { 1: 1, 2: 3, 3: 4 }

// ─── Datas (sempre no fuso de Brasília) ──────────────────────────────────────

function todayISO(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now)
}

function addDaysISO(iso, days) {
    const d = new Date(`${iso}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

function lastDayOfMonthISO(iso) {
    const [y, m] = iso.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

function isValidISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const d = new Date(`${value}T12:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function toISODate(value) {
    if (!value) return null
    if (value instanceof Date) {
        const y = value.getFullYear()
        const m = String(value.getMonth() + 1).padStart(2, '0')
        const d = String(value.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }
    return String(value).slice(0, 10)
}

// ─── Usuário e plano ─────────────────────────────────────────────────────────

/**
 * Carrega o usuário com o plano efetivo, com a mesma regra do authMiddleware
 * (plano vencido sem assinatura ativa = plano gratuito), sem gravar nada.
 * Retorna null se o usuário não existir, estiver bloqueado ou excluído.
 */
async function getUserContext(userId) {
    const { rows: [user] } = await db.query(
        `SELECT u.id, u.name, u.role, u."planId", u."isBlocked", u."deletedAt",
                u."subscriptionStatus", u."planExpiresAt", p.features AS "planFeatures"
         FROM users u
         LEFT JOIN plans p ON u."planId" = p.id
         WHERE u.id = $1`,
        [userId]
    )
    if (!user || user.deletedAt || Number(user.isBlocked) === 1) return null

    let planId = user.planId ? Number(user.planId) : 1
    let rawFeatures = user.planFeatures
    let isInTrial = user.subscriptionStatus === 'trialing'

    const expired = user.planExpiresAt
        && new Date(user.planExpiresAt) < new Date()
        && user.subscriptionStatus !== 'active'
    if (expired) {
        const { rows: [freePlan] } = await db.query('SELECT id, features FROM plans WHERE price = 0 LIMIT 1')
        if (freePlan) {
            planId = Number(freePlan.id)
            rawFeatures = freePlan.features
        }
        isInTrial = false
    }

    let planFeatures = {}
    try {
        planFeatures = rawFeatures ? (typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures) : {}
    } catch (_) { planFeatures = {} }

    return { id: user.id, name: user.name, role: user.role, planId, isInTrial, planFeatures }
}

/** Mesma regra do featureGuard: admin e trial passam; senão vale a feature do plano. */
function hasFeature(ctx, key) {
    if (!ctx) return false
    if (ctx.role === 'ADMIN' || ctx.isInTrial) return true
    const value = ctx.planFeatures ? ctx.planFeatures[key] : undefined
    if (typeof value === 'boolean') return value
    return (Number(ctx.planId) || 1) >= (PLAN_FALLBACK[key] || 2)
}

/**
 * Limite de números de WhatsApp da conta, configurado no painel admin
 * (system_settings "whatsapp_numbers_<planId>"; 0 = ilimitado → Infinity).
 * Admin e trial têm o limite do Ouro, como no featureGuard.
 */
async function maxWhatsappNumbers(ctx) {
    if (!ctx) return 0
    const planId = (ctx.role === 'ADMIN' || ctx.isInTrial) ? 3 : (Number(ctx.planId) || 1)
    const { rows: [row] } = await db.query(
        'SELECT value FROM system_settings WHERE key = $1',
        [`whatsapp_numbers_${planId}`]
    )
    const configured = row ? parseInt(row.value, 10) : NaN
    const limit = Number.isInteger(configured) && configured >= 0
        ? configured
        : (WHATSAPP_NUMBERS_DEFAULT[planId] ?? 1)
    return limit === 0 ? Infinity : limit
}

/** Mesma regra do checkTransactionLimit das rotas de finanças. */
async function checkTransactionLimit(ctx) {
    if (ctx.role === 'ADMIN' || ctx.isInTrial) return { allowed: true }
    const { rows } = await db.query(
        'SELECT value FROM system_settings WHERE key = $1',
        [`transaction_limit_${Number(ctx.planId) || 1}`]
    )
    const limit = rows.length > 0 ? parseInt(rows[0].value) : 0
    if (!limit) return { allowed: true }

    const { rows: [countRow] } = await db.query(
        `SELECT COUNT(*) as count FROM finance_transactions
         WHERE "userId" = $1
           AND date_trunc('month', "createdAt") = date_trunc('month', NOW())`,
        [ctx.id]
    )
    return { allowed: parseInt(countRow.count) < limit, limit }
}

// ─── Carteiras e categorias ──────────────────────────────────────────────────

async function listCategories(userId) {
    const { rows } = await db.query(
        'SELECT id, name, type FROM finance_categories WHERE "userId" = $1 ORDER BY name',
        [userId]
    )
    return rows
}

function categoryTypeFor(type, target) {
    if (type === 'RECEITA') return 'RECEITA'
    return target === 'BUSINESS' ? 'DESPESA_MEI' : 'DESPESA_PESSOAL'
}

/** Categoria do usuário com esse nome (sem diferenciar maiúsculas) no tipo certo. */
async function findCategory(userId, categoryName, type, target) {
    const clean = String(categoryName || '').trim()
    if (!clean) return null
    const { rows: [row] } = await db.query(
        `SELECT id, name FROM finance_categories
         WHERE "userId" = $1 AND type = $2 AND LOWER(name) = LOWER($3)
         LIMIT 1`,
        [userId, categoryTypeFor(type, target), clean]
    )
    return row || null
}

/** Usa a categoria existente; se não existir e create = true, cria (como POST /categories). */
async function resolveCategoryId(userId, categoryName, type, target, create = false) {
    if (!categoryName) return null
    const found = await findCategory(userId, categoryName, type, target)
    if (found) return found.id
    if (!create) return null
    const { rows: [created] } = await db.query(
        'INSERT INTO finance_categories ("userId", name, type) VALUES ($1, $2, $3) RETURNING id',
        [userId, String(categoryName).trim().slice(0, 60), categoryTypeFor(type, target)]
    )
    return created ? created.id : null
}

/** Carteiras do usuário (PF = pessoal, PJ = MEI), da mais antiga para a mais nova. */
async function listWallets(userId) {
    const { rows } = await db.query(
        `SELECT id, name, "account_type" AS "accountType", "isPrimary"
         FROM business_units
         WHERE "ownerId" = $1
         ORDER BY "createdAt" ASC NULLS LAST, id ASC`,
        [userId]
    )
    return rows
}

/** Carteira do usuário pelo id (null se não for dele). */
async function getWallet(userId, walletId) {
    const id = parseInt(walletId, 10)
    if (!Number.isInteger(id)) return null
    const { rows: [row] } = await db.query(
        `SELECT id, name, "account_type" AS "accountType" FROM business_units
         WHERE id = $1 AND "ownerId" = $2`,
        [id, userId]
    )
    return row || null
}

const walletTarget = (wallet) => (wallet && wallet.accountType === 'PJ' ? 'BUSINESS' : 'PERSONAL')

/** Carteira PJ para lançamentos do MEI e PF para os pessoais, priorizando a principal. */
async function findWalletId(userId, target) {
    const { rows: [row] } = await db.query(
        `SELECT id FROM business_units
         WHERE "ownerId" = $1 AND "account_type" = $2
         ORDER BY "isPrimary" DESC, id ASC
         LIMIT 1`,
        [userId, target === 'BUSINESS' ? 'PJ' : 'PF']
    )
    return row ? row.id : null
}

/** Carteira escolhida, se for do usuário e do tipo certo; senão a padrão do tipo. */
async function resolveWalletId(userId, walletId, target) {
    if (walletId) {
        const wallet = await getWallet(userId, walletId)
        if (wallet && walletTarget(wallet) === target) return wallet.id
    }
    return findWalletId(userId, target)
}

// ─── Lançamentos ─────────────────────────────────────────────────────────────

/**
 * Cria um lançamento. Contas a pagar entram como PENDING com forma "Boleto",
 * igual ao fluxo do site. Despesa no cartão de crédito não passa por aqui
 * (exige cartão e fatura); receita no crédito (maquininha) sim.
 * tx.walletId é conferido de novo: só vale se a carteira for do usuário.
 * tx.createCategory = true cria a categoria citada se ela ainda não existir.
 */
async function createTransaction(ctx, tx) {
    const today = todayISO()
    const isBill = !!tx.isBill
    const date = isBill ? today : (tx.date || today)
    const [categoryId, walletId] = await Promise.all([
        resolveCategoryId(ctx.id, tx.categoryName, tx.type, tx.target, !!tx.createCategory),
        resolveWalletId(ctx.id, tx.walletId, tx.target)
    ])

    const { rows: [created] } = await db.query(
        `INSERT INTO finance_transactions
        ("userId", type, target, amount, date, "categoryId", "paymentMethod", "cardId", description, "isRecurring", "isSubscription", status, "dueDate", "business_unit_id", "billing_date")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, FALSE, FALSE, $9, $10, $11, $12) RETURNING *`,
        [
            ctx.id, tx.type, tx.target, tx.amount, date, categoryId,
            isBill ? 'Boleto' : (tx.paymentMethod || null),
            tx.description,
            isBill ? 'PENDING' : 'PAID',
            isBill ? tx.dueDate : null,
            walletId,
            date
        ]
    )
    return created
}

const BILL_PERIODS = ['HOJE', 'SEMANA', 'MES', 'ATRASADAS', 'TODAS']

/** Contas pendentes até o fim do período (sempre inclui as atrasadas). */
async function listPendingBills(userId, period = 'HOJE') {
    const today = todayISO()
    const limitDate = {
        HOJE: today,
        ATRASADAS: addDaysISO(today, -1),
        SEMANA: addDaysISO(today, 7),
        MES: lastDayOfMonthISO(today),
        TODAS: '9999-12-31'
    }[period] || today

    const { rows } = await db.query(
        `SELECT t.id, t.description, t.amount, t."dueDate", t.target, c.name AS "categoryName"
         FROM finance_transactions t
         LEFT JOIN finance_categories c ON t."categoryId" = c.id
         WHERE t."userId" = $1 AND t.status = 'PENDING'
           AND t."dueDate" IS NOT NULL AND t."dueDate" <= $2
         ORDER BY t."dueDate" ASC, t.id ASC
         LIMIT 50`,
        [userId, limitDate]
    )
    return rows.map(r => ({ ...r, dueDate: toISODate(r.dueDate), amount: Number(r.amount) }))
}

/** Busca contas pendentes pela descrição ou categoria ("luz", "aluguel"...). */
async function searchPendingBills(userId, term) {
    const clean = String(term || '').trim().slice(0, 60)
    if (!clean) return []
    const pattern = `%${clean.replace(/[\\%_]/g, ch => `\\${ch}`)}%`
    const { rows } = await db.query(
        `SELECT t.id, t.description, t.amount, t."dueDate", t.target, c.name AS "categoryName"
         FROM finance_transactions t
         LEFT JOIN finance_categories c ON t."categoryId" = c.id
         WHERE t."userId" = $1 AND t.status = 'PENDING'
           AND (t.description ILIKE $2 OR c.name ILIKE $2)
         ORDER BY t."dueDate" ASC NULLS LAST, t.id ASC
         LIMIT 10`,
        [userId, pattern]
    )
    return rows.map(r => ({ ...r, dueDate: toISODate(r.dueDate), amount: Number(r.amount) }))
}

/** Marca como paga, como a rota PATCH /transactions/:id/confirm. Retorna null se não for pendente do usuário. */
async function markBillPaid(userId, transactionId) {
    const id = parseInt(transactionId, 10)
    if (!Number.isInteger(id)) return null
    const today = todayISO()
    const { rows: [updated] } = await db.query(
        `UPDATE finance_transactions
         SET status = 'PAID', date = $3, "billing_date" = $3
         WHERE id = $1 AND "userId" = $2 AND status = 'PENDING'
         RETURNING *`,
        [id, userId, today]
    )
    return updated ? { ...updated, amount: Number(updated.amount) } : null
}

/** Totais do mês corrente (pagos) e contas pendentes do mês. */
async function monthSummary(userId) {
    const today = todayISO()
    const start = `${today.slice(0, 7)}-01`
    const end = lastDayOfMonthISO(today)

    const { rows } = await db.query(
        `SELECT type, target, COALESCE(SUM(amount), 0) AS total
         FROM finance_transactions
         WHERE "userId" = $1 AND status = 'PAID'
           AND COALESCE("billing_date", date) BETWEEN $2 AND $3
         GROUP BY type, target`,
        [userId, start, end]
    )
    const { rows: [pending] } = await db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
         FROM finance_transactions
         WHERE "userId" = $1 AND status = 'PENDING' AND "dueDate" <= $2`,
        [userId, end]
    )

    const sum = (type, target) => rows
        .filter(r => r.type === type && (!target || r.target === target))
        .reduce((acc, r) => acc + Number(r.total), 0)

    return {
        month: today.slice(0, 7),
        receitaMei: sum('RECEITA', 'BUSINESS'),
        despesaMei: sum('DESPESA', 'BUSINESS'),
        receitaPessoal: sum('RECEITA', 'PERSONAL'),
        despesaPessoal: sum('DESPESA', 'PERSONAL'),
        pendingCount: pending ? Number(pending.count) : 0,
        pendingTotal: pending ? Number(pending.total) : 0
    }
}

module.exports = {
    TIME_ZONE,
    WHATSAPP_NUMBERS_DEFAULT,
    BILL_PERIODS,
    todayISO,
    addDaysISO,
    isValidISODate,
    toISODate,
    getUserContext,
    hasFeature,
    maxWhatsappNumbers,
    checkTransactionLimit,
    listCategories,
    findCategory,
    listWallets,
    getWallet,
    walletTarget,
    findWalletId,
    createTransaction,
    listPendingBills,
    searchPendingBills,
    markBillPaid,
    monthSummary
}
