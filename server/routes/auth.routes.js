const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { db } = require('../db')
const { generateToken } = require('../middleware/auth')
const { sendPasswordResetEmail } = require('../utils/email')

const router = express.Router()

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Nome, email e senha são obrigatórios' })
        }

        // Check if user exists
        const existingResult = await db.query('SELECT id FROM users WHERE email = $1', [email])
        if (existingResult.rows.length > 0) {
            return res.status(400).json({ message: 'Este email já está em uso' })
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10)

        // Get free plan
        const planResult = await db.query("SELECT id FROM plans WHERE price = 0 LIMIT 1")
        const freePlanId = planResult.rows[0]?.id || null

        // Create user
        const insertResult = await db.query(`
            INSERT INTO users (name, email, password, "planId")
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [name, email, hashedPassword, freePlanId])

        const userId = insertResult.rows[0].id

        const userResult = await db.query('SELECT id, name, email, role, "planId" FROM users WHERE id = $1', [userId])
        const user = userResult.rows[0]

        const token = generateToken(user)

        // Trial Logic for New Registration
        const trialEnabledRes = await db.query("SELECT value FROM system_settings WHERE key = 'trial_enabled'")
        const trialEnabled = trialEnabledRes.rows[0]?.value === 'true'
        const finalPlan = trialEnabled ? 'Ouro' : 'Gratuito'
        const finalPlanId = trialEnabled ? 3 : freePlanId

        res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                plan: finalPlan,
                planId: finalPlanId,
                isInTrial: trialEnabled
            }
        })
    } catch (error) {
        console.error('Register error:', error)
        res.status(500).json({ message: 'Erro ao criar conta', error: error.message })
    }
})

// Login
router.post('/login', async (req, res) => {
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

        // Trial Logic
        let finalPlan = user.planName || 'Gratuito'
        let isInTrial = false
        let trialExpired = false

        if (finalPlan === 'Gratuito') {
            const trialEnabledRes = await db.query("SELECT value FROM system_settings WHERE key = 'trial_enabled'")
            const trialDaysRes = await db.query("SELECT value FROM system_settings WHERE key = 'trial_days'")

            const trialEnabled = trialEnabledRes.rows[0]?.value === 'true'
            const trialDays = parseInt(trialDaysRes.rows[0]?.value || '0')

            if (trialEnabled && trialDays > 0) {
                const createdAt = new Date(user.createdAt)
                const now = new Date()
                const diffTime = Math.abs(now - createdAt)
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

                if (diffDays <= trialDays) {
                    finalPlan = 'Ouro'
                    isInTrial = true
                } else if (diffDays > trialDays && diffDays <= trialDays + 1) {
                    // Just expired, can be used for a one-time notification
                    trialExpired = true
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
                planId: isInTrial ? 3 : user.planId, // 3 is Ouro
                isInTrial,
                trialExpired
            }
        })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ message: 'Erro ao fazer login', error: error.message })
    }
})

// Forgot Password
router.post('/forgot-password', async (req, res) => {
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
        res.status(500).json({ message: 'Erro ao processar solicitação', error: error.message })
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
        res.status(500).json({ message: 'Erro ao redefinir a senha', error: error.message })
    }
})

// Get Current User
router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
    res.json(req.user)
})

module.exports = router
