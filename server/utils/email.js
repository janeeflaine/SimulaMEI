const nodemailer = require('nodemailer')
require('dotenv').config()

/**
 * E-mail do site (hoje só o link de "Esqueci a senha").
 *
 * Precisa das variáveis da Vercel SMTP_HOST, SMTP_USER, SMTP_PASS (e SMTP_PORT,
 * SMTP_FROM). Sem elas, nada é enviado. Antes, sem SMTP, o link de nova senha ia
 * para o log da Vercel: quem visse o log trocava a senha de qualquer conta. Agora
 * o link só aparece no terminal fora da produção.
 *
 * Cada envio grava o resultado em system_settings "email_last_status" (sem o
 * link nem o endereço completo), que o admin vê em Funcionalidades > E-mail do site.
 */

const isProduction = () => process.env.NODE_ENV === 'production' || !!process.env.VERCEL || !!process.env.VERCEL_ENV

const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

const fromAddress = () => process.env.SMTP_FROM || 'nao-responda@eusempremei.com.br'

const createTransporter = () => {
    if (!smtpConfigured()) return null
    const port = Number(process.env.SMTP_PORT) || 587
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    })
}

// Endereço escondido para o registro: jo***@gmail.com
const maskEmail = (to) => {
    const [user, domain] = String(to).split('@')
    return domain ? `${user.slice(0, 2)}***@${domain}` : '***'
}

async function recordStatus(status) {
    try {
        const { db } = require('../db')
        await db.query(
            `INSERT INTO system_settings (key, value, "updatedAt") VALUES ('email_last_status', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value, "updatedAt" = CURRENT_TIMESTAMP`,
            [JSON.stringify({ ...status, at: new Date().toISOString() })]
        )
    } catch (_) { /* registro é só para o admin: nunca derruba o envio */ }
}

// Motivo em português para o admin (sem senha nem chave)
function explainSmtpError(error) {
    const code = error && (error.responseCode || error.code)
    const text = String((error && (error.response || error.message)) || '')
    if (code === 535 || /auth/i.test(text)) return 'O servidor de e-mail recusou o usuário ou a senha (SMTP_USER / SMTP_PASS).'
    if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') return 'Não conectou ao servidor de e-mail (SMTP_HOST / SMTP_PORT).'
    if (/domain|sender|from|not verified|verify/i.test(text)) return 'O remetente (SMTP_FROM) não é de um domínio verificado no serviço de e-mail.'
    if (code === 450 || code === 451 || code === 452 || /limit|quota|rate/i.test(text)) return 'O serviço de e-mail recusou por limite de envio.'
    return `O serviço de e-mail recusou o envio${code ? ` (código ${code})` : ''}.`
}

async function sendMail({ to, subject, html, text, kind, replyTo }) {
    const transporter = createTransporter()
    if (!transporter) {
        await recordStatus({ ok: false, kind, to: maskEmail(to), reason: 'SMTP não configurado na Vercel (SMTP_HOST, SMTP_USER, SMTP_PASS).' })
        if (!isProduction()) {
            console.log('--------------------------------------------------')
            console.log(`E-MAIL (sem SMTP, só no servidor local) para ${to}: ${subject}`)
            console.log(text)
            console.log('--------------------------------------------------')
        } else {
            console.error('E-mail não enviado: SMTP não configurado.')
        }
        return { sent: false, reason: 'not_configured' }
    }
    try {
        const mailOptions = { from: `"EuSempreMEI" <${fromAddress()}>`, to, subject, html, text }
        if (replyTo) mailOptions.replyTo = replyTo
        await transporter.sendMail(mailOptions)
        await recordStatus({ ok: true, kind, to: maskEmail(to) })
        return { sent: true }
    } catch (error) {
        const reason = explainSmtpError(error)
        console.error('Falha ao enviar e-mail:', reason, error && (error.responseCode || error.code))
        await recordStatus({ ok: false, kind, to: maskEmail(to), reason })
        return { sent: false, reason: 'smtp_error', message: reason }
    }
}

