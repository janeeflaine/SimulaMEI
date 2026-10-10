const express = require('express')
const router = express.Router()
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')

const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) return null
    return require('stripe')(key)
}

// 1. Create Checkout Session (Protected Route)
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe()
        if (!stripe) {
            return res.status(500).json({ message: 'Stripe não está configurado neste servidor.' })
        }

        const { planId } = req.body // ID do plano que o usuário quer assinar
        if (!planId) {
            return res.status(400).json({ message: 'O ID do plano é obrigatório.' })
        }

        const planResult = await db.query('SELECT id, name, price, "stripePriceId" FROM plans WHERE id = $1', [planId])
        if (planResult.rowCount === 0) return res.status(404).json({ message: 'Plano não encontrado' })

        const plan = planResult.rows[0]
        if (Number(plan.price) <= 0) {
            return res.status(400).json({ message: 'Plano gratuito não requer pagamento.' })
        }

        let priceId = plan.stripePriceId
        if (!priceId) {
            if (plan.name.toLowerCase().includes('ouro')) priceId = process.env.STRIPE_PRICE_GOLD
            else if (plan.name.toLowerCase().includes('prata')) priceId = process.env.STRIPE_PRICE_SILVER
        }

        if (!priceId) {
            return res.status(400).json({ message: 'Este plano não possui um Price ID configurado na Stripe.' })
        }

        // Dynamically resolve domain
        const origin = req.headers.origin || req.headers.referer
        let domain = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://simula-mei.vercel.app' : 'http://localhost:5173')
        if (origin) {
            try {
                const parsed = new URL(origin)
                domain = `${parsed.protocol}//${parsed.host}`
            } catch (_) {}
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'boleto', 'pix'],
            payment_method_options: {
                pix: {
                    expires_after_seconds: 3600 // 1 hour expiration for Pix
                }
            },
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            ...(req.user.stripeCustomerId ? { customer: req.user.stripeCustomerId } : { customer_email: req.user.email }),
            client_reference_id: String(req.user.id),
            success_url: `${domain}/planos?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${domain}/planos?canceled=true`,
            metadata: {
                userId: String(req.user.id),
                planId: String(plan.id)
            }
        })

        res.json({ id: session.id, url: session.url })

    } catch (err) {
        console.error('Stripe Checkout Error:', err)
        res.status(500).json({ message: 'Erro ao gerar checkout', error: err.message })
    }
})

