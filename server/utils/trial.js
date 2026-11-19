/**
 * trial.js — teste grátis para contas novas (Admin > Funcionalidades > Teste grátis).
 *
 * system_settings:
 *   trial_enabled  'true' | 'false'
 *   trial_days     1 a 90 (0 = desligado)
 *   trial_plan_id  plano pago do teste; vazio = o plano pago mais caro ativo
 *
 * Como funciona (desde 19/11/2026):
 * 1. Cadastro pelo Gratuito com o teste ligado: a conta nasce no Gratuito e recebe por
 *    e-mail um link de confirmação (vale 48 horas). O aparelho do cadastro fica guardado
 *    (só o SHA-256 do identificador técnico do navegador).
 * 2. Ao abrir o link, o e-mail fica confirmado e o teste começa, numa transação só:
 *    reserva o e-mail, reserva o aparelho e muda o plano (tudo ou nada).
 * 3. No fim, o middleware de acesso (e o contexto do WhatsApp) devolve a conta ao
 *    Gratuito, sem cobrança: nenhum cartão é pedido.
 *
 * Um teste por e-mail e um por aparelho:
 * - trial_claims guarda só o SHA-256 do e-mail normalizado: apelidos do mesmo endereço
 *   (ana+1@gmail.com, a.na@gmail.com) contam como o mesmo e-mail.
 * - trial_device_claims guarda só o SHA-256 do identificador do aparelho.
 * Os dois ficam até 2 anos, inclusive depois da exclusão da conta (Política de Privacidade).
 *
 * Antes: o teste começava no cadastro, sem confirmar o e-mail, e qualquer e-mail
 * inventado (ou apelido do mesmo e-mail) ganhava outro teste.
 */
const crypto = require('crypto')

const TRIAL_MAX_DAYS = 90
const KEYS = ['trial_enabled', 'trial_days', 'trial_plan_id']
const CONFIRM_LINK_HOURS = 48
const CLAIM_RETENTION = "interval '2 years'"

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

/** Código do e-mail como era gravado antes (minúsculas, sem espaços nas pontas) */
const emailHash = (email) => sha256(String(email).trim().toLowerCase())

// Provedores em que o ponto no nome não muda a caixa de entrada
const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com'])

/**
 * E-mail na forma que identifica a caixa de entrada, para o teste grátis:
 * minúsculas; sem o "+apelido" (ana+1@ = ana@); no Gmail, sem pontos no nome e
 * googlemail.com = gmail.com. Só para o teste: a conta continua com o e-mail digitado.
 */
function normalizeTrialEmail(email) {
    const value = String(email || '').trim().toLowerCase()
    const at = value.lastIndexOf('@')
    if (at < 1) return value
    let local = value.slice(0, at)
    let domain = value.slice(at + 1)
    local = local.split('+')[0]
    if (DOT_INSENSITIVE.has(domain)) {
        local = local.replace(/\./g, '')
        domain = 'gmail.com'
    }
    return `${local || value.slice(0, at)}@${domain}`
}

/** Códigos que contam como "este e-mail já usou": o novo (normalizado) e o antigo */
const trialEmailHashes = (email) => [...new Set([sha256(normalizeTrialEmail(email)), emailHash(email)])]

/**
 * Código do aparelho (identificador técnico que o site guarda no navegador e manda no
 * cabeçalho X-Device-Fingerprint). Sem identificador, ou com o "fallback-" que o site
 * gera quando o navegador não guarda nada (muda a cada página), não há aparelho: null.
 */
function deviceHash(fingerprint) {
    if (typeof fingerprint !== 'string') return null
    const value = fingerprint.trim()
    if (!/^[A-Za-z0-9-]{8,64}$/.test(value) || value.toLowerCase().startsWith('fallback-')) return null
    return sha256(`device:${value}`)
}

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
 * Este e-mail e este aparelho ainda podem ganhar um teste?
 * { ok: true } ou { ok: false, reason: 'email_used' | 'device_used' | 'no_device' }.
 * Só uma prévia (para não mandar link à toa): quem decide é confirmTrial, na transação.
 */
async function trialEligibility(q, { email, device }) {
    if (!device) return { ok: false, reason: 'no_device' }
    const used = await q.query('SELECT 1 FROM trial_claims WHERE email_hash = ANY($1::text[]) LIMIT 1', [trialEmailHashes(email)])
    if (used.rows && used.rows.length) return { ok: false, reason: 'email_used' }
    const usedDevice = await q.query('SELECT 1 FROM trial_device_claims WHERE device_hash = $1 LIMIT 1', [device])
    if (usedDevice.rows && usedDevice.rows.length) return { ok: false, reason: 'device_used' }
    return { ok: true }
}

