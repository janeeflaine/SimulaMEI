/**
 * whatsappClient.js — Chamadas à WhatsApp Cloud API (Graph API da Meta).
 *
 * Variáveis de ambiente (somente na Vercel, nunca no repositório):
 *   WHATSAPP_TOKEN            token permanente do System User
 *   WHATSAPP_PHONE_NUMBER_ID  ID do número que envia as mensagens
 *   WHATSAPP_APP_SECRET       App Secret, usado para validar o webhook
 *   WHATSAPP_GRAPH_VERSION    opcional (padrão v23.0)
 */
const crypto = require('crypto')

const GRAPH_BASE = 'https://graph.facebook.com'
const MAX_MEDIA_BYTES = 10 * 1024 * 1024 // 10MB
const REQUEST_TIMEOUT_MS = 15000

const LIMITS = { text: 4096, interactiveBody: 1024, buttonTitle: 20, rowTitle: 24, rowDescription: 72, listButton: 20 }

const graphVersion = () => process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'

const truncate = (value, max) => {
    const text = String(value ?? '')
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function getConfig() {
    const token = process.env.WHATSAPP_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (!token || !phoneNumberId) {
        throw new Error('WhatsApp não configurado: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID.')
    }
    return { token, phoneNumberId }
}

async function graphRequest(path, { method = 'GET', body } = {}) {
    const { token } = getConfig()
    const res = await fetch(`${GRAPH_BASE}/${graphVersion()}/${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        const detail = data && data.error ? `${data.error.code || ''} ${data.error.message || ''}`.trim() : res.status
        const err = new Error(`WhatsApp API ${res.status}: ${detail}`)
        err.status = res.status
        throw err
    }
    return data
}

async function sendMessage(to, payload) {
    const { phoneNumberId } = getConfig()
    return graphRequest(`${phoneNumberId}/messages`, {
        method: 'POST',
        body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }
    })
}

function sendText(to, text) {
    return sendMessage(to, { type: 'text', text: { preview_url: false, body: truncate(text, LIMITS.text) } })
}

/** Até 3 botões de resposta rápida: [{ id, title }] */
function sendButtons(to, text, buttons) {
    return sendMessage(to, {
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: truncate(text, LIMITS.interactiveBody) },
            action: {
                buttons: buttons.slice(0, 3).map(b => ({
                    type: 'reply',
                    reply: { id: b.id, title: truncate(b.title, LIMITS.buttonTitle) }
                }))
            }
        }
    })
}

/** Lista com até 10 opções: rows = [{ id, title, description }] */
function sendList(to, text, buttonLabel, rows, sectionTitle = 'Opções') {
    return sendMessage(to, {
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: truncate(text, LIMITS.interactiveBody) },
            action: {
                button: truncate(buttonLabel, LIMITS.listButton),
                sections: [{
                    title: truncate(sectionTitle, LIMITS.rowTitle),
                    rows: rows.slice(0, 10).map(r => ({
                        id: r.id,
                        title: truncate(r.title, LIMITS.rowTitle),
                        ...(r.description ? { description: truncate(r.description, LIMITS.rowDescription) } : {})
                    }))
                }]
            }
        }
    })
}

/** Template aprovado no WhatsApp Manager (necessário fora da janela de 24h). */
function sendTemplate(to, name, languageCode, bodyParams = []) {
    return sendMessage(to, {
        type: 'template',
        template: {
            name,
            language: { code: languageCode },
            components: bodyParams.length
                ? [{ type: 'body', parameters: bodyParams.map(text => ({ type: 'text', text: String(text) })) }]
                : []
        }
    })
}

/** Marca como lida e mostra "digitando..." enquanto a resposta é preparada. */
function markAsRead(messageId) {
    const { phoneNumberId } = getConfig()
    return graphRequest(`${phoneNumberId}/messages`, {
        method: 'POST',
        body: {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
            typing_indicator: { type: 'text' }
        }
    })
}

/** Baixa áudio, imagem ou documento recebido. Recusa arquivos acima de 10MB. */
async function downloadMedia(mediaId) {
    const { token } = getConfig()
    const meta = await graphRequest(encodeURIComponent(mediaId))
    if (!meta.url) throw new Error('Mídia sem URL de download')
    if (meta.file_size && Number(meta.file_size) > MAX_MEDIA_BYTES) {
        const err = new Error('Arquivo maior que 10MB')
        err.code = 'MEDIA_TOO_LARGE'
        throw err
    }
    const res = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`Falha ao baixar mídia: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > MAX_MEDIA_BYTES) {
        const err = new Error('Arquivo maior que 10MB')
        err.code = 'MEDIA_TOO_LARGE'
        throw err
    }
    const mimeType = String(meta.mime_type || res.headers.get('content-type') || 'application/octet-stream')
        .split(';')[0].trim()
    return { buffer, mimeType }
}

/** Valida o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret). */
function verifySignature(rawBody, signatureHeader, appSecret) {
    if (!rawBody || !signatureHeader || !appSecret) return false
    const [algo, received] = String(signatureHeader).split('=')
    if (algo !== 'sha256' || !received || !/^[a-f0-9]{64}$/i.test(received)) return false
    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received.toLowerCase(), 'hex'))
}

module.exports = {
    MAX_MEDIA_BYTES,
    sendText,
    sendButtons,
    sendList,
    sendTemplate,
    markAsRead,
    downloadMedia,
    verifySignature
}
