const express = require('express')
const router = express.Router()
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { decrypt } = require('../utils/encryption')

// Helper: Get Access Token from DB or Env
// Now Async because PG queries are always async
const getAccessToken = async () => {
    try {
        const result = await db.query("SELECT value, \"isEncrypted\" FROM system_settings WHERE key = 'MERCADOPAGO_ACCESS_TOKEN'")
        const setting = result.rows[0]

        if (setting && setting.value && setting.value !== '********') {
            return setting.isEncrypted ? decrypt(setting.value) : setting.value
        }
    } catch (e) {
        console.error('Error fetching settings:', e)
    }
    return process.env.MERCADOPAGO_ACCESS_TOKEN
}

// Helper: Upgrade User Plan
const upgradeUser = async (dbPayment) => {
    try {
        const userResult = await db.query('SELECT "planExpiresAt" FROM users WHERE id = $1', [dbPayment.userId])
        const user = userResult.rows[0]

        let expiresAt = new Date()

        // If plan is already active and future, extend it
        if (user && user.planExpiresAt && new Date(user.planExpiresAt) > new Date()) {
            expiresAt = new Date(user.planExpiresAt)
        }

        expiresAt.setDate(expiresAt.getDate() + 30) // Add 30 days

        await db.query(`
            UPDATE users 
            SET "planId" = $1, "subscriptionStatus" = 'active', "planExpiresAt" = $2, "updatedAt" = CURRENT_TIMESTAMP 
            WHERE id = $3
        `, [dbPayment.planId, expiresAt.toISOString(), dbPayment.userId])

        console.log(`✅ User ${dbPayment.userId} upgraded to plan ${dbPayment.planId} until ${expiresAt.toISOString()}`)
        return true
    } catch (error) {
        console.error('Error upgrading user:', error)
        return false
    }
}