const baseUrl = () => process.env.FRONTEND_URL || (isProduction() ? 'https://www.eusempremei.com.br' : 'http://localhost:5173')

const layout = (title, body) => `
<div style="background:#f6f8fa;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e3e8ef;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:18px;font-weight:bold;color:#12284a">EuSempreMEI</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#12284a">${title}</h1>
    ${body}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#5b6b80;text-align:center">Este e-mail foi enviado automaticamente. Não responda.</p>
</div>`

const sendPasswordResetEmail = async (to, token) => {
    const resetUrl = `${baseUrl()}/redefinir-senha?token=${token}`
    const html = layout('Criar uma senha nova', `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Recebemos um pedido para criar uma senha nova na sua conta.</p>
    <p style="margin:24px 0;text-align:center">
      <a href="${resetUrl}" style="display:inline-block;background:#12284a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:999px">Criar senha nova</a>
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#5b6b80">Se o botão não abrir, copie este endereço no navegador:</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#047857">${resetUrl}</p>
    <p style="margin:0;font-size:14px;color:#5b6b80;line-height:1.5">O link vale por 1 hora e só funciona uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.</p>`)
    const text = `Criar uma senha nova no EuSempreMEI\n\nAbra este link para criar uma senha nova (vale por 1 hora, uma vez só):\n${resetUrl}\n\nSe você não pediu, ignore este e-mail: sua senha continua a mesma.`
    return sendMail({ to, subject: 'Criar uma senha nova - EuSempreMEI', html, text, kind: 'senha' })
}

// Teste grátis: o link confirma o e-mail e começa o teste (utils/trial.js)
const sendTrialConfirmEmail = async (to, token, { days, planName }) => {
    const confirmUrl = `${baseUrl()}/confirmar-email?token=${token}`
    const plan = String(planName || '').replace(/[<>&"']/g, '')
    const html = layout('Confirme o seu e-mail', `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Sua conta no EuSempreMEI foi criada. Para começar os ${Number(days) || ''} dias grátis do plano ${plan}, confirme que este e-mail é seu.</p>
    <p style="margin:24px 0;text-align:center">
      <a href="${confirmUrl}" style="display:inline-block;background:#12284a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:999px">Confirmar e começar o teste</a>
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#5b6b80">Se o botão não abrir, copie este endereço no navegador:</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#047857">${confirmUrl}</p>
    <p style="margin:0;font-size:14px;color:#5b6b80;line-height:1.5">O link vale por 48 horas e só funciona uma vez. Sem cartão: no fim do teste, a conta volta ao Gratuito sozinha, sem cobrança. Se você não criou esta conta, ignore este e-mail.</p>`)
    const text = `Confirme o seu e-mail no EuSempreMEI\n\nPara começar os ${Number(days) || ''} dias grátis do plano ${plan}, abra este link (vale por 48 horas, uma vez só):\n${confirmUrl}\n\nSe você não criou esta conta, ignore este e-mail.`
    return sendMail({ to, subject: 'Confirme o seu e-mail e comece o teste grátis - EuSempreMEI', html, text, kind: 'confirmacao' })
}

const sendTestEmail = async (to) => {
    const html = layout('E-mail de teste', `
    <p style="margin:0;font-size:16px;line-height:1.5">Se você recebeu esta mensagem, o envio de e-mails do EuSempreMEI está funcionando, inclusive o "Esqueci a senha".</p>`)
    const text = 'E-mail de teste do EuSempreMEI: o envio de e-mails está funcionando, inclusive o "Esqueci a senha".'
    return sendMail({ to, subject: 'E-mail de teste - EuSempreMEI', html, text, kind: 'teste' })
}

module.exports = { sendMail, sendPasswordResetEmail, sendTrialConfirmEmail, sendTestEmail, smtpConfigured, fromAddress, maskEmail, explainSmtpError }
