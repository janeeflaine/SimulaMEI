const nodemailer = require('nodemailer')
require('dotenv').config()

// Create a transporter using environment variables. 
// If not configured, it will log the email content to console (useful for dev/testing).
const createTransporter = () => {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        })
    }
    return null
}

const sendPasswordResetEmail = async (to, token) => {
    const isProduction = process.env.NODE_ENV === 'production'
    // Fallback to localhost for dev environment
    const baseUrl = process.env.FRONTEND_URL || (isProduction ? 'https://simula-mei.vercel.app' : 'http://localhost:5173')
    const resetUrl = `${baseUrl}/redefinir-senha?token=${token}`

    const mailOptions = {
        from: `"SimulaMEI Support" <${process.env.SMTP_FROM || 'noreply@simulamei.com'}>`, // sender address
        to, // list of receivers
        subject: 'Redefinição de Senha - SimulaMEI', // Subject line
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Recuperação de Conta</h2>
                <p>Você solicitou a redefinição de senha para a sua conta no SimulaMEI.</p>
                <p>Clique no botão abaixo para criar uma nova senha:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
                </div>
                <p>Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
                <p style="word-break: break-all; color: #6366f1;">${resetUrl}</p>
                <br/>
                <p style="color: #64748b; font-size: 12px;">Se você não solicitou esta alteração, pode ignorar este e-mail em segurança. O link expirará em 1 hora.</p>
            </div>
        `
    }

    const transporter = createTransporter()

    if (transporter) {
        try {
            await transporter.sendMail(mailOptions)
            console.log(`📧 E-mail de recuperação enviado para ${to}`)
        } catch (error) {
            console.error('❌ Falha ao enviar e-mail via SMTP:', error)
            // Even if SMTP fails, we shouldn't crash the server. Next logic handles fallback log.
        }
    } else {
        console.log('⚠️ AVISO: Configurações SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) não encontradas.')
        console.log('--------------------------------------------------')
        console.log(`✉️ SIMULANDO ENVIO DE E-MAIL PARA: ${to}`)
        console.log(`🔗 LINK DE RECUPERAÇÃO: ${resetUrl}`)
        console.log('--------------------------------------------------')
    }
}

module.exports = {
    sendPasswordResetEmail
}
