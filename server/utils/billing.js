/**
 * billing.js — Regras de cobrança das assinaturas no Stripe.
 *
 * Decisões do dono (12/11/2026):
 *  - Cancelar: o cliente mantém o plano até o fim do período já pago e não há
 *    nova cobrança (cancel_at_period_end). Assinatura que nunca foi paga
 *    (pendente/incompleta) é cancelada na hora.
 *  - Trocar para um plano mais caro: libera na hora e o Stripe cobra a
 *    diferença proporcional dos dias que faltam (always_invoice).
 *  - Trocar para um plano mais barato: troca na hora e a diferença proporcional
 *    vira crédito na próxima fatura (create_prorations).
 */
const { db } = require('../db')

// Assinatura que ainda vale (e pode ser trocada ou cancelada no fim do período)
const LIVE_STATUSES = ['active', 'trialing', 'past_due']

const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) return null
    return require('stripe')(key)
}

/** Price ID do Stripe do plano: o cadastrado no plano ou o da variável de ambiente. */
function resolvePriceId(plan) {
    if (!plan) return null
    if (plan.stripePriceId) return plan.stripePriceId
    const name = String(plan.name || '').toLowerCase()
    if (name.includes('ouro')) return process.env.STRIPE_PRICE_GOLD || null
    if (name.includes('prata')) return process.env.STRIPE_PRICE_SILVER || null
    return null
}

/** Plano do site que corresponde a um Price ID do Stripe (null se nenhum). */
async function planIdForPrice(priceId) {
    if (!priceId) return null
    const { rows } = await db.query('SELECT id, name, "stripePriceId" FROM plans WHERE price > 0')
    const plan = rows.find(p => resolvePriceId(p) === priceId)
    return plan ? plan.id : null
}

/**
 * Fim do período já pago, em segundos (Unix). Nas versões novas da API do
 * Stripe o campo fica nos itens da assinatura; nas antigas, na assinatura.
 */
function periodEnd(subscription) {
    if (!subscription) return null
    return subscription.cancel_at
        || subscription.current_period_end
        || subscription.items?.data?.[0]?.current_period_end
        || null
}

const toDate = (unixSeconds) => (unixSeconds ? new Date(unixSeconds * 1000) : null)

/** Assinatura do usuário no Stripe, se ainda estiver valendo; senão null. */
async function getLiveSubscription(stripe, subscriptionId) {
    if (!stripe || !subscriptionId) return null
    try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        return LIVE_STATUSES.includes(subscription.status) ? subscription : null
    } catch (err) {
        if (err && err.code === 'resource_missing') return null
        throw err
    }
}

module.exports = { LIVE_STATUSES, getStripe, resolvePriceId, planIdForPrice, periodEnd, toDate, getLiveSubscription }
