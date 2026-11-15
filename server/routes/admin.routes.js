const express = require('express')
const bcrypt = require('bcryptjs')
const { db, pool } = require('../db')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')
const auditLogger = require('../utils/auditLogger')
const { deleteUserData, cancelStripeSubscriptionIfActive } = require('../utils/userDeletion')
const meiTax = require('../logic/meiTax')

const router = express.Router()

// Apply auth middleware to all admin routes
router.use(authMiddleware)
router.use(adminMiddleware)

// ========== STATS ==========
// Assinante pagando: plano pago, assinatura no Stripe e situação que ainda cobra.
// Fica de fora quem só escolheu o plano e não pagou ('pending_payment') e quem
// recebeu o plano pelo admin (sem assinatura no Stripe).
const PAYING_SQL = `p.price > 0 AND u."stripeSubscriptionId" IS NOT NULL AND u."subscriptionStatus" IN ('active', 'canceling')`

router.get('/stats', async (req, res) => {
    try {
        const [usersResult, plansResult, simulationsResult, activityResult, suspiciousResult] = await Promise.all([
            db.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days')::int AS "new30",
                       COUNT(*) FILTER (WHERE "isBlocked" = 1)::int AS blocked,
                       COUNT(*) FILTER (WHERE "subscriptionStatus" = 'pending_payment')::int AS "pendingPayment"
                FROM users
                WHERE role = 'USER' AND "deletedAt" IS NULL
            `),
            db.query(`
                SELECT p.id, p.name, ROUND(COALESCE(p.price, 0)::numeric, 2)::float AS price,
                       COUNT(u.id)::int AS count,
                       COUNT(u.id) FILTER (WHERE ${PAYING_SQL})::int AS paying,
                       COUNT(u.id) FILTER (WHERE ${PAYING_SQL} AND u."subscriptionStatus" = 'canceling')::int AS canceling
                FROM users u
                LEFT JOIN plans p ON p.id = u."planId"
                WHERE u.role = 'USER' AND u."deletedAt" IS NULL
                GROUP BY p.id, p.name, p.price
            `),
            db.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days')::int AS "last30"
                FROM simulations
            `),
            // Últimos eventos importantes. Só o necessário para a lista (sem IP, e-mail
            // nem metadata, que ficam em Logs de auditoria).
            db.query(`
                SELECT al.id, al.timestamp, al.level, al.event_type, u.name AS user_name
                FROM audit_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.event_type <> 'USER_LOGIN_SUCCESS'
                   OR al.level IN ('WARN', 'ERROR', 'CRITICAL')
                ORDER BY al.timestamp DESC, al.id DESC
                LIMIT 10
            `),
            db.query(`
                SELECT COUNT(*)::int AS count FROM audit_logs
                WHERE level IN ('WARN', 'ERROR', 'CRITICAL')
                  AND timestamp >= NOW() - INTERVAL '24 hours'
            `),
        ])

        // Conta sem plano (planId vazio ou de um plano apagado) usa o Gratuito: soma no
        // plano de preço zero, em vez de aparecer como um segundo "Gratuito"
        const rows = plansResult.rows.map((r) => ({ ...r, price: Number(r.price) || 0 }))
        const free = rows.find((r) => r.id !== null && r.price === 0)
        const plans = []
        for (const r of rows) {
            if (r.id === null && free) {
                free.count += r.count
                continue
            }
            plans.push(r)
        }
        const byPlan = plans
            .map((r) => ({
                id: r.id,
                name: r.id === null ? 'Gratuito' : r.name,
                price: r.price,
                count: r.count,
                paying: r.paying,
                canceling: r.canceling,
            }))
            .sort((a, b) => a.price - b.price || String(a.name).localeCompare(String(b.name), 'pt-BR'))

        const paying = byPlan.reduce((n, p) => n + p.paying, 0)
        const canceling = byPlan.reduce((n, p) => n + p.canceling, 0)
        const monthlyRevenue = Math.round(byPlan.reduce((sum, p) => sum + p.paying * p.price, 0) * 100) / 100

        res.json({
            users: usersResult.rows[0],
            subscriptions: { paying, canceling, monthlyRevenue },
            usersByPlan: byPlan,
            simulations: simulationsResult.rows[0],
            recentActivity: activityResult.rows,
            suspiciousCount: suspiciousResult.rows[0]?.count || 0,
            generatedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Stats error:', error)
        res.status(500).json({ message: 'Erro ao carregar estatísticas' })
    }
})

// ========== USERS ==========
const crypto = require('crypto')
const { cleanEmail, cleanName, toUserId } = require('../utils/userFields')
const { sendPasswordResetEmail } = require('../utils/email')

// Assinatura do Stripe valendo: a troca de plano tem de passar pelo Stripe
const hasLiveSubscription = (u) => !!u.stripeSubscriptionId && ['active', 'canceling'].includes(u.subscriptionStatus)

router.get('/users', async (req, res) => {
    try {
        const usersResult = await db.query(`
            SELECT u.id, u.name, u.email, u.role, u."isBlocked", u."createdAt", u."planId",
                   u."subscriptionStatus", u."planExpiresAt",
                   (u."stripeSubscriptionId" IS NOT NULL) AS "hasSubscription",
                   p.name AS "planName", ROUND(COALESCE(p.price, 0)::numeric, 2)::float AS "planPrice",
                   (SELECT MAX(s.created_at) FROM user_sessions s WHERE s.user_id = u.id) AS "lastLoginAt"
            FROM users u
            LEFT JOIN plans p ON u."planId" = p.id
            WHERE u."deletedAt" IS NULL
            ORDER BY u."createdAt" DESC, u.id DESC
        `)

        res.json(usersResult.rows.map(u => ({
            ...u,
            isBlocked: Number(u.isBlocked) === 1 || u.isBlocked === true,
            plan: { name: u.planName || 'Gratuito' }
        })))
    } catch (error) {
        console.error('Get users error:', error)
        res.status(500).json({ message: 'Erro ao carregar usuários' })
    }
})

class UserEditError extends Error {
    constructor(status, message, reason) { super(message); this.status = status; this.reason = reason }
}

router.put('/users/:id', async (req, res) => {
    const id = toUserId(req.params.id)
    if (!id) return res.status(404).json({ message: 'Usuário não encontrado' })

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const { isBlocked, planId, role, name, email } = body

    // A senha não é mais definida pelo administrador: ele manda um link para a pessoa
    // criar a própria (o admin nunca fica sabendo a senha de ninguém)
    if (body.newPassword !== undefined) {
        return res.status(400).json({ message: 'O administrador não define senhas. Use "Mandar link de senha nova".', reason: 'password_by_link' })
    }

    // Dados conferidos antes de abrir a transação
    const changes = {}
    if (name !== undefined) {
        const n = cleanName(name)
        if (!n) return res.status(400).json({ message: 'O nome precisa ter de 2 a 80 letras.', field: 'name' })
        changes.name = n
    }
    if (email !== undefined) {
        const e = cleanEmail(email)
        if (!e) return res.status(400).json({ message: 'Digite um e-mail válido.', field: 'email' })
        changes.email = e
    }
    if (isBlocked !== undefined) {
        if (typeof isBlocked !== 'boolean') return res.status(400).json({ message: 'Situação inválida.', field: 'isBlocked' })
        changes.isBlocked = isBlocked
    }
    if (role !== undefined) {
        if (!['USER', 'ADMIN'].includes(role)) return res.status(400).json({ message: 'Papel inválido.', field: 'role' })
        changes.role = role
    }
    if (planId !== undefined) {
        if (planId === null || planId === '') changes.planId = null
        else {
            const pid = toUserId(planId)
            if (!pid) return res.status(400).json({ message: 'Plano inválido.', field: 'planId' })
            changes.planId = pid
        }
    }

    let client
    try {
        client = await pool.connect()
        await client.query('BEGIN')
        // Uma edição de conta por vez: dois admins tirando o acesso um do outro ao mesmo
        // tempo não podem deixar o site sem nenhum administrador
        await client.query('SELECT pg_advisory_xact_lock(7303)')

        const { rows } = await client.query(
            `SELECT id, name, email, role, "isBlocked", "planId", "stripeSubscriptionId", "subscriptionStatus"
             FROM users WHERE id = $1 AND "deletedAt" IS NULL FOR UPDATE`, [id])
        const old = rows[0]
        if (!old) throw new UserEditError(404, 'Usuário não encontrado')
        const oldBlocked = Number(old.isBlocked) === 1 || old.isBlocked === true

        // Só o que mudou de verdade
        if (changes.name === old.name) delete changes.name
        if (changes.email === String(old.email).toLowerCase() && old.email === changes.email) delete changes.email
        if (changes.isBlocked === oldBlocked) delete changes.isBlocked
        if (changes.role === old.role) delete changes.role
        if ('planId' in changes && (changes.planId ?? null) === (old.planId ?? null)) delete changes.planId

        const losesAdmin = old.role === 'ADMIN' && !oldBlocked && (changes.role === 'USER' || changes.isBlocked === true)
        if (id === req.user.id && (changes.role === 'USER' || changes.isBlocked === true)) {
            throw new UserEditError(409, 'Você não pode tirar o seu próprio acesso de administrador nem bloquear a sua conta.', 'self')
        }
        if (losesAdmin) {
            const others = await client.query(
                `SELECT COUNT(*)::int AS n FROM users
                 WHERE role = 'ADMIN' AND "isBlocked" = 0 AND "deletedAt" IS NULL AND id <> $1`, [id])
            if (others.rows[0].n === 0) {
                throw new UserEditError(409, 'Este é o último administrador ativo. Torne outra conta administradora antes.', 'last_admin')
            }
        }

        if ('planId' in changes) {
            if (hasLiveSubscription(old)) {
                throw new UserEditError(409, 'Esta conta paga uma assinatura no Stripe. A troca de plano é feita pela própria pessoa em Planos (ou cancele a assinatura antes).', 'stripe')
            }
            if (changes.planId !== null) {
                const plan = await client.query('SELECT id FROM plans WHERE id = $1', [changes.planId])
                if (!plan.rows[0]) throw new UserEditError(400, 'Plano não encontrado.')
            }
        }

        if (changes.email) {
            const dup = await client.query('SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1', [changes.email, id])
            if (dup.rows[0]) throw new UserEditError(409, 'Este e-mail já é de outra conta.', 'email_taken')
        }

        const keys = Object.keys(changes)
        if (keys.length === 0) {
            await client.query('ROLLBACK')
            return res.json({ message: 'Nada mudou.', changed: [] })
        }

        const sets = []
        const params = []
        const add = (sql, value) => { params.push(value); sets.push(`${sql} = $${params.length}`) }
        if ('name' in changes) add('name', changes.name)
        if ('email' in changes) {
            add('email', changes.email)
            // E-mail novo: o link de senha nova que foi para o endereço antigo deixa de valer
            sets.push('"resetPasswordToken" = NULL', '"resetPasswordExpires" = NULL')
        }
        if ('isBlocked' in changes) add('"isBlocked"', changes.isBlocked ? 1 : 0)
        if ('role' in changes) add('role', changes.role)
        if ('planId' in changes) {
            add('"planId"', changes.planId)
            // Plano dado pelo admin não espera pagamento nem expira por conta de cobrança
            sets.push(`"subscriptionStatus" = CASE WHEN "subscriptionStatus" = 'pending_payment' THEN 'active' ELSE "subscriptionStatus" END`)
        }
        sets.push('"updatedAt" = CURRENT_TIMESTAMP')
        params.push(id)
        await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params)

        let eventType = 'USER_UPDATED'
        if ('isBlocked' in changes) eventType = changes.isBlocked ? 'USER_BLOCKED' : 'USER_UNBLOCKED'
        else if ('role' in changes) eventType = 'USER_ROLE_CHANGED'
        else if ('planId' in changes) eventType = 'USER_PLAN_CHANGED'

        // Registro do que mudou. Nome e e-mail entram só como "mudou" (sem o valor): os
        // registros ficam depois da exclusão da conta e não devem guardar dados pessoais
        const PERSONAL = ['name', 'email']
        const oldValues = {}
        const newValues = {}
        for (const k of keys) {
            oldValues[k] = PERSONAL.includes(k) ? '(alterado)' : (k === 'isBlocked' ? oldBlocked : old[k])
            newValues[k] = PERSONAL.includes(k) ? '(alterado)' : changes[k]
        }
        await client.query(
            `INSERT INTO admin_logs ("userId", action, details) VALUES ($1, 'UPDATE_USER', $2)`,
            [req.user.id, JSON.stringify({ targetUserId: id, changes: newValues })])
        await client.query('COMMIT')

        await auditLogger.log({
            level: 'role' in changes || changes.isBlocked ? 'WARN' : 'INFO',
            event_type: eventType,
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: id },
            changes: { old_value: oldValues, new_value: newValues }
        })

        res.json({ message: 'Conta atualizada.', changed: keys })
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {})
        if (error instanceof UserEditError) {
            return res.status(error.status).json({ message: error.message, ...(error.reason ? { reason: error.reason } : {}) })
        }
        if (error && error.code === '23505') {
            return res.status(409).json({ message: 'Este e-mail já é de outra conta.', reason: 'email_taken' })
        }
        console.error('Update user error:', error)
        res.status(500).json({ message: 'Erro ao atualizar usuário' })
    } finally {
        if (client) client.release()
    }
})

