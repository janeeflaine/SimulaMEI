const express = require('express')
const router = express.Router()
const { db } = require('../db')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')
const { encrypt } = require('../utils/encryption')
const auditLogger = require('../utils/auditLogger')
const planLimits = require('../utils/planLimits')
const { TRIAL_MAX_DAYS } = require('../utils/trial')

// Chaves que o próprio sistema grava (estado de rotinas): não se editam por aqui
const INTERNAL_KEYS = ['whatsapp_last_run', 'whatsapp_resend_at', 'email_last_status']
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{1,63}$/
// Só estas chaves mudam por aqui: limites dos planos, teste grátis e o token antigo do
// Mercado Pago (guardado cifrado). Qualquer outra chave é recusada: antes dava para
// gravar uma chave nova qualquer, em texto puro e copiada para os registros.
const OTHER_KEYS = ['trial_enabled', 'trial_days', 'trial_plan_id', 'MERCADOPAGO_ACCESS_TOKEN']
const isEditable = (key) => OTHER_KEYS.includes(key) || !!planLimits.parseLimitKey(key)


// Get Settings (Masked)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT key, value, "isEncrypted", "updatedAt" FROM system_settings')
        const settings = result.rows.filter((s) => isEditable(s.key))

        const maskedSettings = settings.map(s => {
            if (s.isEncrypted) {
                return { ...s, value: s.value ? '********' : '' }
            }
            return s
        })

        // Ensure defaults if not present (Virtual rows for UI)
        const expectedKeys = ['MERCADOPAGO_ACCESS_TOKEN', 'trial_enabled', 'trial_days', 'trial_plan_id']
        const keysPresent = maskedSettings.map(s => s.key)

        expectedKeys.forEach(key => {
            if (!keysPresent.includes(key)) {
                maskedSettings.push({ key, value: '', isEncrypted: 1 })
            }
        })

        res.json(maskedSettings)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao carregar configurações' })
    }
})

// Update Setting
router.put('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { key } = req.body || {}
        let { value } = req.body || {}

        if (typeof key !== 'string' || !SAFE_KEY.test(key)) return res.status(400).json({ message: 'Chave inválida' })
        if (INTERNAL_KEYS.includes(key)) return res.status(400).json({ message: 'Esta configuração é gravada pelo próprio sistema.' })
        if (!isEditable(key)) return res.status(400).json({ message: 'Esta configuração não muda por aqui.' })
        if (value !== undefined && value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            return res.status(400).json({ message: 'Valor inválido' })
        }
        if (value !== undefined && value !== null && String(value).length > 2000) return res.status(400).json({ message: 'Valor grande demais' })

        // Limite de plano: mesmo número/ligado que a tela de Funcionalidades aceita
        // (antes "abc" era gravado e virava "sem limite")
        const limit = planLimits.parseLimitKey(key)
        if (limit) {
            const clean = planLimits.cleanLimitValue(limit.def, value)
            if (clean === null) return res.status(400).json({ message: `${limit.def.label}: valor inválido.` })
            value = clean
        }
        if (key === 'trial_days') {
            const days = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
            if (!(typeof days === 'number' && Number.isInteger(days) && days >= 0 && days <= TRIAL_MAX_DAYS)) {
                return res.status(400).json({ message: `Dias de teste: de 0 a ${TRIAL_MAX_DAYS}.` })
            }
            value = String(days)
        }
        // Plano do teste: um plano pago e ativo; vazio = o mais caro (utils/trial.js)
        if (key === 'trial_plan_id') {
            if (value === undefined || value === null || String(value).trim() === '') {
                value = ''
            } else {
                const id = Number(value)
                const { rows } = Number.isInteger(id) && id > 0
                    ? await db.query('SELECT id FROM plans WHERE id = $1 AND "isActive" = 1 AND price > 0', [id])
                    : { rows: [] }
                if (!rows.length) return res.status(400).json({ message: 'Escolha um plano pago e ativo para o teste grátis.' })
                value = String(id)
            }
        }
        if (key === 'trial_enabled' && !['true', 'false'].includes(String(value))) {
            return res.status(400).json({ message: 'Teste grátis: ligado ou desligado.' })
        }
        const old = await db.query('SELECT value, "isEncrypted" FROM system_settings WHERE key = $1', [key])

        let storedValue = value
        let isEncrypted = 0

        // Define sensitive keys
        if (key === 'MERCADOPAGO_ACCESS_TOKEN') {
            if (!value || value === '********') return res.json({ success: true }) // Ignore mask
            isEncrypted = 1
            storedValue = encrypt(value)
        }

        await db.query(`
            INSERT INTO system_settings (key, value, "isEncrypted", "updatedAt")
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            "isEncrypted" = excluded."isEncrypted",
            "updatedAt" = CURRENT_TIMESTAMP
        `, [key, value === undefined || value === null ? null : String(storedValue), isEncrypted])

        await auditLogger.log({
            level: 'INFO',
            event_type: 'SETTINGS_UPDATED',
            actor: { user_id: req.user.id, role: req.user.role },
            context: req.context || {},
            target: { resource_type: 'SYSTEM_SETTINGS', resource_id: key },
            // Valor secreto nunca vai para o registro
            changes: isEncrypted || old.rows[0]?.isEncrypted
                ? { old_value: '(secreto)', new_value: '(secreto)' }
                : { old_value: old.rows[0]?.value ?? null, new_value: String(value ?? '') }
        })

        res.json({ success: true })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao salvar configuração' })
    }
})

module.exports = router
