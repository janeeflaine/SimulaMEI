/**
 * trial.js — teste grátis para contas novas (Admin > Funcionalidades > Teste grátis).
 *
 * system_settings:
 *   trial_enabled  'true' | 'false'
 *   trial_days     1 a 90 (0 = desligado)
 *   trial_plan_id  plano pago do teste; vazio = o plano pago mais caro ativo
 *
 * A conta nova fica no plano do teste com "subscriptionStatus" = 'trialing' e
 * "planExpiresAt" = fim do teste. No fim, o middleware de acesso (e o contexto do
 * WhatsApp) a devolvem ao Gratuito, sem cobrança: nenhum cartão é pedido.
 *
 * Um teste por e-mail: trial_claims guarda só o SHA-256 do e-mail (nunca o e-mail),
 * para quem exclui a conta e cria de novo com o mesmo e-mail não ganhar outro teste.
 */
const crypto = require('crypto')

const TRIAL_MAX_DAYS = 90
const KEYS = ['trial_enabled', 'trial_days', 'trial_plan_id']

const emailHash = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex')

/** Dias válidos (1 a 90) ou 0 */
function cleanDays(value) {
    const n = Number(value)
    return Number.isInteger(n) && n >= 1 && n <= TRIAL_MAX_DAYS ? n : 0
}

/**
 * Oferta de teste grátis em vigor: { enabled, days, planId, planName }.
 * Qualquer configuração inválida (plano inexistente, gratuito, inativo, dias fora da faixa)
 * desliga a oferta em vez de dar erro.
 */
async function getTrialOffer(q) {
    const off = { enabled: false, days: 0, planId: null, planName: null }
    const settings = await q.query('SELECT key, value FROM system_settings WHERE key = ANY($1::text[])', [KEYS])
    const map = Object.fromEntries((settings.rows || []).map(r => [r.key, r.value]))
    if (String(map.trial_enabled) !== 'true') return off
    const days = cleanDays(map.trial_days)
    if (!days) return off

    const plans = await q.query('SELECT id, name, price FROM plans WHERE "isActive" = 1 AND price > 0 ORDER BY price DESC, id DESC')
    const paid = plans.rows || []
    if (!paid.length) return off
    const wanted = Number(map.trial_plan_id)
    const plan = (Number.isInteger(wanted) && wanted > 0 && paid.find(p => Number(p.id) === wanted)) || paid[0]
    return { enabled: true, days, planId: Number(plan.id), planName: plan.name }
}

/**
 * Põe a conta recém-criada no teste, se este e-mail ainda não usou um.
 * Uma instrução só: reserva o e-mail e muda o plano juntos (tudo ou nada).
 * Devolve o fim do teste (Date) ou null.
 */
async function startTrial(q, userId, email, offer) {
    if (!offer || !offer.enabled) return null
    // Os códigos ficam até 2 anos (Política de Privacidade)
    await q.query(`DELETE FROM trial_claims WHERE "createdAt" < NOW() - interval '2 years'`)
    const { rows } = await q.query(`
        WITH claim AS (
            INSERT INTO trial_claims (email_hash) VALUES ($2)
            ON CONFLICT (email_hash) DO NOTHING
            RETURNING 1
        )
        UPDATE users
        SET "planId" = $3, "subscriptionStatus" = 'trialing',
            "planExpiresAt" = NOW() + make_interval(days => $4::int), "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1 AND "subscriptionStatus" = 'active' AND EXISTS (SELECT 1 FROM claim)
        RETURNING "planExpiresAt"
    `, [userId, emailHash(email), offer.planId, offer.days])
    return rows && rows[0] ? rows[0].planExpiresAt : null
}

module.exports = { getTrialOffer, startTrial, emailHash, cleanDays, TRIAL_MAX_DAYS }
