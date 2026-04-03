const express = require('express')
const router = express.Router()
const stripeEnv = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')

// 1. Create Checkout Session (Protected Route)
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
    try {
        if (!stripeEnv) {
            return res.status(500).json({ message: 'Stripe não está configurado neste servidor.' })
        }

        const { planId } = req.body // ID do plano que o usuário quer assinar

        // Find Plan Stripe Price ID (Assuming we store this somewhere, or hardcode mapping for now)
        // In a real app we'd map plan.id to a Stripe Price ID.
        // For MVP, we rely on the client sending a temporary explicit priceId or mapping them here:
        const planResult = await db.query('SELECT id, name, price, "stripePriceId" FROM plans WHERE id = $1', [planId])
        if (planResult.rowCount === 0) return res.status(404).json({ message: 'Plano não encontrado' })

        const plan = planResult.rows[0]
        const priceId = plan.stripePriceId

        if (!priceId) {
            return res.status(400).json({ message: 'Este plano não está configurado para pagamentos na Stripe.' })
        }

        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
        const domain = process.env.FRONTEND_URL || (isProduction ? 'https://simula-mei.vercel.app' : 'http://localhost:5173')

        const session = await stripeEnv.checkout.sessions.create({
            payment_method_types: ['card', 'boleto'], // Added boleto for BR context
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            customer_email: req.user.email,
            client_reference_id: String(req.user.id), // Link the Stripe Session to our User ID
            success_url: `${domain}/planos?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${domain}/planos?canceled=true`,
            metadata: {
                userId: req.user.id,
                planId: plan.id
            }
        })

        res.json({ id: session.id, url: session.url })

    } catch (err) {
        console.error('Stripe Checkout Error:', err)
        res.status(500).json({ message: 'Erro ao gerar checkout', error: err.message })
    }
})

// 2. Webhook Handler (Exported separately so it can bypass express.json)
const webhookHandler = async (req, res) => {
    if (!stripeEnv) return res.status(200).send('Stripe disabled.')

    const sig = req.headers['stripe-signature']
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

    console.log('--- STRIPE WEBHOOK RECEBIDO ---')
    console.log('Signature presente:', !!sig)
    console.log('Secret presente:', !!endpointSecret)
    console.log('Tipo do req.body:', Buffer.isBuffer(req.body) ? 'Buffer' : typeof req.body)

    let event

    try {
        // req.body is a Buffer here because we will use express.raw() in index.js
        // If Vercel auto-parsed it, this might crash
        event = stripeEnv.webhooks.constructEvent(req.body, sig, endpointSecret)
        console.log('Assinatura Stripe verificada com sucesso! Evento:', event.type)

        // FIX-8: Replay protection — reject events older than 5 minutes
        const eventAge = Math.floor(Date.now() / 1000) - event.created
        if (eventAge > 300) {
            console.warn(`⚠️ Webhook rejeitado: evento com ${eventAge}s de idade (limite: 300s)`)
            return res.status(400).send('Webhook rejected: event too old (possible replay)')
        }
    } catch (err) {
        console.error('🚨 FALHA NA VERIFICAÇÃO DO WEBHOOK STRIPE 🚨')
        console.error('Erro:', err.message)

        // Se o body não for Buffer, significa que a Vercel engoliu a formatação RAW
        if (!Buffer.isBuffer(req.body)) {
            console.error('Motivo provável: A Vercel converteu o raw body em Objeto JSON de forma não autorizada, quebrando a criptografia da assinatura.')
        }

        return res.status(400).send(`Webhook Error: ${err.message}`)
    }

    try {
        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed':
                {
                    const session = event.data.object
                    const userId = session.client_reference_id
                    const customerId = session.customer
                    const subscriptionId = session.subscription
                    const planId = session.metadata.planId

                    if (userId) {
                        await db.query(`
                            UPDATE users 
                            SET "stripeCustomerId" = $1, 
                                "stripeSubscriptionId" = $2, 
                                "planId" = $3,
                                "subscriptionStatus" = 'active',
                                "planExpiresAt" = NULL
                            WHERE id = $4
                        `, [customerId, subscriptionId, planId, userId])
                        console.log(`User ${userId} successfully subscribed via Checkout!`)
                    }
                }
                break;

            case 'invoice.payment_failed':
            case 'customer.subscription.deleted':
            case 'customer.subscription.paused':
                {
                    const subscription = event.data.object
                    const subId = subscription.id || subscription.subscription

                    // Rebaixar o usuário de volta para o plano Grátis
                    const freePlanResult = await db.query('SELECT id FROM plans WHERE price = 0 LIMIT 1')
                    const freePlanId = freePlanResult.rows[0]?.id || 1

                    await db.query(`
                        UPDATE users 
                        SET "subscriptionStatus" = 'expired', 
                            "planId" = $1 
                        WHERE "stripeSubscriptionId" = $2
                    `, [freePlanId, subId])
                    console.log(`Subscription ${subId} canceled/failed. User downgraded.`)
                }
                break;

            case 'customer.subscription.updated':
                {
                    const subscription = event.data.object
                    if (subscription.status === 'active' || subscription.status === 'trialing') {
                        await db.query(`
                            UPDATE users 
                            SET "subscriptionStatus" = 'active'
                            WHERE "stripeSubscriptionId" = $1
                        `, [subscription.id])
                    }
                }
                break;

            default:
                console.log(`Unhandled event type ${event.type}`)
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
