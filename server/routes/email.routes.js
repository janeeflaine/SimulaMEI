/**
 * email.routes.js — Recebimento de e-mails via Resend Receiving.
 *
 *   POST /api/email/receive   webhook chamado pelo Resend quando um e-mail chega
 *
 * Variáveis de ambiente necessárias na Vercel (Sensitive):
 *   RESEND_WEBHOOK_SECRET  — gerado pelo Resend ao criar o webhook (começa com whsec_)
 *   RESEND_API_KEY         — chave sk_... já usada para envio (mesmo valor de SMTP_PASS ou equivalente)
 *   CONTACT_FORWARD_TO     — e-mail real do dono para onde encaminhar (ex: janeeflaine@gmail.com)
 *
 * Fluxo:
 *   1. Resend envia POST com assinatura svix no header
 *   2. Verificamos a assinatura (proteção contra payloads falsos)
 *   3. Buscamos o e-mail completo via Resend Receiving API
 *   4. Encaminhamos para CONTACT_FORWARD_TO com Reply-To do remetente original
 *   5. Rate-limit simples por remetente: max 5 e-mails por hora (evita gastar os 100/dia com spam)
 */

'use strict'

const express = require('express')
const { Webhook } = require('svix')
const { sendMail } = require('../utils/email')

const router = express.Router()

// ─── Rate-limit em memória (por remetente, janela de 1h) ──────────────────────
const senderHits = new Map()   // email → { count, resetAt }
const RATE_LIMIT  = 5          // máximo de e-mails por remetente por hora
const RATE_WINDOW = 60 * 60 * 1000  // 1 hora em ms

function isRateLimited(senderEmail) {
    const now = Date.now()
    const entry = senderHits.get(senderEmail)
    if (!entry || now > entry.resetAt) {
        senderHits.set(senderEmail, { count: 1, resetAt: now + RATE_WINDOW })
        return false
    }
    entry.count++
    return entry.count > RATE_LIMIT
}

// ─── Mapa de caixas → prefixo de assunto ─────────────────────────────────────
const MAILBOX_PREFIX = {
    'contato':     '[contato]',
    'suporte':     '[suporte]',
    'privacidade': '[privacidade]',
}

function prefixFor(toAddress = '') {
    const local = toAddress.split('@')[0].toLowerCase()
    return MAILBOX_PREFIX[local] || `[${local}]`
}

// ─── Webhook handler (corpo bruto — montado no app antes do express.json()) ───

const webhookHandler = async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
        console.error('[email/receive] RESEND_WEBHOOK_SECRET não configurado')
        return res.sendStatus(500)
    }

    // 1. Verificar assinatura svix
    const wh = new Webhook(secret)
    let payload
    try {
        payload = wh.verify(req.body, req.headers)
    } catch (err) {
        console.warn('[email/receive] Assinatura inválida:', err.message)
        return res.sendStatus(400)
    }

    // 2. Só processar eventos de e-mail recebido
    if (payload.type !== 'email.received') {
        return res.sendStatus(200) // ignorar outros eventos silenciosamente
    }

    // Responder 200 imediatamente (Resend aguarda < 5s)
    res.sendStatus(200)

    // 3. Processar em background para não atrasar a resposta
    setImmediate(async () => {
        try {
            const data   = payload.data || {}
            const emailId = data.email_id || data.id

            // 4. Buscar o e-mail completo via Resend Receiving API
            const apiKey = process.env.RESEND_API_KEY
            if (!apiKey) {
                console.error('[email/receive] RESEND_API_KEY não configurado')
                return
            }

            const apiRes = await fetch(`https://api.resend.com/emails/${emailId}`, {
                headers: { Authorization: `Bearer ${apiKey}` }
            })
            if (!apiRes.ok) {
                console.error(`[email/receive] Falha ao buscar e-mail ${emailId}: ${apiRes.status}`)
                return
            }
            const email = await apiRes.json()

            const fromAddr  = Array.isArray(email.from) ? email.from[0] : (email.from || '')
            const toAddr    = Array.isArray(email.to)   ? email.to[0]   : (email.to   || '')
            const subject   = email.subject || '(sem assunto)'
            const bodyHtml  = email.html    || ''
            const bodyText  = email.text    || bodyHtml.replace(/<[^>]+>/g, '') || ''

            // 5. Rate-limit por remetente
            if (isRateLimited(fromAddr)) {
                console.warn(`[email/receive] Rate-limit atingido para ${fromAddr} → descartando`)
                return
            }

            // 6. Encaminhar
            const forwardTo = process.env.CONTACT_FORWARD_TO
            if (!forwardTo) {
                console.error('[email/receive] CONTACT_FORWARD_TO não configurado')
                return
            }

            const prefix     = prefixFor(toAddr)
            const fwdSubject = `${prefix} ${subject}`
            const fwdHtml    = `
<div style="background:#f3f4f6;padding:12px 16px;border-left:4px solid #12284a;margin-bottom:16px;font-family:Arial,sans-serif;font-size:13px;color:#374151">
  <strong>E-mail encaminhado por EuSempreMEI</strong><br>
  <strong>De:</strong> ${fromAddr}<br>
  <strong>Para:</strong> ${toAddr}<br>
  <strong>Assunto original:</strong> ${subject}
</div>
${bodyHtml || `<pre style="font-family:inherit">${bodyText}</pre>`}`

            await sendMail({
                to:      forwardTo,
                subject: fwdSubject,
                html:    fwdHtml,
                text:    `---- Mensagem encaminhada ----\nDe: ${fromAddr}\nPara: ${toAddr}\nAssunto: ${subject}\n\n${bodyText}`,
                replyTo: fromAddr,
                kind:    'recebido',
            })

            console.log(`[email/receive] Encaminhado: ${fromAddr} → ${toAddr} → ${forwardTo} | "${subject}"`)
        } catch (err) {
            console.error('[email/receive] Erro ao processar:', err)
        }
    })
}

// Rota de health (para confirmar que o endpoint existe, sem expor dados)
router.get('/receive', (req, res) => res.json({ ok: true, endpoint: 'email/receive' }))

module.exports = { router, webhookHandler }