// Create Payment
router.post('/create', authMiddleware, async (req, res) => {
    try {
        const { planId } = req.body
        const userId = req.user.id
        const accessToken = await getAccessToken()
        const MOCK_MODE = !accessToken

        // 1. Get Plan Details (Secure)
        const planResult = await db.query('SELECT * FROM plans WHERE id = $1', [planId])
        const plan = planResult.rows[0]

        if (!plan) return res.status(404).json({ message: 'Plano não encontrado' })

        if (plan.price <= 0) return res.status(400).json({ message: 'Plano gratuito não requer pagamento' })

        // 2. Mock Mode Logic
        if (MOCK_MODE) {
            const mockPaymentId = `mock_${Date.now()}`
            const qrCode = "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5913Cicrano de Tal6008Brasilia62070503***6304E2CA"
            const qrCodeBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" // 1x1 pixel for mock

            // Save pending payment
            const insert = await db.query(`
                INSERT INTO payments ("userId", "externalId", amount, status, "planId", "qrCode", "qrCodeBase64")
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `, [userId, mockPaymentId, plan.price, 'pending', planId, qrCode, qrCodeBase64])

            return res.json({
                paymentId: insert.rows[0].id,
                qrCode,
                qrCodeBase64,
                status: 'pending',
                mock: true
            })
        }

        // 3. Mercado Pago Logic
        const client = new MercadoPagoConfig({ accessToken: accessToken })
        const paymentClient = new Payment(client)

        const payment_data = {
            transaction_amount: plan.price,
            description: `Upgrade para Plano ${plan.name}`,
            payment_method_id: 'pix',
            payer: {
                email: req.user.email,
                first_name: req.user.name.split(' ')[0],
                last_name: req.user.name.split(' ').slice(1).join(' ') || 'User'
            },
            notification_url: `${process.env.BASE_URL || 'https://your-domain.com'}/api/payments/webhook`
        }

        const mpPayment = await paymentClient.create({ body: payment_data })

        const paymentId = mpPayment.id.toString()
        const qrCode = mpPayment.point_of_interaction.transaction_data.qr_code
        const qrCodeBase64 = mpPayment.point_of_interaction.transaction_data.qr_code_base64

        const insert = await db.query(`
            INSERT INTO payments ("userId", "externalId", amount, status, "planId", "qrCode", "qrCodeBase64")
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [userId, paymentId, plan.price, 'pending', planId, qrCode, qrCodeBase64])

        res.json({
            paymentId: insert.rows[0].id,
            qrCode,
            qrCodeBase64,
            status: 'pending'
        })

    } catch (error) {
        console.error('Payment creation error:', error)
        res.status(500).json({ message: 'Erro ao criar pagamento', error: error.message, stack: error.stack })
    }
})

// Webhook (Public)
router.post('/webhook', async (req, res) => {
    const topic = req.query.topic || req.query.type
    const id = req.query.id || req.query['data.id']

    const accessToken = await getAccessToken()

    // Only process if we have a token (otherwise it's mock or misconfigured)
    if (accessToken && topic === 'payment' && id) {
        try {
            const client = new MercadoPagoConfig({ accessToken: accessToken })
            const paymentClient = new Payment(client)

            // Check status with MP
            const mpPayment = await paymentClient.get({ id })
            const status = mpPayment.status
            const externalId = mpPayment.id.toString()

            // Update DB
            const dbPaymentResult = await db.query('SELECT * FROM payments WHERE "externalId" = $1', [externalId])
            const dbPayment = dbPaymentResult.rows[0]

            if (dbPayment && dbPayment.status !== 'approved') {
                await db.query('UPDATE payments SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [status, dbPayment.id])

                // If approved, upgrade user plan
                if (status === 'approved') {
                    await upgradeUser(dbPayment)
                }
            }
        } catch (error) {
            console.error('Webhook error:', error)
        }
    }

    res.status(200).send('OK')
})

// MOCK: Simulate Webhook (Dev only)
router.post('/:id/mock-pay', authMiddleware, async (req, res) => {
    const accessToken = await getAccessToken()
    if (accessToken) return res.status(403).json({ message: 'Only available in Mock Mode (No Access Token Set)' })

    const paymentId = req.params.id

    // Update Payment
    await db.query("UPDATE payments SET status = 'approved', \"updatedAt\" = CURRENT_TIMESTAMP WHERE id = $1", [paymentId])

    // Get Payment to upgrade user
    const paymentResult = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId])
    const payment = paymentResult.rows[0]

    if (payment) {
        await upgradeUser(payment)
    }

    res.json({ success: true, status: 'approved' })
})

// Check Status (With Sync)
router.get('/:id/status', authMiddleware, async (req, res) => {
    try {
        const paymentId = req.params.id
        const userId = req.user.id

        const paymentResult = await db.query('SELECT * FROM payments WHERE id = $1 AND "userId" = $2', [paymentId, userId])
        const payment = paymentResult.rows[0] // Use let if modifying? No, payment is const.

        if (!payment) return res.status(404).json({ message: 'Pagamento não encontrado' })

        // If pending, check with MP (Sync)
        if (payment.status === 'pending') {
            const accessToken = await getAccessToken()

            if (accessToken && payment.externalId && !payment.externalId.startsWith('mock_')) {
                try {
                    const client = new MercadoPagoConfig({ accessToken: accessToken })
                    const paymentClient = new Payment(client)

                    const mpPayment = await paymentClient.get({ id: payment.externalId })
                    const status = mpPayment.status

                    if (status !== payment.status) {
                        // Update DB
                        await db.query('UPDATE payments SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [status, paymentId])

                        payment.status = status // Update local object for response

                        // Upgrade if approved
                        if (status === 'approved') {
                            await upgradeUser(payment)
                        }
                    }
                } catch (mpError) {
                    console.error('MP Sync Error:', mpError)
                }
            }
        }

        res.json(payment)
    } catch (error) {
        console.error('Status check error:', error)
        res.status(500).json({ message: 'Erro ao verificar status' })
    }
})

module.exports = router