// ========== LINK DE SENHA NOVA (no lugar de o admin definir a senha) ==========
router.post('/users/:id/reset-link', async (req, res) => {
    const id = toUserId(req.params.id)
    if (!id) return res.status(404).json({ message: 'Usuário não encontrado' })
    try {
        const { rows } = await db.query(
            `SELECT id, email, "resetPasswordExpires" FROM users WHERE id = $1 AND "deletedAt" IS NULL`, [id])
        const user = rows[0]
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' })

        // Um link a cada 2 minutos para a mesma conta (o link vale 1 hora)
        const expires = user.resetPasswordExpires ? new Date(user.resetPasswordExpires).getTime() : 0
        if (expires - Date.now() > 58 * 60 * 1000) {
            return res.status(429).json({ message: 'Um link acabou de ser mandado para esta conta. Espere 2 minutos para mandar outro.' })
        }

        const resetToken = crypto.randomBytes(32).toString('hex')
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        await db.query(
            `UPDATE users SET "resetPasswordToken" = $1, "resetPasswordExpires" = $2 WHERE id = $3`,
            [hashedToken, expiresAt, id])

        const sent = await sendPasswordResetEmail(user.email, resetToken)

        await auditLogger.log({
            level: 'INFO',
            event_type: 'ADMIN_PASSWORD_RESET_LINK',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: id },
            metadata: { sent: !!(sent && sent.sent) }
        })

        if (!sent || !sent.sent) {
            // O link não saiu: não deixa um link válido que ninguém recebeu
            await db.query(`UPDATE users SET "resetPasswordToken" = NULL, "resetPasswordExpires" = NULL WHERE id = $1 AND "resetPasswordToken" = $2`, [id, hashedToken])
            return res.status(502).json({ message: `O e-mail não foi enviado. ${sent && sent.message ? sent.message : 'Confira o e-mail do site em Funcionalidades.'}` })
        }
        res.json({ message: `Link mandado para ${user.email}. Vale por 1 hora.` })
    } catch (error) {
        console.error('Admin reset link error:', error)
        res.status(500).json({ message: 'Erro ao mandar o link' })
    }
})

