const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { getAccessToken, upgradeUser, syncPaymentStatus } = require('../utils/payment.utils')

// Verifica a assinatura HMAC-SHA256 do webhook do Mercado Pago (v2).
// Protocolo oficial: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
// Template: "id:[data.id];request-id:[x-request-id];ts:[ts];"
// Retorna true se a assinatura for válida ou se o segredo não estiver configurado (modo mock).
function verifyMercadoPagoSignature(req) {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
    if (!secret) return true // Sem segredo configurado: apenas em desenvolvimento/mock

    const xSignature = req.headers['x-signature']
    const xRequestId = req.headers['x-request-id']
    if (!xSignature || !xRequestId) return false

    // O cabeçalho x-signature tem o formato "ts=<timestamp>,v1=<hash>"
    const parts = {}
    xSignature.split(',').forEach(part => {
        const [k, v] = part.trim().split('=', 2)
        if (k && v) parts[k] = v
    })
    const { ts, v1 } = parts
    if (!ts || !v1) return false

    // Proteção de replay: rejeita notificações com mais de 5 minutos
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - parseInt(ts, 10)) > 300) {
        console.warn('[Webhook/MP] Notificação expirada (replay protection), ts=%s', ts)
        return false
    }

    const dataId = req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || ''
    const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`
    const expected = crypto.createHmac('sha256', secret).update(template).digest('hex')

    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
}

// Modo de teste (Pix falso, sem Mercado Pago) só existe em desenvolvimento e com a
// variável ALLOW_MOCK_PAYMENTS=true. Antes, bastava o token do Mercado Pago não estar
// configurado para qualquer pessoa logada "pagar" o próprio plano pelo /mock-pay.
const mockPaymentsAllowed = () =>
    process.env.ALLOW_MOCK_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production'

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
        if (MOCK_MODE && !mockPaymentsAllowed()) {
            return res.status(503).json({ message: 'Pagamento por Pix indisponível no momento. Assine pelo cartão na página de planos.' })
        }
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
        res.status(500).json({ message: 'Erro ao criar pagamento' })
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
    // Verificar assinatura antes de processar qualquer dado.
    // Sempre retornamos 200 para o MP não reenviar; simplesmente não processamos se inválido.
    if (!verifyMercadoPagoSignature(req)) {
        console.warn('[Webhook/MP] Assinatura inválida — ignorando notificação')
        return res.status(200).send('OK')
    }

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
    try {
        if (!mockPaymentsAllowed()) return res.status(404).json({ message: 'API Route not found' })

        const accessToken = await getAccessToken()
        if (accessToken) return res.status(403).json({ message: 'Only available in Mock Mode (No Access Token Set)' })

        // Só o dono do pagamento, e só pagamento de teste ainda pendente
        const paymentResult = await db.query(
            `SELECT * FROM payments WHERE id = $1 AND "userId" = $2 AND status = 'pending' AND "externalId" LIKE 'mock\\_%'`,
            [req.params.id, req.user.id]
        )
        const payment = paymentResult.rows[0]
        if (!payment) return res.status(404).json({ message: 'Pagamento não encontrado' })

        await db.query("UPDATE payments SET status = 'approved', \"updatedAt\" = CURRENT_TIMESTAMP WHERE id = $1", [payment.id])
        await upgradeUser(payment)

        res.json({ success: true, status: 'approved' })
    } catch (error) {
        console.error('[MockPay] Error:', error)
        res.status(500).json({ message: 'Erro ao simular pagamento' })
    }
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
