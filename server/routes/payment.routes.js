const express = require('express')
const router = express.Router()
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { getAccessToken, upgradeUser, syncPaymentStatus } = require('../utils/payment.utils')

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

        const protocol = req.headers['x-forwarded-proto'] || req.protocol
        const host = req.get('host')
        const baseUrl = process.env.BASE_URL || `${protocol}://${host}`

        const payment_data = {
            transaction_amount: plan.price,
            description: `Upgrade para Plano ${plan.name}`,
            payment_method_id: 'pix',
            payer: {
                email: req.user.email,
                first_name: req.user.name.split(' ')[0],
                last_name: req.user.name.split(' ').slice(1).join(' ') || 'User'
            },
            notification_url: `${baseUrl}/api/payments/webhook`
        }

        console.log(`[Payment] Creating MP payment. Notification URL: ${payment_data.notification_url}`)

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

// Sync Latest Pending Payment
router.get('/sync-latest', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id

        // Find latest pending payment
        const result = await db.query(`
            SELECT * FROM payments 
            WHERE "userId" = $1 AND status = 'pending' 
            ORDER BY "createdAt" DESC LIMIT 1
        `, [userId])

        const payment = result.rows[0]

        if (!payment) {
            return res.json({ status: 'no_pending_payments' })
        }

        const status = await syncPaymentStatus(payment)
        res.json({ paymentId: payment.id, status })
    } catch (error) {
        console.error('[SyncLatest] Error:', error)
        res.status(500).json({ message: 'Erro ao sincronizar pagamento' })
    }
})

// Webhook (Public)
router.post('/webhook', async (req, res) => {
    // Mercado Pago can send data in query or body
    const topic = req.query.topic || req.query.type || (req.body && req.body.type)
    const id = req.query.id || req.query['data.id'] || (req.body && req.body.data && req.body.data.id)

    const accessToken = await getAccessToken()

    console.log(`[Webhook] Received: topic=${topic}, id=${id}`)

    // Only process if we have a token (otherwise it's mock or misconfigured)
    // Accept 'payment' or 'payment.updated' / 'payment.created'
    if (accessToken && (topic === 'payment' || (topic && topic.startsWith('payment'))) && id) {
        try {
            const client = new MercadoPagoConfig({ accessToken: accessToken })
            const paymentClient = new Payment(client)

            // Check status with MP
            const mpPayment = await paymentClient.get({ id })
            const status = mpPayment.status
            const externalId = mpPayment.id.toString()

            console.log(`[Webhook] MP Payment ${externalId} status: ${status}`)

            // Update DB
            const dbPaymentResult = await db.query('SELECT * FROM payments WHERE "externalId" = $1', [externalId])
            const dbPayment = dbPaymentResult.rows[0]

            if (dbPayment) {
                if (dbPayment.status !== status) {
                    await db.query('UPDATE payments SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [status, dbPayment.id])
                    console.log(`[Webhook] DB Updated: Payment ${dbPayment.id} -> ${status}`)
                }

                // If approved, upgrade user plan (if not already done)
                if (status === 'approved') {
                    await upgradeUser(dbPayment)
                }
            } else {
                console.warn(`[Webhook] Payment with externalId ${externalId} not found in database.`)
            }
        } catch (error) {
            console.error('[Webhook] Error processing notification:', error.message)
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
        const payment = paymentResult.rows[0]

        if (!payment) {
            return res.status(404).json({ message: 'Pagamento não encontrado' })
        }

        if (payment.status === 'pending') {
            payment.status = await syncPaymentStatus(payment)
        }

        res.json(payment)
    } catch (error) {
        console.error('[Status] Error checking status:', error)
        res.status(500).json({ message: 'Erro ao verificar status' })
    }
})

module.exports = router
