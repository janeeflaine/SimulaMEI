const express = require('express')
const router = express.Router()
const { db } = require('../db')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')
const { encrypt } = require('../utils/encryption')


// Get Settings (Masked)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT key, value, "isEncrypted", "updatedAt" FROM system_settings')
        const settings = result.rows

        const maskedSettings = settings.map(s => {
            if (s.isEncrypted) {
                return { ...s, value: s.value ? '********' : '' }
            }
            return s
        })

        // Ensure defaults if not present (Virtual rows for UI)
        const expectedKeys = ['MERCADOPAGO_ACCESS_TOKEN', 'trial_enabled', 'trial_days']
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
        const { key, value } = req.body

        if (!key) return res.status(400).json({ message: 'Chave obrigatória' })

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
        `, [key, storedValue, isEncrypted])

        res.json({ success: true })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Erro ao salvar configuração' })
    }
})

module.exports = router
