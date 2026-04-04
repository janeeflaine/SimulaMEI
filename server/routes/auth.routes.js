const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const rateLimit = require('express-rate-limit')
const { db, pool } = require('../db')
const { generateToken } = require('../middleware/auth')
const { sendPasswordResetEmail } = require('../utils/email')
const auditLogger = require('../utils/auditLogger')

const router = express.Router()

// FIX-4: Rate limiting for auth endpoints (anti brute-force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 attempts per window
    message: { message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
})

// ─── Session helpers ──────────────────────────────────────────────────────────

/**
 * Handle concurrent session detection.
 * If the user is logging in from a new device fingerprint or different IP,
 * increment sessionVersion to invalidate all previous tokens, then create
 * a fresh session record.
 * Returns the updated sessionVersion.
 */
async function handleSession(userId, context) {
    const { ip_address, user_agent, device_fingerprint } = context || {}

    // Look for the most recent active session
    const prevSession = await pool.query(
        `SELECT ip_address, device_fingerprint FROM user_sessions
         WHERE user_id = $1 AND is_active = 1
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
    )

    const prev = prevSession.rows[0]

    const isDifferentDevice = prev && device_fingerprint && prev.device_fingerprint &&
        prev.device_fingerprint !== device_fingerprint

    const isDifferentIp = prev && ip_address && prev.ip_address &&
        prev.ip_address !== ip_address && !device_fingerprint

    if (isDifferentDevice || isDifferentIp) {
        // Increment session version — all existing JWTs become invalid
        await pool.query(
            `UPDATE users SET "sessionVersion" = COALESCE("sessionVersion", 1) + 1 WHERE id = $1`,
            [userId]
        )

        // Invalidate previous sessions
        await pool.query(
            `UPDATE user_sessions SET is_active = 0, invalidated_at = NOW() WHERE user_id = $1`,
            [userId]
        )

        await auditLogger.log({
            level: 'WARN',
            event_type: 'CONCURRENT_LOGIN_PREVENTED',
            actor: { user_id: userId },
            context,
            metadata: {
                previous_ip:          prev.ip_address,
                previous_fingerprint: prev.device_fingerprint,
                new_ip:               ip_address,
                new_fingerprint:      device_fingerprint,
            }
        })
    } else {
        // Same device — just invalidate old sessions (clean rotation)
        await pool.query(
            `UPDATE user_sessions SET is_active = 0, invalidated_at = NOW() WHERE user_id = $1`,
            [userId]
        )
    }

    // Create new session record
    await pool.query(
        `INSERT INTO user_sessions (user_id, ip_address, user_agent, device_fingerprint)
         VALUES ($1, $2, $3, $4)`,
        [userId, ip_address || null, user_agent ? user_agent.substring(0, 512) : null, device_fingerprint || null]
    )

    // Return fresh sessionVersion
    const svResult = await pool.query(
        `SELECT "sessionVersion" FROM users WHERE id = $1`,
        [userId]
    )
    return svResult.rows[0]?.sessionVersion || 1
}

// ─── Register ─────────────────────────────────────────────────────────────────

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
        const trialEnabled = trialEnabledRes.rows[0]?.value !== 'false'

        const initialPlanId = trialEnabled ? goldPlanId : freePlanId
        const planExpiresAt = trialEnabled ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null

        // Create user
        const insertResult = await db.query(`
            INSERT INTO users (name, email, password, "planId", "planExpiresAt", "subscriptionStatus")
            VALUES ($1, $2, $3, $4, $5, 'trialing')
            RETURNING id
        `, [name, email, hashedPassword, initialPlanId, planExpiresAt])

        const userId = insertResult.rows[0].id

        const userResult = await db.query(`
            SELECT u.id, u.name, u.email, u.role, u."planId", u."sessionVersion",
                   p.name as "planName", p.features as "planFeatures", u."planExpiresAt"
            FROM users u
            LEFT JOIN plans p ON u."planId" = p.id
            WHERE u.id = $1
        `, [userId])

        const user = userResult.rows[0]

        // Create session
        const sessionVersion = await handleSession(userId, req.context || {})

        const token = generateToken({ ...user, sessionVersion })
        let planFeatures = {}
        try { planFeatures = user.planFeatures ? (typeof user.planFeatures === 'string' ? JSON.parse(user.planFeatures) : user.planFeatures) : {} } catch (_) {}

        await auditLogger.log({
            level: 'INFO',
            event_type: 'USER_REGISTER',
            actor: { user_id: userId, role: 'USER' },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: userId },
            metadata: { name, email, planId: initialPlanId, trialEnabled }
        })

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
                planExpiresAt: user.planExpiresAt,
                planFeatures
            }
        })
    } catch (error) {
        console.error('Register error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// ─── Login ────────────────────────────────────────────────────────────────────

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
            await auditLogger.log({
                level: 'WARN',
                event_type: 'USER_LOGIN_FAILED',
                actor: {},
                context: req.context || {},
                metadata: { email, reason: 'user_not_found' }
            })
            return res.status(401).json({ message: 'Email ou senha incorretos' })
        }

        if (user.isBlocked) {
            await auditLogger.log({
                level: 'WARN',
                event_type: 'USER_LOGIN_BLOCKED',
                actor: { user_id: user.id, role: user.role },
                context: req.context || {},
                metadata: { email }
            })
            return res.status(403).json({ message: 'Sua conta está bloqueada. Entre em contato com o suporte.' })
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password)
        if (!validPassword) {
            await auditLogger.log({
                level: 'WARN',
                event_type: 'USER_LOGIN_FAILED',
                actor: { user_id: user.id, role: user.role },
                context: req.context || {},
                metadata: { email, reason: 'wrong_password' }
            })
            return res.status(401).json({ message: 'Email ou senha incorretos' })
        }

        // Handle session (concurrent login detection)
        const sessionVersion = await handleSession(user.id, req.context || {})

        const token = generateToken({ ...user, sessionVersion })

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

        let planFeatures = {}
        try { planFeatures = user.planFeatures ? (typeof user.planFeatures === 'string' ? JSON.parse(user.planFeatures) : user.planFeatures) : {} } catch (_) {}

        await auditLogger.log({
            level: 'INFO',
            event_type: 'USER_LOGIN_SUCCESS',
            actor: { user_id: user.id, role: user.role },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: user.id },
            metadata: { plan: finalPlan, sessionVersion }
        })

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
                subscriptionStatus: user.subscriptionStatus,
                planFeatures
            }
        })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// ─── Forgot Password ──────────────────────────────────────────────────────────

router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        // Auto-heal DB schema for Serverless environments (Vercel)
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
            await new Promise(resolve => setTimeout(resolve, 500))
            return res.status(200).json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em breve.' })
        }

        // Generate token
        const resetToken = crypto.randomBytes(32).toString('hex')
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

        await db.query(`
            UPDATE users
            SET "resetPasswordToken" = $1, "resetPasswordExpires" = $2
            WHERE id = $3
        `, [hashedToken, expiresAt, user.id])

        await sendPasswordResetEmail(email, resetToken)

        await auditLogger.log({
            level: 'INFO',
            event_type: 'PASSWORD_RESET_REQUESTED',
            actor: { user_id: user.id },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: user.id }
        })

        res.status(200).json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em breve.' })
    } catch (error) {
        console.error('Forgot password error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// ─── Reset Password ───────────────────────────────────────────────────────────

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

        // Increment sessionVersion to invalidate all existing tokens
        await db.query(`
            UPDATE users
            SET password = $1, "resetPasswordToken" = NULL, "resetPasswordExpires" = NULL,
                "sessionVersion" = COALESCE("sessionVersion", 1) + 1
            WHERE id = $2
        `, [hashedPassword, user.id])

        // Invalidate all active sessions
        await pool.query(
            `UPDATE user_sessions SET is_active = 0, invalidated_at = NOW() WHERE user_id = $1`,
            [user.id]
        )

        await auditLogger.log({
            level: 'INFO',
            event_type: 'PASSWORD_RESET_COMPLETED',
            actor: { user_id: user.id },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: user.id }
        })

        res.status(200).json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' })
    } catch (error) {
        console.error('Reset password error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// ─── Get Current User ─────────────────────────────────────────────────────────

router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
    res.json(req.user)
})

module.exports = router