// ========== DELETE USER ==========
router.delete('/users/:id', async (req, res) => {
    const targetUserId = toUserId(req.params.id)
    if (!targetUserId) return res.status(404).json({ message: 'Usuário não encontrado.' })

    // Prevent self-deletion
    if (targetUserId === req.user.id) {
        return res.status(400).json({ message: 'Você não pode excluir sua própria conta de administrador.' })
    }

    let client
    try {
        const userResult = await db.query(
            'SELECT id, name, email, role, "stripeSubscriptionId" FROM users WHERE id = $1 AND "deletedAt" IS NULL',
            [targetUserId]
        )
        const user = userResult.rows[0]
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' })
        }

        if (user.role === 'ADMIN') {
            return res.status(403).json({ message: 'Não é permitido excluir contas de administrador. Tire o acesso de administrador antes.' })
        }

        // Assinatura no Stripe: cancela antes de apagar. Se não der, não apaga — senão a
        // pessoa continuaria sendo cobrada sem ter mais conta
        try {
            await cancelStripeSubscriptionIfActive(user.stripeSubscriptionId)
        } catch (stripeErr) {
            console.warn('Falha ao cancelar assinatura Stripe do usuário:', stripeErr.message)
            return res.status(409).json({
                message: 'Não deu para cancelar a assinatura no Stripe, então a conta não foi excluída. Tente de novo ou cancele a assinatura no painel do Stripe antes.',
                reason: 'stripe'
            })
        }

        client = await pool.connect()
        try {
            await client.query('BEGIN')
            await deleteUserData(client, targetUserId)
            await client.query('COMMIT')
        } catch (txError) {
            await client.query('ROLLBACK')
            throw txError
        }

        // Registro sem nome nem e-mail de quem foi excluído (LGPD): fica o id e um código do e-mail
        await auditLogger.log({
            level: 'WARN',
            event_type: 'USER_DELETED_PERMANENTLY',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: targetUserId },
            metadata: { email_sha256: crypto.createHash('sha256').update(String(user.email).toLowerCase()).digest('hex') }
        })

        res.json({ message: 'Usuário e todos os seus dados foram excluídos permanentemente.' })
    } catch (error) {
        console.error('Delete user error:', error)
        res.status(500).json({ message: 'Erro ao excluir usuário do banco de dados.' })
    } finally {
        if (client) client.release()
    }
})

