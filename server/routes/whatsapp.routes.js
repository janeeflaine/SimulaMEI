/**
 * whatsapp.routes.js — Canal WhatsApp (WhatsApp Cloud API).
 *
 *   GET    /api/whatsapp/webhook                verificação do webhook pela Meta
 *   POST   /api/whatsapp/webhook                mensagens recebidas (montado com corpo bruto no app)
 *   GET    /api/whatsapp/status                 números vinculados, carteiras e limite do plano
 *   POST   /api/whatsapp/link-code              gera código de vínculo com as carteiras padrão do número
 *   PUT    /api/whatsapp/settings               liga/desliga o lembrete diário (de um número ou de todos)
 *   DELETE /api/whatsapp/link/:id               desconecta um número
 *   DELETE /api/whatsapp/link                   desconecta todos os números da conta
 *   GET    /api/whatsapp/cron/daily-reminders   lembrete diário (Vercel Cron, CRON_SECRET)
 */
const express = require('express')
const crypto = require('crypto')
const router = express.Router()
const { db } = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { featureGuard } = require('../middleware/planGuard')
const { hasFeature, maxWhatsappNumbers } = require('../utils/financeActions')
const { verifySignature } = require('../utils/whatsappClient')
const bot = require('../utils/whatsappBot')
const { runInBackground } = require('../utils/background')

const businessNumber = () => String(process.env.WHATSAPP_PUBLIC_NUMBER || '').replace(/\D/g, '')

const maskPhone = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '')
    if (digits.length < 4) return null
    return `•••• ${digits.slice(-4)}`
}

const safeEqual = (a, b) => {
    const left = Buffer.from(String(a || ''))
    const right = Buffer.from(String(b || ''))
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right)
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && safeEqual(token, process.env.WHATSAPP_VERIFY_TOKEN)) {
        return res.status(200).type('text/plain').send(String(challenge || ''))
    }
    return res.sendStatus(403)
})

/**
 * Recebe as mensagens. Precisa do corpo bruto (express.raw) para validar a
 * assinatura, por isso é montado no app antes do express.json(), como o Stripe.
 * Responde 200 na hora e processa em segundo plano.
 */
const webhookHandler = (req, res) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET
    if (!appSecret) {
        console.error('[whatsapp] WHATSAPP_APP_SECRET não configurado')
        return res.sendStatus(500)
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body : null
    if (!rawBody || !verifySignature(rawBody, req.get('x-hub-signature-256'), appSecret)) {
        return res.sendStatus(401)
    }
    let payload
    try {
        payload = JSON.parse(rawBody.toString('utf8'))
    } catch (_) {
        return res.sendStatus(400)
    }
    runInBackground(bot.handleWebhookPayload(payload), 'whatsapp-webhook')
    return res.sendStatus(200)
}

// ─── Área do usuário ─────────────────────────────────────────────────────────

const countLinks = async (userId) => {
    const { rows: [row] } = await db.query('SELECT COUNT(*)::int AS count FROM whatsapp_links WHERE "userId" = $1', [userId])
    return row ? Number(row.count) : 0
}

router.get('/status', authMiddleware, async (req, res) => {
    try {
        const { rows: links } = await db.query(
            `SELECT l.id, l.phone, l."reminderEnabled", l."optInAt",
                    pw.id AS "personalWalletId", pw.name AS "personalWalletName",
                    bw.id AS "businessWalletId", bw.name AS "businessWalletName"
             FROM whatsapp_links l
             LEFT JOIN business_units pw ON pw.id = l."personalWalletId" AND pw."ownerId" = l."userId"
             LEFT JOIN business_units bw ON bw.id = l."businessWalletId" AND bw."ownerId" = l."userId"
             WHERE l."userId" = $1
             ORDER BY l."optInAt" ASC, l.id ASC`,
            [req.user.id]
        )
        const { rows: wallets } = await db.query(
            `SELECT id, name, "account_type" AS "accountType" FROM business_units
             WHERE "ownerId" = $1 ORDER BY "createdAt" ASC NULLS LAST, id ASC`,
            [req.user.id]
        )
        const number = businessNumber()
        const max = await maxWhatsappNumbers(req.user)
        const items = links.map(l => ({
            id: l.id,
            phone: maskPhone(l.phone),
            reminderEnabled: !!l.reminderEnabled,
            linkedAt: l.optInAt,
            personalWallet: l.personalWalletId ? { id: l.personalWalletId, name: l.personalWalletName } : null,
            businessWallet: l.businessWalletId ? { id: l.businessWalletId, name: l.businessWalletName } : null
        }))
        res.json({
            available: hasFeature(req.user, 'whatsapp'),
            mediaAvailable: hasFeature(req.user, 'whatsapp_midia'),
            maxNumbers: Number.isFinite(max) ? max : null, // null = ilimitado
            links: items,
            wallets: wallets.map(w => ({ id: w.id, name: w.name, accountType: w.accountType })),
            // Campos do primeiro número, mantidos para telas antigas
            linked: items.length > 0,
            phone: items[0] ? items[0].phone : null,
            reminderEnabled: items[0] ? items[0].reminderEnabled : false,
            linkedAt: items[0] ? items[0].linkedAt : null,
            businessNumber: number || null
        })
    } catch (err) {
        console.error('[whatsapp] status:', err.message)
        res.status(500).json({ message: 'Erro ao consultar o WhatsApp' })
    }
})

