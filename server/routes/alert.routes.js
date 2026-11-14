const express = require('express')
const router = express.Router()
const { db, pool } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { featureGuard } = require('../middleware/planGuard')
const { checkUserAlerts, alertStatus, TYPES, DEFAULT_CONFIG } = require('../logic/alert-checker')

// Acesso pelo recurso "alertas" do plano (o admin decide); plano sem os recursos
// configurados cai no Gratuito, como era antes ("disponível para todos os planos").
const alertsGuard = featureGuard('alertas', 1)

const DEFAULT_ALERTS = [
    { type: 'REVENUE_LIMIT', enabled: true },
    { type: 'DAS_EXPIRY', enabled: true },
    { type: 'ANNUAL_DECLARATION', enabled: true }
]

// Faixas aceitas em cada configuração
const CONFIG_RULES = {
    REVENUE_LIMIT: { trigger_at_percentage: { min: 50, max: 100, label: 'A porcentagem do limite deve ser de 50 a 100.' } },
    DAS_EXPIRY: { days_before: { min: 1, max: 15, label: 'Os dias antes do vencimento devem ser de 1 a 15.' } },
    ANNUAL_DECLARATION: {}
}

const alertIdOf = (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null
}

/**
 * Alertas da pessoa, um de cada tipo, criando os que faltam.
 * Roda com trava por pessoa: antes, duas aberturas ao mesmo tempo criavam os três
 * alertas duas vezes. Linhas repetidas de antes da trava ficam no banco, mas só a
 * primeira de cada tipo aparece e é usada.
 */
async function ensureAlerts(userId) {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [7302, userId])
        const { rows } = await client.query('SELECT * FROM user_alerts WHERE "userId" = $1 ORDER BY id ASC', [userId])
        const byType = new Map()
        for (const row of rows) if (TYPES.includes(row.type) && !byType.has(row.type)) byType.set(row.type, row)
        for (const def of DEFAULT_ALERTS) {
            if (byType.has(def.type)) continue
            const { rows: [created] } = await client.query(
                'INSERT INTO user_alerts ("userId", type, enabled, config) VALUES ($1, $2, $3, $4) RETURNING *',
                [userId, def.type, def.enabled, JSON.stringify(DEFAULT_CONFIG[def.type])]
            )
            byType.set(def.type, created)
        }
        await client.query('COMMIT')
        return TYPES.map(t => byType.get(t))
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
    } finally {
        client.release()
    }
}

// GET /api/alerts - os três alertas da pessoa (cria os que faltam)
router.get('/', authMiddleware, alertsGuard, async (req, res) => {
    try {
        res.json(await ensureAlerts(req.user.id))
    } catch (err) {
        console.error('Error fetching alerts:', err)
        res.status(500).json({ message: 'Erro ao buscar alertas' })
    }
})

// GET /api/alerts/status - alertas, faturamento do ano, próximo DAS, declaração e avisos disparados
router.get('/status', authMiddleware, alertsGuard, async (req, res) => {
    try {
        const alerts = await ensureAlerts(req.user.id)
        const status = await alertStatus(req.user.id, alerts)
        res.json({ alerts, ...status })
    } catch (err) {
        console.error('Error fetching alert status:', err)
        res.status(500).json({ message: 'Erro ao buscar a situação dos alertas' })
    }
})

// GET /api/alerts/check - só os avisos disparados (Painel)
router.get('/check', authMiddleware, alertsGuard, async (req, res) => {
    try {
        res.json(await checkUserAlerts(req.user.id))
    } catch (err) {
        console.error('Error manual checking alerts:', err)
        res.status(500).json({ message: 'Erro ao verificar alertas' })
    }
})

// PUT /api/alerts/:id - liga/desliga e muda a configuração (só os campos do tipo, dentro da faixa)
router.put('/:id', authMiddleware, alertsGuard, async (req, res) => {
    const id = alertIdOf(req.params.id)
    if (!id) return res.status(404).json({ message: 'Alerta não encontrado' })
    const { enabled, config } = req.body || {}

    if (enabled !== undefined && typeof enabled !== 'boolean') {
        return res.status(400).json({ message: 'Informe se o alerta fica ligado ou desligado.' })
    }
    if (config !== undefined && (config === null || typeof config !== 'object' || Array.isArray(config))) {
        return res.status(400).json({ message: 'Configuração inválida.' })
    }

    try {
        const { rows: [existing] } = await db.query(
            'SELECT * FROM user_alerts WHERE id = $1 AND "userId" = $2',
            [id, req.user.id]
        )
        if (!existing) return res.status(404).json({ message: 'Alerta não encontrado' })

        let newConfig = existing.config
        if (config !== undefined) {
            const rules = CONFIG_RULES[existing.type] || {}
            const clean = {}
            for (const [key, value] of Object.entries(config)) {
                const rule = rules[key]
                if (!rule) return res.status(400).json({ message: 'Configuração inválida para esse alerta.' })
                const n = Number(value)
                if (typeof value === 'boolean' || !Number.isInteger(n) || n < rule.min || n > rule.max) {
                    return res.status(400).json({ message: rule.label })
                }
                clean[key] = n
            }
            let current = {}
            try { current = JSON.parse(existing.config || '{}') || {} } catch { current = {} }
            newConfig = JSON.stringify({ ...DEFAULT_CONFIG[existing.type], ...current, ...clean })
        }

        const newEnabled = enabled !== undefined ? enabled : existing.enabled
        const { rows: [updated] } = await db.query(
            'UPDATE user_alerts SET enabled = $1, config = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3 AND "userId" = $4 RETURNING *',
            [newEnabled, newConfig, id, req.user.id]
        )
        res.json(updated)
    } catch (err) {
        console.error('Error updating alert:', err)
        res.status(500).json({ message: 'Erro ao atualizar alerta' })
    }
})

module.exports = router