// 2. Verify Session directly (Guarantees immediate activation after checkout return)
router.get('/verify-session', authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe()
        if (!stripe) {
            return res.status(500).json({ message: 'Stripe não está configurado neste servidor.' })
        }

        const { session_id } = req.query
        if (!session_id) {
            return res.status(400).json({ message: 'session_id é obrigatório' })
        }

        const session = await stripe.checkout.sessions.retrieve(session_id)
        if (!session) {
            return res.status(404).json({ message: 'Sessão Stripe não encontrada' })
        }

        const userId = session.client_reference_id || session.metadata?.userId || req.user.id
        const planId = session.metadata?.planId

        // Active if payment status is paid OR session status is complete
        const isPaid = session.payment_status === 'paid' || session.status === 'complete'

        if (isPaid && planId) {
            await db.query(`
                UPDATE users 
                SET "stripeCustomerId" = $1, 
                    "stripeSubscriptionId" = $2, 
                    "planId" = $3,
                    "subscriptionStatus" = 'active',
                    "planExpiresAt" = NULL,
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [session.customer, session.subscription, planId, userId])

            const planRes = await db.query('SELECT name FROM plans WHERE id = $1', [planId])
            const planName = planRes.rows[0]?.name || 'Premium'

            return res.json({
                verified: true,
                status: 'active',
                planId,
                planName,
                paymentStatus: session.payment_status,
                message: 'Pagamento confirmado e plano ativado com sucesso!'
            })
        }

        return res.json({
            verified: false,
            status: session.payment_status || 'pending',
            message: 'Pagamento pendente de processamento pelo Stripe.'
        })
    } catch (err) {
        console.error('Stripe verify-session error:', err)
        res.status(500).json({ message: 'Erro ao verificar sessão', error: err.message })
    }
})

// 3. Webhook Handler
const webhookHandler = async (req, res) => {
    const stripe = getStripe()
    if (!stripe) return res.status(200).send('Stripe disabled.')

    const sig = req.headers['stripe-signature']
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

    console.log('--- STRIPE WEBHOOK RECEBIDO ---')
    console.log('Signature presente:', !!sig)
    console.log('Secret presente:', !!endpointSecret)
    console.log('Tipo do req.body:', Buffer.isBuffer(req.body) ? 'Buffer' : typeof req.body)

    let event

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret)
        console.log('Assinatura Stripe verificada com sucesso! Evento:', event.type)

        // Replay protection — reject events older than 5 minutes
        const eventAge = Math.floor(Date.now() / 1000) - event.created
        if (eventAge > 300) {
            console.warn(`⚠️ Webhook rejeitado: evento com ${eventAge}s de idade (limite: 300s)`)
            return res.status(400).send('Webhook rejected: event too old (possible replay)')
        }
    } catch (err) {
        console.error('🚨 FALHA NA VERIFICAÇÃO DO WEBHOOK STRIPE 🚨', err.message)
        return res.status(400).send(`Webhook Error: ${err.message}`)
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                {
                    const session = event.data.object
                    const userId = session.client_reference_id || session.metadata?.userId
                    const customerId = session.customer
                    const subscriptionId = session.subscription
                    const planId = session.metadata?.planId

                    // Only activate if paid (for instant card or async pix that succeeded)
                    if (userId && planId && (session.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded')) {
                        await db.query(`
                            UPDATE users 
                            SET "stripeCustomerId" = $1, 
                                "stripeSubscriptionId" = $2, 
                                "planId" = $3,
                                "subscriptionStatus" = 'active',
                                "planExpiresAt" = NULL,
                                "updatedAt" = CURRENT_TIMESTAMP
                            WHERE id = $4
                        `, [customerId, subscriptionId, planId, userId])
                        console.log(`User ${userId} successfully subscribed via Stripe (${event.type})!`)
                    }
                }
                break;

            case 'checkout.session.async_payment_failed':
            case 'invoice.payment_failed':
            case 'customer.subscription.deleted':
            case 'customer.subscription.paused':
                {
                    const obj = event.data.object
                    const subId = obj.id || obj.subscription

                    const freePlanResult = await db.query('SELECT id FROM plans WHERE price = 0 LIMIT 1')
                    const freePlanId = freePlanResult.rows[0]?.id || 1

                    if (subId) {
                        await db.query(`
                            UPDATE users 
                            SET "subscriptionStatus" = 'expired', 
                                "planId" = $1,
                                "updatedAt" = CURRENT_TIMESTAMP
                            WHERE "stripeSubscriptionId" = $2
                        `, [freePlanId, subId])
                        console.log(`Subscription ${subId} canceled/failed. User downgraded.`)
                    }
                }
                break;

            case 'customer.subscription.updated':
                {
                    const subscription = event.data.object
                    if (subscription.status === 'active' || subscription.status === 'trialing') {
                        await db.query(`
                            UPDATE users 
                            SET "subscriptionStatus" = 'active',
                                "updatedAt" = CURRENT_TIMESTAMP
                            WHERE "stripeSubscriptionId" = $1
                        `, [subscription.id])
                    }
                }
                break;

            default:
                console.log(`Unhandled Stripe event type: ${event.type}`)
        }

        res.status(200).json({ received: true })
    } catch (err) {
        console.error('Error processing webhook:', err)
        res.status(500).json({ error: 'Webhook handler failed' })
    }
}

module.exports = {
    router,
    webhookHandler
}
