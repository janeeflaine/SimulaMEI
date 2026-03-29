const { db } = require('../db')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'simulamei-secret-key-change-in-production'

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

        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            plan: finalPlan,
            planId: finalPlanId,
            subscriptionStatus: user.subscriptionStatus,
            planExpiresAt: user.planExpiresAt,
            isInTrial,
            trialExpired
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
        { id: user.id, email: user.email, role: user.role, name: user.name },
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
