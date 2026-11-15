/**
 * Situação dos serviços do site (Admin > Configurações). Só diz se cada variável
 * da Vercel está preenchida e, em poucos casos, um dado que não é segredo (modo do
 * Stripe, servidor de e-mail). Nenhum valor secreto sai daqui.
 */
const has = (name) => typeof process.env[name] === 'string' && process.env[name].trim() !== ''
const all = (...names) => names.every(has)

function stripeMode() {
    const k = process.env.STRIPE_SECRET_KEY || ''
    if (/^(sk|rk)_live_/.test(k)) return 'live'
    if (/^(sk|rk)_test_/.test(k)) return 'test'
    return null
}

function environment() {
    const v = process.env.VERCEL_ENV
    if (v === 'production' || v === 'preview' || v === 'development') return v
    return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

// state: ok (configurado) | missing (faltando) | warn (atenção) | off (não usado)
function systemStatus() {
    const env = environment()
    const prod = env === 'production'
    const item = (key, name, vars, state, note) => ({ key, name, vars, state, note })
    const mode = stripeMode()
    const jwt = process.env.JWT_SECRET || ''
    const smtp = all('SMTP_HOST', 'SMTP_USER', 'SMTP_PASS')

    const groups = [
        {
            key: 'core', name: 'Base do site', items: [
                item('database', 'Banco de dados', ['DATABASE_URL'], has('DATABASE_URL') ? 'ok' : 'missing', 'Guarda contas, lançamentos e simulações.'),
                item('jwt', 'Chave dos logins', ['JWT_SECRET'],
                    !jwt ? 'missing' : jwt.length < 32 ? 'warn' : 'ok',
                    !jwt ? 'Sem ela ninguém consegue entrar.' : jwt.length < 32 ? 'Curta demais: use uma chave aleatória com 32 caracteres ou mais.' : 'Assina os logins e protege dados guardados.'),
                item('frontend', 'Endereço do site', ['FRONTEND_URL'], has('FRONTEND_URL') ? 'ok' : (prod ? 'warn' : 'missing'),
                    'Usado nos links dos e-mails (senha nova, confirmação).'),
                item('cron', 'Tarefas automáticas', ['CRON_SECRET'], has('CRON_SECRET') ? 'ok' : 'missing', 'Protege as rotinas diárias (lembretes do WhatsApp).'),
            ]
        },
        {
            key: 'stripe', name: 'Pagamentos (Stripe)', items: [
                item('stripe_key', 'Chave do Stripe', ['STRIPE_SECRET_KEY'],
                    !mode ? 'missing' : (prod && mode === 'test') ? 'warn' : 'ok',
                    !mode ? 'Sem ela não dá para assinar planos.' : mode === 'live' ? 'Modo real: as cobranças são de verdade.' : (prod ? 'Modo de teste no site no ar: ninguém é cobrado de verdade.' : 'Modo de teste.')),
                item('stripe_webhook', 'Avisos do Stripe', ['STRIPE_WEBHOOK_SECRET'], has('STRIPE_WEBHOOK_SECRET') ? 'ok' : 'missing',
                    'Sem ele o site não fica sabendo de pagamentos, falhas e cancelamentos.'),
                item('stripe_prices', 'Preços padrão de Prata e Ouro', ['STRIPE_PRICE_SILVER', 'STRIPE_PRICE_GOLD'],
                    all('STRIPE_PRICE_SILVER', 'STRIPE_PRICE_GOLD') ? 'ok' : 'off',
                    'Usados só por planos sem código de preço próprio (Admin > Planos).'),
            ]
        },
        {
            key: 'email', name: 'E-mail', items: [
                item('smtp', 'Envio de e-mails', ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'], smtp ? 'ok' : 'missing',
                    smtp ? `Servidor ${process.env.SMTP_HOST}.` : 'Sem ele não saem links de senha nova nem avisos.'),
                item('resend', 'Recebimento de e-mails (Resend)', ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'],
                    all('RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET') ? 'ok' : (has('RESEND_API_KEY') || has('RESEND_WEBHOOK_SECRET')) ? 'warn' : 'off',
                    all('RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET') ? 'Mensagens recebidas no endereço do site.' : 'Precisa das duas variáveis para receber mensagens.'),
                item('contact', 'Encaminhar o Contato', ['CONTACT_FORWARD_TO'], has('CONTACT_FORWARD_TO') ? 'ok' : 'off',
                    'Para onde vão as mensagens do formulário de Contato.'),
            ]
        },
        {
            key: 'whatsapp', name: 'WhatsApp', items: [
                item('wa_api', 'Conta do WhatsApp (Meta)', ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
                    all('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID') ? 'ok' : 'missing', 'Envia e recebe mensagens do assistente.'),
                item('wa_webhook', 'Avisos da Meta', ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
                    all('WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN') ? 'ok' : 'missing', 'Confere que as mensagens recebidas vêm mesmo da Meta.'),
                item('wa_templates', 'Modelos de lembrete', ['WHATSAPP_REMINDER_TEMPLATE', 'WHATSAPP_ALERT_TEMPLATE'],
                    all('WHATSAPP_REMINDER_TEMPLATE', 'WHATSAPP_ALERT_TEMPLATE') ? 'ok' : 'warn',
                    'Sem eles, os lembretes só chegam para quem falou com o assistente nas últimas 24 horas.'),
            ]
        },
        {
            key: 'ai', name: 'Leitura de faturas', items: [
                item('gemini', 'Inteligência artificial (Google Gemini)', ['GEMINI_API_KEY'], has('GEMINI_API_KEY') ? 'ok' : 'missing',
                    'Lê as faturas enviadas e responde no WhatsApp.'),
            ]
        },
        {
            key: 'safety', name: 'Segurança', items: [
                item('mock', 'Pagamentos de teste', ['ALLOW_MOCK_PAYMENTS'],
                    process.env.ALLOW_MOCK_PAYMENTS === 'true' ? (prod ? 'warn' : 'ok') : 'off',
                    process.env.ALLOW_MOCK_PAYMENTS === 'true' ? 'Ligado. No site no ar ele não vale, mas é melhor apagar a variável.' : 'Desligado, como deve ser no site no ar.'),
                item('admin_pass', 'Senha inicial do admin', ['ADMIN_DEFAULT_PASSWORD'],
                    has('ADMIN_DEFAULT_PASSWORD') ? 'warn' : 'off',
                    has('ADMIN_DEFAULT_PASSWORD') ? 'Só serve para um banco novo. Apague a variável da Vercel.' : 'Não definida (o admin cria a senha por "Esqueci a senha").'),
                item('mercadopago', 'Mercado Pago (Pix antigo)', ['MERCADOPAGO_ACCESS_TOKEN'],
                    has('MERCADOPAGO_ACCESS_TOKEN') ? 'warn' : 'off',
                    has('MERCADOPAGO_ACCESS_TOKEN') ? 'O site não usa mais o Mercado Pago. Dá para apagar a variável.' : 'Não usado: os pagamentos são pelo Stripe.'),
            ]
        },
    ]
    return { environment: env, groups, checkedAt: new Date().toISOString() }
}

module.exports = { systemStatus, stripeMode }