// ========== RULES ==========
router.get('/rules', async (req, res) => {
    try {
        const rulesResult = await db.query('SELECT * FROM calculation_rules ORDER BY id DESC LIMIT 1')
        const rules = rulesResult.rows[0]
        const year = currentYearBR()
        const effective = meiTax.rulesFor(rules, year)
        // minimumWage: o gravado (vazio = o da lei); "effective" mostra o que o site usa no ano
        res.json({
            ...(rules || { inssPercentage: 5, icmsValue: 1, issValue: 5, employeeCost: 1412 }),
            minimumWage: rules && rules.minimumWage != null ? Number(rules.minimumWage) : null,
            effective: { year, minimumWage: effective.minimumWage, lawMinimumWage: meiTax.lawMinimumWage(year), employeeCost: meiTax.employeeCost(effective) }
        })
    } catch (error) {
        console.error('Get rules error:', error)
        res.status(500).json({ message: 'Erro ao carregar regras' })
    }
})

router.put('/rules', async (req, res) => {
    try {
        const body = req.body || {}
        // Cada valor: número dentro da faixa (dado ruim vira 400, nunca 500 nem DAS errado)
        const field = (name, min, max, { optional = false } = {}) => {
            const v = body[name]
            if (optional && (v === null || v === undefined || v === '')) return { value: null }
            const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
            if (!Number.isFinite(n) || n < min || n > max) return { error: name }
            return { value: Math.round(n * 100) / 100 }
        }
        const checks = {
            inssPercentage: field('inssPercentage', 0, 100),
            icmsValue: field('icmsValue', 0, 1000),
            issValue: field('issValue', 0, 1000),
            minimumWage: field('minimumWage', 500, 100000, { optional: true })
        }
        const bad = Object.values(checks).find(c => c.error)
        if (bad) {
            const labels = { inssPercentage: 'Percentual do INSS (0 a 100)', icmsValue: 'Valor do ICMS (0 a 1.000)', issValue: 'Valor do ISS (0 a 1.000)', minimumWage: 'Salário mínimo (500 a 100.000, ou vazio)' }
            return res.status(400).json({ message: `Confira o campo ${labels[bad.error]}.` })
        }
        const { inssPercentage, icmsValue, issValue, minimumWage } = Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, c.value]))

        const oldResult = await db.query('SELECT * FROM calculation_rules ORDER BY id DESC LIMIT 1')
        const old = oldResult.rows[0] || {}
        // employeeCost: coluna antiga, mantida como estava (o custo agora vem do salário mínimo)
        const employeeCost = old.employeeCost != null ? old.employeeCost : 1412

        await db.query(`
            INSERT INTO calculation_rules ("inssPercentage", "icmsValue", "issValue", "employeeCost", "minimumWage", "updatedBy")
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [inssPercentage, icmsValue, issValue, employeeCost, minimumWage, req.user.id])

        await auditLogger.log({
            level: 'INFO',
            event_type: 'RULES_UPDATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'CALCULATION_RULES' },
            changes: { old_value: old, new_value: { inssPercentage, icmsValue, issValue, minimumWage } }
        })

        await db.query(`
            INSERT INTO admin_logs ("userId", action, details)
            VALUES ($1, 'UPDATE_RULES', $2)
        `, [req.user.id, JSON.stringify({ inssPercentage, icmsValue, issValue, minimumWage })])

        res.json({ message: 'Regras atualizadas com sucesso' })
    } catch (error) {
        console.error('Update rules error:', error)
        res.status(500).json({ message: 'Erro ao atualizar regras' })
    }
})

// ========== LIMITS ==========
// Limite do MEI por ano (LC 238/2026). GET traz o do ano atual (campos de sempre)
// e os anos ao redor; PUT grava o de um ano e as porcentagens de aviso.
const { getMeiLimits, currentYearBR } = require('../utils/meiLimits')
const limitYears = () => { const y = currentYearBR(); return [y - 1, y, y + 1, y + 2] }

router.get('/limits', async (req, res) => {
    try {
        const current = await getMeiLimits()
        const years = []
        for (const year of limitYears()) {
            const l = await getMeiLimits(year)
            years.push({ year, annualLimit: l.annualLimit, source: l.source, lawLimit: l.lawLimit })
        }
        res.json({ ...current, years })
    } catch (error) {
        console.error('Get limits error:', error)
        res.status(500).json({ message: 'Erro ao carregar limites' })
    }
})

router.put('/limits', async (req, res) => {
    try {
        const body = req.body || {}
        const year = body.year === undefined ? currentYearBR() : Number(body.year)
        const annualLimit = Number(body.annualLimit)
        const warningPercentage = Number(body.warningPercentage)
        const dangerPercentage = Number(body.dangerPercentage)
        if (!Number.isInteger(year) || year < 2020 || year > 2100) {
            return res.status(400).json({ message: 'Ano inválido.' })
        }
        if (!Number.isFinite(annualLimit) || annualLimit < 1000 || annualLimit > 10000000) {
            return res.status(400).json({ message: 'O limite anual deve ficar entre R$ 1 mil e R$ 10 milhões.' })
        }
        if (!Number.isFinite(warningPercentage) || !Number.isFinite(dangerPercentage) ||
            warningPercentage < 1 || dangerPercentage > 100 || warningPercentage >= dangerPercentage) {
            return res.status(400).json({ message: 'A atenção (amarelo) deve ser menor que o risco (vermelho), entre 1% e 100%.' })
        }

        const old = await getMeiLimits(year)

        await db.query(`
            INSERT INTO mei_limits (year, "annualLimit", "warningPercentage", "dangerPercentage", "updatedBy")
            VALUES ($1, $2, $3, $4, $5)
        `, [year, annualLimit, warningPercentage, dangerPercentage, req.user.id])

        const value = { year, annualLimit, warningPercentage, dangerPercentage }
        await auditLogger.log({
            level: 'INFO',
            event_type: 'LIMITS_UPDATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'MEI_LIMITS' },
            changes: { old_value: old, new_value: value }
        })

        await db.query(`
            INSERT INTO admin_logs ("userId", action, details)
            VALUES ($1, 'UPDATE_LIMITS', $2)
        `, [req.user.id, JSON.stringify(value)])

        res.json({ message: 'Limites atualizados com sucesso', ...value })
    } catch (error) {
        console.error('Update limits error:', error)
        res.status(500).json({ message: 'Erro ao atualizar limites' })
    }
})

// ========== PLANS ==========
const { FEATURE_KEYS } = require('../utils/planFeatures')
const billing = require('../utils/billing')

class PlanError extends Error {
    constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra }
}
const parseFeatures = (raw) => { try { const f = JSON.parse(raw || '{}'); return f && typeof f === 'object' ? f : {} } catch { return {} } }
const cents = (v) => Math.round(Number(v) * 100)
const brlText = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

// Dados do plano conferidos; só o que veio (edição parcial)
function planInput(body) {
    const out = {}
    if (body.name !== undefined) {
        // eslint-disable-next-line no-control-regex
        const n = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : ''
        if (n.length < 2 || n.length > 30) throw new PlanError(400, 'O nome do plano precisa ter de 2 a 30 letras.', { field: 'name' })
        out.name = n
    }
    if (body.price !== undefined) {
        const v = typeof body.price === 'string' ? Number(body.price.replace(',', '.')) : body.price
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10000) throw new PlanError(400, 'O preço precisa ser de R$ 0 a R$ 10.000 por mês.', { field: 'price' })
        out.price = Math.round(v * 100) / 100
    }
    if (body.stripePriceId !== undefined) {
        const id = body.stripePriceId === null ? '' : String(body.stripePriceId).trim()
        if (id && !/^price_[A-Za-z0-9]{6,80}$/.test(id)) throw new PlanError(400, 'O código do preço no Stripe começa com "price_".', { field: 'stripePriceId' })
        out.stripePriceId = id || null
    }
    if (body.isActive !== undefined) {
        if (typeof body.isActive !== 'boolean') throw new PlanError(400, 'Situação inválida.', { field: 'isActive' })
        out.isActive = body.isActive
    }
    if (body.features !== undefined) {
        const f = body.features
        if (!f || typeof f !== 'object' || Array.isArray(f)) throw new PlanError(400, 'Recursos inválidos.', { field: 'features' })
        const clean = {}
        const unknown = {}
        for (const [k, v] of Object.entries(f)) {
            if (Object.keys(clean).length + Object.keys(unknown).length >= 60) throw new PlanError(400, 'Recursos demais.', { field: 'features' })
            if (FEATURE_KEYS.includes(k)) {
                if (typeof v !== 'boolean') throw new PlanError(400, 'Cada recurso é ligado ou desligado.', { field: 'features' })
                clean[k] = v
            } else {
                unknown[k] = v
            }
        }
        out.features = clean
        // Chave fora da lista: só passa se já estava no plano com o mesmo valor (savePlan confere)
        out.unknownFeatures = unknown
    }
    return out
}

// Preço do plano no Stripe: o que o cliente paga de verdade
async function stripePriceInfo(stripe, priceId) {
    if (!priceId) return { status: 'missing' }
    if (!stripe) return { status: 'unconfigured', priceId }
    try {
        const p = await stripe.prices.retrieve(priceId)
        return {
            status: 'ok',
            priceId,
            amount: typeof p.unit_amount === 'number' ? p.unit_amount / 100 : null,
            currency: p.currency,
            interval: p.recurring ? p.recurring.interval : null,
            intervalCount: p.recurring ? p.recurring.interval_count : null,
            active: !!p.active,
        }
    } catch (err) {
        return { status: err && err.code === 'resource_missing' ? 'not_found' : 'error', priceId }
    }
}

// O que o site mostra tem de ser o que o Stripe cobra (Código de Defesa do Consumidor)
function stripeMismatch(info, price) {
    if (info.status === 'missing') return 'Plano pago precisa do código do preço no Stripe (price_...).'
    if (info.status === 'not_found') return 'Esse código de preço não existe no Stripe. Confira se é do mesmo modo (teste ou real) das chaves do site.'
    if (info.status === 'error') return 'Não deu para conferir o preço no Stripe agora. Tente de novo em alguns minutos.'
    if (info.status !== 'ok') return null
    if (!info.active) return 'Esse preço está arquivado no Stripe. Use um preço ativo.'
    if (info.currency !== 'brl') return 'Esse preço do Stripe não está em reais (BRL).'
    if (info.interval !== 'month' || info.intervalCount !== 1) return 'Esse preço do Stripe não é mensal. O site cobra por mês.'
    if (cents(info.amount) !== cents(price)) return `No Stripe esse preço é ${brlText(info.amount)} por mês, e o site mostraria ${brlText(price)}. Use o mesmo valor ou crie um preço novo no Stripe.`
    return null
}

router.get('/plans', async (req, res) => {
    try {
        const [plansResult, countsResult] = await Promise.all([
            db.query('SELECT * FROM plans ORDER BY price ASC, id ASC'),
            db.query(`
                SELECT COALESCE(u."planId", 0) AS "planId", COUNT(*)::int AS accounts,
                       COUNT(*) FILTER (WHERE u."stripeSubscriptionId" IS NOT NULL AND u."subscriptionStatus" IN ('active', 'canceling'))::int AS paying
                FROM users u WHERE u.role = 'USER' AND u."deletedAt" IS NULL
                GROUP BY COALESCE(u."planId", 0)
            `),
        ])
        const counts = Object.fromEntries(countsResult.rows.map(r => [Number(r.planId), r]))
        const stripe = billing.getStripe()
        const plans = await Promise.all(plansResult.rows.map(async (p) => {
            const price = Math.round(Number(p.price) * 100) / 100
            const priceId = billing.resolvePriceId(p)
            const isFree = price === 0
            return {
                id: p.id,
                name: p.name,
                price,
                isActive: Number(p.isActive) === 1 || p.isActive === true,
                features: parseFeatures(p.features),
                stripePriceId: p.stripePriceId || null,
                priceSource: p.stripePriceId ? 'plano' : (priceId ? 'variavel' : null),
                stripe: isFree ? { status: 'free' } : await stripePriceInfo(stripe, priceId),
                accounts: (counts[p.id]?.accounts || 0) + (isFree ? (counts[0]?.accounts || 0) : 0),
                paying: counts[p.id]?.paying || 0,
            }
        }))
        res.json(plans)
    } catch (error) {
        console.error('Get plans error:', error)
        res.status(500).json({ message: 'Erro ao carregar planos' })
    }
})

// Regras comuns a criar e editar. `old` é o plano antes (null ao criar).
async function checkPlan(next, old, client, priceTouched = true) {
    const others = (await client.query('SELECT id, name, price FROM plans WHERE id <> $1', [old ? old.id : 0])).rows
    if (others.some(o => String(o.name).trim().toLowerCase() === next.name.toLowerCase())) {
        throw new PlanError(409, 'Já existe um plano com esse nome.', { field: 'name' })
    }
    const wasFree = old && Number(old.price) === 0
    if (next.price === 0 && others.some(o => Number(o.price) === 0)) {
        throw new PlanError(409, 'Já existe um plano gratuito. O site usa um só (é para ele que volta quem para de pagar).', { field: 'price' })
    }
    if (wasFree && next.price !== 0) {
        throw new PlanError(409, 'O plano gratuito não pode passar a ser pago: é para ele que volta quem para de pagar. Crie um plano novo.', { field: 'price' })
    }
    if (wasFree && !next.isActive) {
        throw new PlanError(409, 'O plano gratuito não pode ser desativado: é para ele que volta quem para de pagar.', { field: 'isActive' })
    }
    if (old && Number(old.price) > 0 && next.price === 0) {
        const paying = await client.query(
            `SELECT COUNT(*)::int AS n FROM users WHERE "planId" = $1 AND "stripeSubscriptionId" IS NOT NULL AND "subscriptionStatus" IN ('active', 'canceling') AND "deletedAt" IS NULL`, [old.id])
        if (paying.rows[0].n > 0) throw new PlanError(409, 'Há assinaturas pagando este plano no Stripe: ele não pode virar gratuito.', { field: 'price' })
    }
    if (next.price > 0 && priceTouched) {
        const priceId = billing.resolvePriceId({ name: next.name, stripePriceId: next.stripePriceId })
        const stripe = billing.getStripe()
        const info = await stripePriceInfo(stripe, priceId)
        // Sem Stripe no servidor (desenvolvimento local) não dá para conferir: segue
        if (info.status !== 'unconfigured') {
            const problem = stripeMismatch(info, next.price)
            if (problem) throw new PlanError(409, problem, { field: info.status === 'missing' || info.status === 'not_found' ? 'stripePriceId' : 'price', stripe: info })
        }
    }
}

async function savePlan(req, res, id) {
    let client
    try {
        const input = planInput(req.body && typeof req.body === 'object' ? req.body : {})
        client = await pool.connect()
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(7304)')

        let old = null
        if (id) {
            old = (await client.query('SELECT * FROM plans WHERE id = $1 FOR UPDATE', [id])).rows[0]
            if (!old) throw new PlanError(404, 'Plano não encontrado.')
        } else if (input.name === undefined || input.price === undefined) {
            throw new PlanError(400, 'Informe o nome e o preço do plano.')
        }

        const oldFeatures = old ? parseFeatures(old.features) : {}
        for (const [k, v] of Object.entries(input.unknownFeatures || {})) {
            if (!(k in oldFeatures) || JSON.stringify(oldFeatures[k]) !== JSON.stringify(v)) {
                throw new PlanError(400, `Recurso desconhecido: ${String(k).slice(0, 40)}.`, { field: 'features' })
            }
        }
        const next = {
            name: input.name ?? old.name,
            price: input.price ?? Math.round(Number(old.price) * 100) / 100,
            stripePriceId: input.stripePriceId !== undefined ? input.stripePriceId : (old ? old.stripePriceId || null : null),
            isActive: input.isActive ?? (old ? Number(old.isActive) === 1 || old.isActive === true : true),
            // Recursos que o painel não conhece continuam como estavam
            features: { ...oldFeatures, ...(input.features || {}) },
        }
        // O Stripe só é consultado quando algo do preço muda (ligar um recurso não depende dele)
        const oldActive = old ? Number(old.isActive) === 1 || old.isActive === true : false
        const priceTouched = !old
            || cents(next.price) !== cents(old.price)
            || (next.stripePriceId || null) !== (old.stripePriceId || null)
            || next.name !== old.name
            || (next.isActive && !oldActive)
        await checkPlan(next, old, client, priceTouched)

        let planId = id
        if (old) {
            await client.query(`
                UPDATE plans SET name = $1, price = $2, features = $3, "isActive" = $4, "stripePriceId" = $5, "updatedAt" = CURRENT_TIMESTAMP
                WHERE id = $6
            `, [next.name, next.price, JSON.stringify(next.features), next.isActive ? 1 : 0, next.stripePriceId, id])
        } else {
            const r = await client.query(`
                INSERT INTO plans (name, price, features, "isActive", "stripePriceId") VALUES ($1, $2, $3, $4, $5) RETURNING id
            `, [next.name, next.price, JSON.stringify(next.features), next.isActive ? 1 : 0, next.stripePriceId])
            planId = r.rows[0].id
        }
        await client.query('COMMIT')

        await auditLogger.log({
            level: 'INFO',
            event_type: old ? 'PLAN_UPDATED' : 'PLAN_CREATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'PLAN', resource_id: planId },
            changes: {
                old_value: old ? { name: old.name, price: Number(old.price), isActive: Number(old.isActive) === 1, stripePriceId: old.stripePriceId || null, features: oldFeatures } : undefined,
                new_value: next,
            }
        })
        res.json({ id: planId, message: old ? 'Plano atualizado.' : 'Plano criado.' })
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {})
        if (error instanceof PlanError) return res.status(error.status).json({ message: error.message, ...error.extra })
        console.error('Save plan error:', error)
        res.status(500).json({ message: 'Erro ao salvar o plano' })
    } finally {
        if (client) client.release()
    }
}

router.post('/plans', (req, res) => savePlan(req, res, null))
router.put('/plans/:id', (req, res) => {
    const id = toUserId(req.params.id)
    if (!id) return res.status(404).json({ message: 'Plano não encontrado.' })
    return savePlan(req, res, id)
})

// ========== SETTINGS ==========
router.put('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params
        const { value } = req.body

        const oldResult = await db.query('SELECT value FROM system_settings WHERE key = $1', [key])

        await db.query(`
            INSERT INTO system_settings (key, value, "updatedAt")
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = NOW()
        `, [key, value])

        await auditLogger.log({
            level: 'INFO',
            event_type: 'SETTINGS_UPDATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'SYSTEM_SETTINGS', resource_id: key },
            changes: { old_value: oldResult.rows[0]?.value, new_value: value }
        })

        res.json({ message: 'Configuração atualizada' })
    } catch (error) {
        console.error('Update setting error:', error)
        res.status(500).json({ message: 'Erro ao atualizar configuração' })
    }
})

// ========== REPORTS ==========
router.get('/reports', async (req, res) => {
    try {
        const { period } = req.query

        let interval = "INTERVAL '1 month'"
        if (period === 'week') interval = "INTERVAL '7 days'"
        if (period === 'year') interval = "INTERVAL '1 year'"

        const usersByPlanResult = await db.query(`
            SELECT COALESCE(p.name, 'Gratuito') as name, COUNT(*) as count
            FROM users u
            LEFT JOIN plans p ON u."planId" = p.id
            WHERE u.role = 'USER' AND u."deletedAt" IS NULL
            GROUP BY p.name
        `)

        const paidUsersResult = await db.query(`
            SELECT p.name as period, p.price * COUNT(*) as revenue, COUNT(*) as subscriptions
            FROM users u
            JOIN plans p ON u."planId" = p.id
            WHERE p.price > 0 AND u."createdAt" >= NOW() - ${interval}
            GROUP BY p.id, p.name, p.price
        `)

        const newUsersResult = await db.query(`
            SELECT COUNT(*) as count FROM users WHERE "createdAt" >= NOW() - ${interval} AND "deletedAt" IS NULL
        `)

        const totalSimulationsResult = await db.query(`
            SELECT COUNT(*) as count FROM simulations WHERE "createdAt" >= NOW() - ${interval}
        `)

        const paidUsers = paidUsersResult.rows
        const totalRevenue = paidUsers.reduce((sum, p) => sum + p.revenue, 0)
        const newUsersCount = newUsersResult.rows[0].count

        res.json({
            usersByPlan: usersByPlanResult.rows,
            revenueByPeriod: paidUsers,
            totalRevenue,
            newUsers: newUsersCount,
            totalSimulations: totalSimulationsResult.rows[0].count,
            conversionRate: newUsersCount > 0 ? paidUsers.reduce((sum, p) => sum + parseInt(p.subscriptions), 0) / newUsersCount : 0
        })
    } catch (error) {
        console.error('Reports error:', error)
        res.status(500).json({ message: 'Erro ao gerar relatórios' })
    }
})

// ========== AUDIT LOGS ==========

/**
 * GET /api/admin/logs
 * Query params: level, event_type, user_id, search, from, to, page, limit, suspicious
 */
router.get('/logs', async (req, res) => {
    try {
        const {
            level,
            event_type,
            user_id,
            search,
            from,
            to,
            suspicious,
            page = 1,
            limit = 50,
        } = req.query

        const conditions = []
        const params = []
        let idx = 1

        if (level)      { conditions.push(`al.level = $${idx++}`);              params.push(level) }
        if (event_type) { conditions.push(`al.event_type = $${idx++}`);         params.push(event_type) }
        if (user_id)    { conditions.push(`al.user_id = $${idx++}`);            params.push(parseInt(user_id)) }
        if (from)       { conditions.push(`al.timestamp >= $${idx++}`);         params.push(new Date(from)) }
        if (to)         { conditions.push(`al.timestamp <= $${idx++}`);         params.push(new Date(to)) }

        if (suspicious === 'true') {
            conditions.push(`(al.level IN ('WARN','ERROR','CRITICAL') OR al.event_type IN ('CONCURRENT_LOGIN_PREVENTED','USER_LOGIN_FAILED','USER_BLOCKED','USER_LOGIN_BLOCKED'))`)
        }

        if (search) {
            conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR al.event_type ILIKE $${idx} OR al.ip_address ILIKE $${idx})`)
            params.push(`%${search}%`)
            idx++
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        const pageNum  = Math.max(1, parseInt(page))
        const pageSize = Math.min(200, Math.max(1, parseInt(limit)))
        const offset   = (pageNum - 1) * pageSize

        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ${where}`,
            params
        )
        const total = parseInt(countResult.rows[0].total)

        params.push(pageSize)
        params.push(offset)

        const logsResult = await pool.query(`
            SELECT al.id, al.timestamp, al.level, al.event_type,
                   al.user_id, al.user_role, al.ip_address, al.user_agent,
                   al.device_fingerprint, al.resource_type, al.resource_id,
                   al.old_value, al.new_value, al.metadata,
                   u.name as user_name, u.email as user_email
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ${where}
            ORDER BY al.timestamp DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `, params)

        res.json({
            logs:  logsResult.rows,
            total,
            page:  pageNum,
            pages: Math.ceil(total / pageSize),
        })
    } catch (error) {
        console.error('Logs error:', error)
        res.status(500).json({ message: 'Erro ao carregar logs' })
    }
})

/**
 * GET /api/admin/logs/event-types
 * Returns distinct event_types for filter dropdown
 */
router.get('/logs/event-types', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT event_type FROM audit_logs ORDER BY event_type`
        )
        res.json(result.rows.map(r => r.event_type))
    } catch (error) {
        res.status(500).json({ message: 'Erro ao carregar tipos de evento' })
    }
})

