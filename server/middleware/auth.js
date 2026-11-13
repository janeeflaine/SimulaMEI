const { db } = require('../db')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
    console.error('🚨 FATAL: JWT_SECRET não está configurado nas variáveis de ambiente!')
    // In serverless (Vercel), we can't crash the process, but we make operations fail securely
}

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Token não fornecido' })
        }

        const token = authHeader.split(' ')[1]
        const decoded = jwt.verify(token, JWT_SECRET)

        // Check DB for latest status and expiry (Async)
        const result = await db.query(`
            SELECT u.*, p.name as "planName", p.features as "planFeatures"
            FROM users u
            LEFT JOIN plans p ON u."planId" = p.id
            WHERE u.id = $1
        `, [decoded.id])
        const user = result.rows[0]

        if (!user) {
            return res.status(401).json({ message: 'Usuário não encontrado' })
        }

        // Conta excluída ou bloqueada pelo admin: o token antigo para de valer na hora
        if (user.deletedAt) {
            return res.status(401).json({ message: 'Usuário não encontrado' })
        }
        if (Number(user.isBlocked) === 1 || user.isBlocked === true) {
            return res.status(403).json({ message: 'Sua conta está bloqueada. Fale com o suporte.', code: 'ACCOUNT_BLOCKED' })
        }

        // Session version check: if token carries a version number (sv) that no
        // longer matches the DB, the session was invalidated (concurrent login from
        // a new device). Tokens issued before this feature have no sv field → skip.
        if (decoded.sv !== undefined && decoded.sv !== null) {
            const dbSv = user.sessionVersion || 1
            if (Number(decoded.sv) !== Number(dbSv)) {
                return res.status(401).json({
                    message: 'Sessão encerrada. Por favor, faça login novamente.',
                    code: 'SESSION_INVALIDATED'
                })
            }
        }

        // Auto-Downgrade if expired and not actively subscribed
        let finalPlan = user.planName || 'Gratuito'
        let finalPlanId = user.planId ? Number(user.planId) : null
        let isInTrial = user.subscriptionStatus === 'trialing'
        let trialExpired = false

        if (user.planExpiresAt && new Date(user.planExpiresAt) < new Date() && user.subscriptionStatus !== 'active') {
            const freePlanResult = await db.query('SELECT id, name FROM plans WHERE price = 0 LIMIT 1')
            const freePlan = freePlanResult.rows[0]

            if (freePlan && user.planId !== freePlan.id) {
                await db.query(`
                    UPDATE users 
                    SET "planId" = $1, "subscriptionStatus" = 'expired', "planExpiresAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP 
                    WHERE id = $2
                `, [freePlan.id, user.id])

                finalPlan = freePlan.name
                finalPlanId = freePlan.id
                user.subscriptionStatus = 'expired'

                if (isInTrial) {
                    trialExpired = true
                    isInTrial = false
                }
            }
        }

        // Parse planFeatures — if plan was just downgraded, re-fetch the free plan's features
        let planFeatures = {}
        try {
            let raw = user.planFeatures
            if (trialExpired || (finalPlanId && finalPlanId !== Number(user.planId))) {
                // planId was changed in this request; fetch fresh features for the new plan
                const freshPlan = await db.query('SELECT features FROM plans WHERE id = $1', [finalPlanId])
                raw = freshPlan.rows[0]?.features ?? null
            }
            planFeatures = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}
        } catch (_) { planFeatures = {} }

        // Cadastro com plano pago ainda sem pagamento: o plano escolhido fica guardado
        // (para a página de planos cobrar), mas o acesso é o do Gratuito até pagar.
        let pendingPlanId = null
        let pendingPlan = null
        if (user.subscriptionStatus === 'pending_payment' && user.role !== 'ADMIN') {
            const freeResult = await db.query('SELECT id, name, features FROM plans WHERE price = 0 LIMIT 1')
            const free = freeResult.rows[0]
            if (free && Number(free.id) !== Number(finalPlanId)) {
                pendingPlanId = finalPlanId
                pendingPlan = finalPlan
                finalPlanId = Number(free.id)
                finalPlan = free.name
                try {
                    const raw = free.features
                    planFeatures = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}
                } catch (_) { planFeatures = {} }
            }
        }

        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            plan: finalPlan,
            planId: finalPlanId,
            pendingPlanId,
            pendingPlan,
            subscriptionStatus: user.subscriptionStatus,
            planExpiresAt: user.planExpiresAt,
            isInTrial,
            trialExpired,
            planFeatures,
            stripeCustomerId: user.stripeCustomerId,
            // Plano pago comprado pelo Stripe (troca/cancela lá) ou liberado pelo admin
            hasSubscription: !!user.stripeSubscriptionId
        }
        next()
    } catch (error) {
        console.error('Auth Middleware Error:', error)
        return res.status(401).json({ message: 'Token inválido ou expirado' })
    }
}

const adminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Acesso negado. Apenas administradores.' })
    }
    next()
}

const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1]
            const decoded = jwt.verify(token, JWT_SECRET)
            req.user = decoded
        }

        next()
    } catch (error) {
        // Token invalid, but continue without user
        next()
    }
}

const generateToken = (user) => {
    return jwt.sign(
        {
            id:    user.id,
            email: user.email,
            role:  user.role,
            name:  user.name,
            sv:    user.sessionVersion || 1,  // session version for concurrent-login prevention
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    )
}

module.exports = {
    authMiddleware,
    adminMiddleware,
    optionalAuth,
    generateToken,
    JWT_SECRET
}
