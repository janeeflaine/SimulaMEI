const express = require('express')
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { getStripe, periodEnd, toDate } = require('../utils/billing')

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

const moveToFreePlan = (freePlanId, userId) => db.query(`
    UPDATE users
    SET "planId" = $1, "subscriptionStatus" = 'canceled', "planExpiresAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = $2
`, [freePlanId, userId])

// Downgrade Plan (Cancel Subscription)
// Com assinatura paga no Stripe: cancela de verdade lá. Se já foi paga, o cliente
// fica no plano até o fim do período (sem nova cobrança); se nunca foi paga, cancela na hora.
router.post('/downgrade', authMiddleware, async (req, res) => {
    try {
        const freePlanResult = await db.query('SELECT id FROM plans WHERE price = 0')
        const freePlan = freePlanResult.rows[0]

        if (!freePlan) return res.status(500).json({ message: 'Plano gratuito não encontrado' })

        const { rows: [user] } = await db.query('SELECT "stripeSubscriptionId" FROM users WHERE id = $1', [req.user.id])
        const subscriptionId = user?.stripeSubscriptionId

        if (!subscriptionId) {
            // Plano sem cobrança no Stripe (definido pelo admin ou teste): volta ao gratuito na hora
            await moveToFreePlan(freePlan.id, req.user.id)
            return res.json({ endsNow: true, message: 'Plano cancelado com sucesso. Você voltou para o plano gratuito.' })
        }

        const stripe = getStripe()
        if (!stripe) {
            // Sem Stripe não dá para garantir que a cobrança parou: não muda nada
            return res.status(500).json({ message: 'Não foi possível cancelar a cobrança agora. Nada foi alterado; tente de novo mais tarde.' })
        }

        let subscription = null
        try {
            subscription = await stripe.subscriptions.retrieve(subscriptionId)
        } catch (err) {
            if (!(err && err.code === 'resource_missing')) throw err
        }

        if (subscription && ['active', 'trialing'].includes(subscription.status)) {
            const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
            const endsAt = toDate(periodEnd(updated) || periodEnd(subscription))
            await db.query(`
                UPDATE users
                SET "subscriptionStatus" = 'canceling', "planExpiresAt" = $1, "updatedAt" = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [endsAt, req.user.id])
            const until = endsAt ? endsAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null
            return res.json({
                endsNow: false,
                endsAt,
                message: until
                    ? `Assinatura cancelada. Você continua com o plano até ${until} e não haverá nova cobrança.`
                    : 'Assinatura cancelada. Você continua com o plano até o fim do período pago e não haverá nova cobrança.'
            })
        }

        // Pendente, incompleta ou com pagamento atrasado: cancela já e volta ao gratuito
        if (subscription && !['canceled', 'incomplete_expired'].includes(subscription.status)) {
            await stripe.subscriptions.cancel(subscriptionId)
        }
        await moveToFreePlan(freePlan.id, req.user.id)
        res.json({ endsNow: true, message: 'Plano cancelado com sucesso. Você voltou para o plano gratuito.' })
    } catch (error) {
        console.error('Downgrade error:', error)
        res.status(500).json({ message: 'Erro ao cancelar plano. Nada foi alterado; tente de novo.' })
    }
})

module.exports = router
