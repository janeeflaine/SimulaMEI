const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const rateLimit = require('express-rate-limit')
const { db } = require('../db')
const { generateToken } = require('../middleware/auth')
const { sendPasswordResetEmail } = require('../utils/email')

const router = express.Router()

// FIX-4: Rate limiting for auth endpoints (anti brute-force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 attempts per window
    message: { message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
})

// Register
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Nome, email e senha são obrigatórios' })
        }

        // FIX-6: Password policy
        if (password.length < 8) {
            return res.status(400).json({ message: 'A senha deve ter pelo menos 8 caracteres.' })
        }

        // Check if user exists
        const existingResult = await db.query('SELECT id FROM users WHERE email = $1', [email])
        if (existingResult.rows.length > 0) {
            return res.status(400).json({ message: 'Este email já está em uso' })
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10)

        // Find Plan 'Ouro' for the Trial, or fallback to any Free plan
        const goldPlanResult = await db.query("SELECT id FROM plans WHERE name ILIKE '%Ouro%' OR price > 0 ORDER BY price DESC LIMIT 1")
        const freePlanResult = await db.query("SELECT id FROM plans WHERE price = 0 LIMIT 1")

        const goldPlanId = goldPlanResult.rows[0]?.id || 3
        const freePlanId = freePlanResult.rows[0]?.id || 1

        const trialEnabledRes = await db.query("SELECT value FROM system_settings WHERE key = 'trial_enabled'")
        const trialEnabled = trialEnabledRes.rows[0]?.value !== 'false' // Enable by default unless explicitly false

        const initialPlanId = trialEnabled ? goldPlanId : freePlanId
        // Add 30 days expiration if trial enabled
        const planExpiresAt = trialEnabled ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null

        // Create user
        const insertResult = await db.query(`
            INSERT INTO users (name, email, password, "planId", "planExpiresAt", "subscriptionStatus")
            VALUES ($1, $2, $3, $4, $5, 'trialing')
            RETURNING id
        `, [name, email, hashedPassword, initialPlanId, planExpiresAt])

        const userId = insertResult.rows[0].id

        const userResult = await db.query(`
            SELECT u.id, u.name, u.email, u.role, u."planId", p.name as "planName", u."planExpiresAt" 
            FROM users u
            LEFT JOIN plans p ON u."planId" = p.id 
            WHERE u.id = $1
        `, [userId])

        const user = userResult.rows[0]
        const token = generateToken(user)

        res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                plan: user.planName || (trialEnabled ? 'Ouro' : 'Gratuito'),
                planId: user.planId,
                isInTrial: trialEnabled,
                planExpiresAt: user.planExpiresAt
            }
        })
    } catch (error) {
        console.error('Register error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// Login
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ message: 'Email e senha são obrigatórios' })
        }

        // Find user
        const result = await db.query(`
            SELECT u.*, p.name as "planName"
            FROM users u 
            LEFT JOIN plans p ON u."planId" = p.id 
            WHERE u.email = $1 AND u."deletedAt" IS NULL
        `, [email])

        const user = result.rows[0]

        if (!user) {
            return res.status(401).json({ message: 'Email ou senha incorretos' })
        }

        if (user.isBlocked) {
            return res.status(403).json({ message: 'Sua conta está bloqueada. Entre em contato com o suporte.' })
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password)
        if (!validPassword) {
            return res.status(401).json({ message: 'Email ou senha incorretos' })
        }

        const token = generateToken(user)

        // Auto-Downgrade if expired
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

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                plan: finalPlan,
                planId: finalPlanId,
                isInTrial,
                trialExpired,
                planExpiresAt: user.planExpiresAt,
                subscriptionStatus: user.subscriptionStatus
            }
        })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// Forgot Password
router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        // Auto-heal DB schema for Serverless environments (Vercel)
        // Ensures columns exist even if init() hasn't finished migrating them
        try {
            await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordToken" TEXT')
            await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordExpires" TIMESTAMP')
        } catch (migErr) {
            console.log('Ignored auto-heal error:', migErr.message)
        }

        const { email } = req.body

        if (!email) {
            return res.status(400).json({ message: 'Email é obrigatório' })
        }

        const result = await db.query('SELECT id, name FROM users WHERE email = $1 AND "deletedAt" IS NULL', [email])
        const user = result.rows[0]

        // Security: Constant response to prevent email enumeration
        if (!user) {
            await new Promise(resolve => setTimeout(resolve, 500)) // delay simulation
            return res.status(200).json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em breve.' })
        }

        // Generate token
        const resetToken = crypto.randomBytes(32).toString('hex')
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')

        // Set Expiration (1 hour)
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

        await db.query(`
            UPDATE users 
            SET "resetPasswordToken" = $1, "resetPasswordExpires" = $2 
            WHERE id = $3
        `, [hashedToken, expiresAt, user.id])

        await sendPasswordResetEmail(email, resetToken)

        res.status(200).json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em breve.' })
    } catch (error) {
        console.error('Forgot password error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        // Auto-heal schema
        try {
            await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordToken" TEXT')
            await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordExpires" TIMESTAMP')
        } catch (migErr) { }

        const { token, newPassword } = req.body

        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token e nova senha são obrigatórios' })
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

        const result = await db.query(`
            SELECT id FROM users 
            WHERE "resetPasswordToken" = $1 
              AND "resetPasswordExpires" > NOW() 
              AND "deletedAt" IS NULL
        `, [hashedToken])

        const user = result.rows[0]

        if (!user) {
            return res.status(400).json({ message: 'Token de recuperação inválido ou expirado. Solicite novamente.' })
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10)

        await db.query(`
            UPDATE users 
            SET password = $1, "resetPasswordToken" = NULL, "resetPasswordExpires" = NULL 
            WHERE id = $2
        `, [hashedPassword, user.id])

        res.status(200).json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' })
    } catch (error) {
        console.error('Reset password error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// Get Current User
router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
    res.json(req.user)
})

module.exports = router