/**
 * GET /api/admin/logs/sessions
 * Returns active sessions (for monitoring who is online)
 */
router.get('/logs/sessions', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT us.id, us.user_id, us.ip_address, us.user_agent,
                   us.device_fingerprint, us.created_at, us.last_activity,
                   u.name as user_name, u.email as user_email
            FROM user_sessions us
            LEFT JOIN users u ON us.user_id = u.id
            WHERE us.is_active = 1
            ORDER BY us.last_activity DESC
            LIMIT 100
        `)
        res.json(result.rows)
    } catch (error) {
        res.status(500).json({ message: 'Erro ao carregar sessões' })
    }
})

// ─── Lembretes no WhatsApp (contas vencendo e alertas do MEI) ───────────────

// Última rodada: quando foi, quantos foram e por que falharam (motivo da Meta)
// ========== E-MAIL DO SITE ==========
// Se o SMTP está configurado na Vercel (sem mostrar senha), o último envio e um
// e-mail de teste para o próprio admin (um por minuto).
const mailer = require('../utils/email')

router.get('/email/status', async (req, res) => {
    try {
        const { rows: [row] } = await db.query("SELECT value FROM system_settings WHERE key = 'email_last_status'")
        let last = null
        try { last = row && row.value ? JSON.parse(row.value) : null } catch (_) { last = null }
        res.json({
            configured: mailer.smtpConfigured(),
            host: process.env.SMTP_HOST || null,
            port: process.env.SMTP_HOST ? (Number(process.env.SMTP_PORT) || 587) : null,
            from: mailer.fromAddress(),
            last
        })
    } catch (error) {
        console.error('Email status error:', error)
        res.status(500).json({ message: 'Erro ao ler a situação do e-mail' })
    }
})

router.post('/email/test', async (req, res) => {
    try {
        // Um teste por minuto (vale entre os servidores da Vercel)
        const { rows } = await db.query(`
            INSERT INTO system_settings (key, value, "updatedAt") VALUES ('email_test_at', $1, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = excluded.value, "updatedAt" = CURRENT_TIMESTAMP
            WHERE system_settings."updatedAt" < CURRENT_TIMESTAMP - INTERVAL '1 minute'
            RETURNING key
        `, [new Date().toISOString()])
        if (!rows.length) return res.status(429).json({ message: 'Espere um minuto para mandar outro e-mail de teste.' })

        const result = await mailer.sendTestEmail(req.user.email)
        if (result.sent) return res.json({ message: `E-mail de teste enviado para ${req.user.email}. Confira a caixa de entrada e o spam.` })
        if (result.reason === 'not_configured') {
            return res.status(400).json({ message: 'O envio de e-mails não está configurado na Vercel (SMTP_HOST, SMTP_USER e SMTP_PASS).' })
        }
        res.status(502).json({ message: result.message || 'O serviço de e-mail recusou o envio.' })
    } catch (error) {
        console.error('Email test error:', error)
        res.status(500).json({ message: 'Erro ao mandar o e-mail de teste' })
    }
})

router.get('/whatsapp/reminders', async (req, res) => {
    try {
        const { rows: [row] } = await db.query("SELECT value FROM system_settings WHERE key = 'whatsapp_last_run'")
        let lastRun = null
        try { lastRun = row ? JSON.parse(row.value) : null } catch { lastRun = null }
        res.json({
            lastRun,
            templates: {
                contas: process.env.WHATSAPP_REMINDER_TEMPLATE || 'contas_vencendo_hoje',
                alertas: process.env.WHATSAPP_ALERT_TEMPLATE || 'alerta_mei'
            },
            configured: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
            cronSecret: Boolean(process.env.CRON_SECRET)
        })
    } catch (err) {
        console.error('[admin] lembretes WhatsApp:', err.message)
        res.status(500).json({ message: 'Erro ao buscar os lembretes do WhatsApp' })
    }
})

// Roda agora a rodada do dia (quem já recebeu hoje não recebe de novo)
router.post('/whatsapp/reminders/run', async (req, res) => {
    try {
        const bot = require('../utils/whatsappBot')
        // resend: reenvia as contas de hoje também para quem já foi marcado (o código
        // antigo marcava o dia antes de mandar; se a Meta recusou, o lembrete se perdeu)
        const resend = req.body?.resend === true
        const result = await bot.sendDailyReminders(new Date(), { trigger: 'admin', resend })
        await auditLogger.log({
            event_type: 'WHATSAPP_REMINDERS_RUN',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            metadata: { reenvio: resend, contas: result.sent, alertas: result.alertas?.sent, falhas: (result.failed || 0) + (result.alertas?.failed || 0) }
        }).catch(() => {})
        res.json(result)
    } catch (err) {
        console.error('[admin] rodar lembretes WhatsApp:', err.message)
        res.status(500).json({ message: 'Não deu para rodar os lembretes agora. Tente de novo.' })
    }
})

module.exports = router
