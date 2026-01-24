const express = require('express')
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

// Get all active plans (public)
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM plans WHERE "isActive" = 1 ORDER BY price ASC')
        res.json(result.rows.map(p => ({ ...p, features: JSON.parse(p.features || '{}') })))
    } catch (error) {
        console.error('Get plans error:', error)
        res.status(500).json({ message: 'Erro ao carregar planos' })
    }
})

// Downgrade Plan (Cancel Subscription)
router.post('/downgrade', authMiddleware, async (req, res) => {
    try {
        const freePlanResult = await db.query('SELECT id FROM plans WHERE price = 0')
        const freePlan = freePlanResult.rows[0]

        if (!freePlan) return res.status(500).json({ message: 'Plano gratuito não encontrado' })

        await db.query(`
            UPDATE users 
            SET "planId" = $1, "subscriptionStatus" = 'canceled', "planExpiresAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP 
            WHERE id = $2
        `, [freePlan.id, req.user.id])

        res.json({ message: 'Plano cancelado com sucesso. Você voltou para o plano gratuito.' })
    } catch (error) {
        console.error('Downgrade error:', error)
        res.status(500).json({ message: 'Erro ao cancelar plano' })
    }
})

module.exports = router