/** Link de confirmação novo: { token (vai no e-mail), tokenHash (vai para o banco), expiresAt } */
function newConfirmToken() {
    const token = crypto.randomBytes(32).toString('hex')
    return { token, tokenHash: sha256(token), expiresAt: new Date(Date.now() + CONFIRM_LINK_HOURS * 3600000) }
}

/** Guarda o link de confirmação (e o aparelho do cadastro, se ainda não houver um) */
async function savePendingTrial(q, userId, { tokenHash, expiresAt }, device) {
    await q.query(
        `UPDATE users SET "emailVerifyTokenHash" = $2, "emailVerifyExpiresAt" = $3,
                "trialDeviceHash" = COALESCE("trialDeviceHash", $4), "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId, tokenHash, expiresAt, device]
    )
}

/**
 * Abre o link de confirmação: confirma o e-mail e, se puder, começa o teste.
 * Tudo numa transação: o link só é gasto se a confirmação for gravada, e as reservas
 * de e-mail e aparelho só ficam se o plano mudar (pedidos ao mesmo tempo: o banco
 * deixa só um reservar cada e-mail e cada aparelho).
 *
 * Devolve { status, ... }:
 *   'invalid'    link inexistente, vencido ou já usado (nada muda)
 *   'started'    e-mail confirmado e teste começou ({ endsAt, planName, days })
 *   'trial_off' | 'email_used' | 'device_used' | 'no_device' | 'not_free'
 *                e-mail confirmado, sem teste
 */
async function confirmTrial(pool, token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return { status: 'invalid' }
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const { rows: [user] } = await client.query(
            `UPDATE users
             SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", NOW()),
                 "emailVerifyTokenHash" = NULL, "emailVerifyExpiresAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
             WHERE "emailVerifyTokenHash" = $1 AND "emailVerifyExpiresAt" > NOW() AND "deletedAt" IS NULL
             RETURNING id, email, "trialDeviceHash"`,
            [sha256(token)]
        )
        if (!user) {
            await client.query('ROLLBACK')
            return { status: 'invalid' }
        }
        const done = async (result) => { await client.query('COMMIT'); return { ...result, userId: user.id } }

        const offer = await getTrialOffer(client)
        if (!offer.enabled) return done({ status: 'trial_off' })
        if (!user.trialDeviceHash) return done({ status: 'no_device' })

        const hashes = trialEmailHashes(user.email)
        const used = await client.query('SELECT 1 FROM trial_claims WHERE email_hash = ANY($1::text[]) LIMIT 1', [hashes])
        if (used.rows.length) return done({ status: 'email_used' })

        // Reservas e plano juntos: se um falhar, volta só esta parte (o e-mail continua confirmado)
        await client.query('SAVEPOINT trial')
        const undo = async (status) => { await client.query('ROLLBACK TO SAVEPOINT trial'); return done({ status }) }

        const emailClaim = await client.query(
            'INSERT INTO trial_claims (email_hash) VALUES ($1) ON CONFLICT (email_hash) DO NOTHING RETURNING 1', [hashes[0]])
        if (!emailClaim.rows.length) return undo('email_used')

        const deviceClaim = await client.query(
            'INSERT INTO trial_device_claims (device_hash) VALUES ($1) ON CONFLICT (device_hash) DO NOTHING RETURNING 1', [user.trialDeviceHash])
        if (!deviceClaim.rows.length) return undo('device_used')

        // Só conta no Gratuito, sem assinatura (quem já pagou enquanto o link esperava não perde o plano)
        const { rows: [updated] } = await client.query(
            `UPDATE users
             SET "planId" = $2, "subscriptionStatus" = 'trialing',
                 "planExpiresAt" = NOW() + make_interval(days => $3::int), "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $1 AND "subscriptionStatus" = 'active' AND "stripeSubscriptionId" IS NULL
               AND "planId" IN (SELECT id FROM plans WHERE price = 0)
             RETURNING "planExpiresAt"`,
            [user.id, offer.planId, offer.days]
        )
        if (!updated) return undo('not_free')

        return done({ status: 'started', endsAt: updated.planExpiresAt, planName: offer.planName, days: offer.days })
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
    } finally {
        client.release()
    }
}

/** Os códigos ficam até 2 anos (Política de Privacidade) */
async function purgeOldClaims(q) {
    await q.query(`DELETE FROM trial_claims WHERE "createdAt" < NOW() - ${CLAIM_RETENTION}`)
    await q.query(`DELETE FROM trial_device_claims WHERE "createdAt" < NOW() - ${CLAIM_RETENTION}`)
}

module.exports = {
    getTrialOffer, trialEligibility, newConfirmToken, savePendingTrial, confirmTrial, purgeOldClaims,
    normalizeTrialEmail, trialEmailHashes, emailHash, deviceHash, cleanDays,
    TRIAL_MAX_DAYS, CONFIRM_LINK_HOURS
}
