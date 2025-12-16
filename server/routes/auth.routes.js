const express = require('express')
const bcrypt = require('bcryptjs')
const { db } = require('../db')
const { generateToken } = require('../middleware/auth')

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

        res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                plan: 'FREE'
            }
        })
    } catch (error) {
        console.error('Register error:', error)
        res.status(500).json({ message: 'Erro ao criar conta' })
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

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                plan: user.planName || 'FREE',
                planId: user.planId
            }
        })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ message: 'Erro ao fazer login' })
    }
})

// Get Current User
router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
    res.json(req.user)
})

module.exports = router