router.post('/link-code', authMiddleware, featureGuard('whatsapp', 2), async (req, res) => {
    try {
        const max = await maxWhatsappNumbers(req.user)
        if (await countLinks(req.user.id) >= max) {
            return res.status(403).json({
                message: `Seu plano permite ${max} número(s) de WhatsApp. Desconecte um para conectar outro ou veja os planos.`
            })
        }
        const { personalWalletId, businessWalletId } = req.body || {}
        const { code, expiresAt } = await bot.createLinkCode(req.user.id, { personalWalletId, businessWalletId })
        const number = businessNumber()
        const message = `VINCULAR ${code}`
        res.json({
            code,
            message,
            expiresAt,
            waLink: number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null
        })
    } catch (err) {
        console.error('[whatsapp] link-code:', err.message)
        res.status(500).json({ message: 'Erro ao gerar o código' })
    }
})

router.put('/settings', authMiddleware, async (req, res) => {
    const { reminderEnabled, linkId } = req.body || {}
    if (typeof reminderEnabled !== 'boolean') {
        return res.status(400).json({ message: 'reminderEnabled deve ser true ou false' })
    }
    const hasLinkId = linkId !== undefined && linkId !== null
    const id = hasLinkId ? parseInt(linkId, 10) : null
    if (hasLinkId && !Number.isInteger(id)) {
        return res.status(400).json({ message: 'linkId inválido' })
    }
    try {
        // Com linkId altera só aquele número; sem linkId, todos os números da conta
        const { rows: [link] } = hasLinkId
            ? await db.query(
                'UPDATE whatsapp_links SET "reminderEnabled" = $3 WHERE "userId" = $1 AND id = $2 RETURNING "reminderEnabled"',
                [req.user.id, id, reminderEnabled])
            : await db.query(
                'UPDATE whatsapp_links SET "reminderEnabled" = $2 WHERE "userId" = $1 RETURNING "reminderEnabled"',
                [req.user.id, reminderEnabled])
        if (!link) return res.status(404).json({ message: 'Nenhum WhatsApp conectado' })
        res.json({ reminderEnabled: !!link.reminderEnabled })
    } catch (err) {
        console.error('[whatsapp] settings:', err.message)
        res.status(500).json({ message: 'Erro ao salvar' })
    }
})

router.delete('/link/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Número inválido' })
    try {
        const { rowCount } = await db.query('DELETE FROM whatsapp_links WHERE id = $1 AND "userId" = $2', [id, req.user.id])
        if (!rowCount) return res.status(404).json({ message: 'Número não encontrado' })
        res.json({ removed: true })
    } catch (err) {
        console.error('[whatsapp] unlink:', err.message)
        res.status(500).json({ message: 'Erro ao desconectar' })
    }
})

router.delete('/link', authMiddleware, async (req, res) => {
    try {
        await db.query('DELETE FROM whatsapp_link_codes WHERE "userId" = $1', [req.user.id])
        await db.query('DELETE FROM whatsapp_links WHERE "userId" = $1', [req.user.id])
        res.json({ linked: false })
    } catch (err) {
        console.error('[whatsapp] unlink:', err.message)
        res.status(500).json({ message: 'Erro ao desconectar' })
    }
})

// ─── Cron ────────────────────────────────────────────────────────────────────

router.get('/cron/daily-reminders', async (req, res) => {
    const secret = process.env.CRON_SECRET
    if (!secret || !safeEqual(req.get('authorization'), `Bearer ${secret}`)) {
        return res.sendStatus(401)
    }
    try {
        const summary = await bot.sendDailyReminders()
        res.json(summary)
    } catch (err) {
        console.error('[whatsapp] cron:', err.message)
        res.status(500).json({ message: 'Falha no lembrete diário' })
    }
})

module.exports = { router, webhookHandler }
