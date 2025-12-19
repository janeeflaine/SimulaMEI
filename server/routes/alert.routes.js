const express = require('express')
const router = express.Router()
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { checkUserAlerts } = require('../logic/alert-checker')

// Ensure only Ouro plan users can access alerts
const ouroOnly = (req, res, next) => {
    if (req.user.planId !== 3) {
        return res.status(403).json({ message: 'Acesso exclusivo para assinantes do plano Ouro' })
    }
    next()
}

// GET /api/alerts - List all alerts for the user
router.get('/', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM user_alerts WHERE "userId" = $1 ORDER BY id ASC',
            [req.user.id]
        )

        // If no alerts exist for the user yet, initialize them
        if (rows.length === 0) {
            const defaultAlerts = [
                { type: 'REVENUE_LIMIT', enabled: true, config: JSON.stringify({ trigger_at_percentage: 80 }) },
                { type: 'DAS_EXPIRY', enabled: true, config: JSON.stringify({ days_before: 5 }) },
                { type: 'ANNUAL_DECLARATION', enabled: true, config: JSON.stringify({ remind_in_may: true }) }
            ]

            const initializedAlerts = []
            for (const alert of defaultAlerts) {
                const { rows: [newAlert] } = await db.query(
                    'INSERT INTO user_alerts ("userId", type, enabled, config) VALUES ($1, $2, $3, $4) RETURNING *',
                    [req.user.id, alert.type, alert.enabled, alert.config]
                )
                initializedAlerts.push(newAlert)
            }
            return res.json(initializedAlerts)
        }

        res.json(rows)
    } catch (err) {
        console.error('Error fetching alerts:', err)
        res.status(500).json({ message: 'Erro ao buscar alertas' })
    }
})

// GET /api/alerts/check - Run a manual check and return triggered alerts
router.get('/check', authMiddleware, ouroOnly, async (req, res) => {
    try {
        const triggered = await checkUserAlerts(req.user.id)
        res.json(triggered)
    } catch (err) {
        console.error('Error manual checking alerts:', err)
        res.status(500).json({ message: 'Erro ao verificar alertas' })
    }
})

// PUT /api/alerts/:id - Update an alert (toggle enabled or update config)
router.put('/:id', authMiddleware, ouroOnly, async (req, res) => {
    const { id } = req.params
    const { enabled, config } = req.body

    try {
        // Verify alert belongs to user
        const { rows: [existing] } = await db.query(
            'SELECT * FROM user_alerts WHERE id = $1 AND "userId" = $2',
            [id, req.user.id]
        )

        if (!existing) {
            return res.status(404).json({ message: 'Alerta não encontrado' })
        }

        const newEnabled = enabled !== undefined ? enabled : existing.enabled
        const newConfig = config ? JSON.stringify(config) : existing.config

        const { rows: [updated] } = await db.query(
            'UPDATE user_alerts SET enabled = $1, config = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [newEnabled, newConfig, id]
        )

        res.json(updated)
    } catch (err) {
        console.error('Error updating alert:', err)
        res.status(500).json({ message: 'Erro ao atualizar alerta' })
    }
})

module.exports = router
