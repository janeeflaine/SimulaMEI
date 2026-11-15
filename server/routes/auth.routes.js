const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { rateLimit, ipKeyGenerator } = require('express-rate-limit')
const { db, pool } = require('../db')
const { generateToken, authMiddleware } = require('../middleware/auth')
const { sendPasswordResetEmail } = require('../utils/email')
const auditLogger = require('../utils/auditLogger')
const { deleteUserData, cancelStripeSubscriptionIfActive } = require('../utils/userDeletion')
const { getClientIp } = require('../middleware/requestContext')

const router = express.Router()

// Limite por endereço de internet (IP real do visitante; na Vercel vem do cabeçalho
// que ela mesma escreve). Cada servidor da Vercel conta à parte, por isso as
// tentativas de senha também são contadas no banco (auth_attempts, abaixo).
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: { message: 'Muitas tentativas. Espere 15 minutos e tente de novo.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getClientIp(req)),
    validate: { xForwardedForHeader: false, trustProxy: false }
})

// ─── Dados conferidos ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// E-mail sempre minúsculo e sem espaços (antes "Joana@" e "joana@" viravam duas contas)
const cleanEmail = (v) => {
    if (typeof v !== 'string') return null
    const e = v.trim().toLowerCase()
    return e.length <= 254 && EMAIL_RE.test(e) ? e : null
}

// Senha: texto de 8 a 72 bytes (o bcrypt ignora o que passa de 72)
const passwordError = (v) => {
    if (typeof v !== 'string' || v.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
    if (Buffer.byteLength(v, 'utf8') > 72) return 'A senha pode ter no máximo 72 caracteres.'
    return null
}

const cleanName = (v) => {
    if (typeof v !== 'string') return null
    // eslint-disable-next-line no-control-regex
    const n = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    return n.length >= 2 && n.length <= 80 ? n : null
}

// Hash de uma senha qualquer: quando o e-mail não existe, a resposta demora o mesmo
// que uma senha errada (antes 2 ms x 68 ms dizia quais e-mails têm conta)
const DUMMY_HASH = bcrypt.hashSync('senha-que-nao-existe', 10)

// ─── Tentativas no banco (valem para todos os servidores) ─────────────────────

// Como nos serviços de login conhecidos (ex.: Auth0, OWASP): a trava principal é por
// e-mail + IP, então quem erra de outro lugar não tranca o dono da conta; um teto por
// e-mail pega ataque espalhado em muitos IPs; um teto por IP pega quem testa senhas
// em muitas contas. Entrar com a senha certa (ou criar senha nova) zera o e-mail.
const LOGIN_MAX_PER_EMAIL_IP = 5   // erros no mesmo e-mail, do mesmo IP, em 15 min
const LOGIN_MAX_PER_EMAIL = 20     // erros no mesmo e-mail, de qualquer IP, em 1 hora
const LOGIN_MAX_PER_IP = 30        // erros do mesmo IP, em qualquer e-mail, em 15 min
const RESET_MAX_PER_EMAIL = 3      // e-mails de "Esqueci a senha" por hora

/**
 * Registra a tentativa e diz quantas houve na janela (contando esta). Gravar antes
 * de contar faz pedidos ao mesmo tempo verem uns aos outros: passam no máximo `max`.
 */
async function countAttempt(kind, key, minutes, ids) {
    try {
        const ins = await db.query('INSERT INTO auth_attempts (kind, key) VALUES ($1, $2) RETURNING id', [kind, String(key).slice(0, 254)])
        if (ids && ins.rows && ins.rows[0]) ids.push(ins.rows[0].id)
        const { rows } = await db.query(
            `SELECT COUNT(*)::int AS n FROM auth_attempts
             WHERE kind = $1 AND key = $2 AND created_at > NOW() - make_interval(mins => $3)`,
            [kind, String(key).slice(0, 254), minutes]
        )
        // De vez em quando, limpa o que tem mais de um dia
        if (Math.random() < 0.02) {
            db.query(`DELETE FROM auth_attempts WHERE created_at < NOW() - INTERVAL '1 day'`).catch(() => {})
        }
        return rows[0] ? rows[0].n : 1
    } catch (err) {
        // Sem a tabela (banco ainda sendo preparado): não trava ninguém; o limite por IP continua
        console.error('auth_attempts:', err.message)
        return 0
    }
}

const clearAttempts = (kind, key) =>
    db.query('DELETE FROM auth_attempts WHERE kind = $1 AND key = $2', [kind, key]).catch(() => {})

// Tira as tentativas deste pedido (entrou certo: não conta como erro no IP)
const forgetAttempts = (ids) => (ids.length
    ? db.query('DELETE FROM auth_attempts WHERE id = ANY($1::bigint[])', [ids]).catch(() => {})
    : Promise.resolve())

// ─── Senha vazada ─────────────────────────────────────────────────────────────

/**
 * Senha que já apareceu em vazamentos (Have I Been Pwned, "Pwned Passwords").
 * Só os 5 primeiros caracteres do SHA-1 saem do servidor (k-anonimato): o serviço
 * nunca vê a senha. Sem resposta em 2 s, segue sem conferir (o site não fica preso).
 */
async function isPwnedPassword(password) {
    if (process.env.PWNED_CHECK === 'off' || typeof fetch !== 'function') return false
    try {
        const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
        const prefix = sha1.slice(0, 5)
        const suffix = sha1.slice(5)
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: { 'Add-Padding': 'true', 'User-Agent': 'EuSempreMEI' },
            signal: AbortSignal.timeout(2000)
        })
        if (!res.ok) return false
        const body = await res.text()
        return body.split('\n').some(line => {
            const [hash, count] = line.trim().split(':')
            return hash === suffix && Number(count) > 0
        })
    } catch (_) {
        return false
    }
}

const PWNED_MESSAGE = 'Esta senha já apareceu em vazamentos de dados na internet e é das primeiras que os invasores testam. Escolha outra.'

// Senha igual ao e-mail ou ao nome: a primeira que alguém tentaria
const obviousPassword = (password, email, name) => {
    const p = password.trim().toLowerCase()
    return p === String(email || '').toLowerCase() || p === String(email || '').split('@')[0].toLowerCase() ||
        (name && p.replace(/\s+/g, '') === String(name).toLowerCase().replace(/\s+/g, ''))
}

// "Um aparelho por vez": escolha do admin para cada plano (Admin > Funcionalidades)
async function singleDeviceFor(planId) {
    if (!planId) return false
    try {
        const { rows } = await db.query('SELECT value FROM system_settings WHERE key = $1', [`single_device_${planId}`])
        return !!rows[0] && String(rows[0].value) === 'true'
    } catch (_) {
        return false
    }
}

// ─── Session helpers ──────────────────────────────────────────────────────────

/**
 * Grava a sessão nova (IP, navegador e aparelho, para a auditoria) e devolve o
 * sessionVersion atual.
 *
 * "Um aparelho por vez" (singleDevice): entrar de outro aparelho (outro navegador)
 * derruba os tokens antigos. O admin liga por plano em Admin > Funcionalidades
 * (system_settings "single_device_<id do plano>"); desligado, vale vários aparelhos.
 */
async function handleSession(userId, context, { singleDevice = false } = {}) {
    const { ip_address, user_agent, device_fingerprint } = context || {}

    let changed = false
    if (singleDevice) {
        const prevSession = await pool.query(
            `SELECT ip_address, device_fingerprint FROM user_sessions
             WHERE user_id = $1 AND is_active = 1
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        )
        const prev = prevSession.rows[0]
        const isDifferentDevice = prev && device_fingerprint && prev.device_fingerprint &&
            prev.device_fingerprint !== device_fingerprint
        const isDifferentIp = prev && ip_address && prev.ip_address &&
            prev.ip_address !== ip_address && !device_fingerprint
        changed = !!(isDifferentDevice || isDifferentIp)

        if (changed) {
            await pool.query(
                `UPDATE users SET "sessionVersion" = COALESCE("sessionVersion", 1) + 1 WHERE id = $1`,
                [userId]
            )
            await auditLogger.log({
                level: 'WARN',
                event_type: 'CONCURRENT_LOGIN_PREVENTED',
                actor: { user_id: userId },
                context,
                metadata: {
                    previous_ip: prev.ip_address,
                    previous_fingerprint: prev.device_fingerprint,
                    new_ip: ip_address,
                    new_fingerprint: device_fingerprint,
                }
            })
        }
    }

    // A sessão nova passa a ser a ativa no registro (os tokens antigos continuam
    // valendo, salvo com singleDevice)
    await pool.query(
        `UPDATE user_sessions SET is_active = 0, invalidated_at = NOW() WHERE user_id = $1 AND is_active = 1`,
        [userId]
    )
    await pool.query(
        `INSERT INTO user_sessions (user_id, ip_address, user_agent, device_fingerprint)
         VALUES ($1, $2, $3, $4)`,
        [userId, ip_address ? String(ip_address).substring(0, 64) : null,
            user_agent ? String(user_agent).substring(0, 512) : null,
            device_fingerprint ? String(device_fingerprint).substring(0, 128) : null]
    )

    const svResult = await pool.query(`SELECT "sessionVersion" FROM users WHERE id = $1`, [userId])
    return svResult.rows[0]?.sessionVersion || 1
}

const parseFeatures = (raw) => {
    try { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {} } catch (_) { return {} }
}

// ─── Register ─────────────────────────────────────────────────────────────────

router.post('/register', authLimiter, async (req, res) => {
    try {
        const body = req.body || {}
        const { acceptedTermsVersion } = body

        // LGPD / CDC: aceite expresso dos Termos e ciência da Política de Privacidade
        if (typeof acceptedTermsVersion !== 'string' || !acceptedTermsVersion.trim()) {
            return res.status(400).json({ message: 'É necessário aceitar os Termos de Serviço e a Política de Privacidade.' })
        }

        const name = cleanName(body.name)
        if (!name) return res.status(400).json({ message: 'Digite o seu nome (de 2 a 80 letras).' })
        const email = cleanEmail(body.email)
        if (!email) return res.status(400).json({ message: 'Digite um e-mail válido, por exemplo joana@gmail.com.' })
        const pwError = passwordError(body.password)
        if (pwError) return res.status(400).json({ message: pwError })

        if (obviousPassword(body.password, email, name)) {
            return res.status(400).json({ message: 'A senha não pode ser o seu e-mail nem o seu nome.' })
        }

        const taken = () => res.status(409).json({ message: 'Já existe uma conta com este e-mail. Entre ou use "Esqueci a senha".' })

        // Inclui contas antigas gravadas com letras maiúsculas
        const existingResult = await db.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [email])
        if (existingResult.rows.length > 0) return taken()

        if (await isPwnedPassword(body.password)) return res.status(400).json({ message: PWNED_MESSAGE, reason: 'pwned' })

        const hashedPassword = await bcrypt.hash(body.password, 10)

        const freePlanResult = await db.query("SELECT id, name, price FROM plans WHERE price = 0 LIMIT 1")
        const freePlan = freePlanResult.rows[0] || { id: 1, name: 'Gratuito', price: 0 }

        let initialPlanId = freePlan.id
        let subscriptionStatus = 'active'
        let requiresPayment = false

        // Plano escolhido na página de planos: só id inteiro; o resto vira o Gratuito
        const planId = Number(body.planId)
        if (body.planId != null && Number.isInteger(planId) && planId > 0) {
            const requestedPlanRes = await db.query('SELECT id, name, price FROM plans WHERE id = $1', [planId])
            const requestedPlan = requestedPlanRes.rows[0]
            if (requestedPlan && Number(requestedPlan.price) > 0) {
                initialPlanId = requestedPlan.id
                subscriptionStatus = 'pending_payment'
                requiresPayment = true
            }
        }

        let insertResult
        try {
            insertResult = await db.query(`
                INSERT INTO users (name, email, password, "planId", "planExpiresAt", "subscriptionStatus")
                VALUES ($1, $2, $3, $4, NULL, $5)
                RETURNING id
            `, [name, email, hashedPassword, initialPlanId, subscriptionStatus])
        } catch (insertErr) {
            // Dois cadastros iguais ao mesmo tempo: o banco recusa o segundo (antes 500)
            if (insertErr && insertErr.code === '23505') return taken()
            throw insertErr
        }

        const userId = insertResult.rows[0].id

        const userResult = await db.query(`
            SELECT u.id, u.name, u.email, u.role, u."planId", u."subscriptionStatus", u."sessionVersion",
                   p.name as "planName", p.features as "planFeatures", u."planExpiresAt"
            FROM users u
            LEFT JOIN plans p ON u."planId" = p.id
            WHERE u.id = $1
        `, [userId])

        const user = userResult.rows[0]

        const sessionVersion = await handleSession(userId, req.context || {}, { singleDevice: await singleDeviceFor(user.planId) })
        const token = generateToken({ ...user, sessionVersion })
        const planFeatures = parseFeatures(user.planFeatures)

        await auditLogger.log({
            level: 'INFO',
            event_type: 'USER_REGISTER',
            actor: { user_id: userId, role: 'USER' },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: userId },
            metadata: {
                name, email, planId: initialPlanId, subscriptionStatus, requiresPayment,
                termsAccepted: true,
                termsVersion: acceptedTermsVersion.trim().substring(0, 32),
                termsAcceptedAt: new Date().toISOString()
            }
        })

        res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                plan: user.planName || 'Gratuito',
                planId: user.planId,
                subscriptionStatus: user.subscriptionStatus,
                requiresPayment,
                isInTrial: false,
                planExpiresAt: null,
                planFeatures
            }
        })
    } catch (error) {
        console.error('Register error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// ─── Login ────────────────────────────────────────────────────────────────────

const WRONG_LOGIN = 'E-mail ou senha incorretos.'
const LOCKED_LOGIN = 'Muitas tentativas erradas para este e-mail. Espere 15 minutos ou crie uma senha nova em "Esqueci a senha".'
const BUSY_IP = 'Muitas tentativas de entrar a partir desta rede. Espere 15 minutos e tente de novo.'

router.post('/login', authLimiter, async (req, res) => {
    try {
        const body = req.body || {}
        const email = cleanEmail(body.email)
        const password = typeof body.password === 'string' ? body.password : ''

        if (!email || !password) {
            return res.status(400).json({ message: 'Digite o e-mail e a senha.' })
        }

        // Tentativas no banco: por e-mail (protege a conta) e por IP (protege o site)
        const ip = getClientIp(req)
        const attemptIds = []
        const [byEmailIp, byEmail, byIp] = await Promise.all([
            countAttempt('login', `${email}|${ip}`, 15, attemptIds),
            countAttempt('login-email', email, 60, attemptIds),
            countAttempt('login-ip', ip, 15, attemptIds)
        ])
        if (byEmailIp > LOGIN_MAX_PER_EMAIL_IP || byEmail > LOGIN_MAX_PER_EMAIL || byIp > LOGIN_MAX_PER_IP) {
            await auditLogger.log({
                level: 'WARN',
                event_type: 'USER_LOGIN_THROTTLED',
                actor: {},
                context: req.context || {},
                metadata: { email, byEmailIp, byEmail, byIp }
            })
            return res.status(429).json({ message: byIp > LOGIN_MAX_PER_IP && byEmailIp <= LOGIN_MAX_PER_EMAIL_IP ? BUSY_IP : LOCKED_LOGIN })
        }

        // Find user (contas antigas podem ter letras maiúsculas no e-mail)
        const result = await db.query(`
            SELECT u.*, p.name as "planName"
            FROM users u
            LEFT JOIN plans p ON u."planId" = p.id
            WHERE LOWER(u.email) = $1 AND u."deletedAt" IS NULL
            ORDER BY u.id
            LIMIT 1
        `, [email])

        const user = result.rows[0]

        // A senha é conferida antes de qualquer outra coisa: sem a senha certa, a
        // resposta é sempre a mesma (antes "conta bloqueada" aparecia com senha errada)
        const validPassword = await bcrypt.compare(password.slice(0, 200), user ? user.password : DUMMY_HASH)

        if (!user || !validPassword) {
            await auditLogger.log({
                level: 'WARN',
                event_type: 'USER_LOGIN_FAILED',
                actor: user ? { user_id: user.id, role: user.role } : {},
                context: req.context || {},
                metadata: { email, reason: user ? 'wrong_password' : 'user_not_found' }
            })
            return res.status(401).json({ message: WRONG_LOGIN })
        }

        if (Number(user.isBlocked) === 1 || user.isBlocked === true) {
            await auditLogger.log({
                level: 'WARN',
                event_type: 'USER_LOGIN_BLOCKED',
                actor: { user_id: user.id, role: user.role },
                context: req.context || {},
                metadata: { email }
            })
            return res.status(403).json({ message: 'Sua conta está bloqueada. Entre em contato com o suporte.' })
        }

        // Entrou: zera as tentativas deste e-mail e não conta este pedido no IP
        await Promise.all([
            forgetAttempts(attemptIds),
            clearAttempts('login', `${email}|${ip}`),
            clearAttempts('login-email', email)
        ])

        const sessionVersion = await handleSession(user.id, req.context || {}, { singleDevice: await singleDeviceFor(user.planId) })
        const token = generateToken({ ...user, sessionVersion })

        // Auto-Downgrade if expired
        let finalPlan = user.planName || 'Gratuito'
        let finalPlanId = user.planId ? Number(user.planId) : null
        let isInTrial = user.subscriptionStatus === 'trialing'
        let trialExpired = false

        if (user.planExpiresAt && new Date(user.planExpiresAt) < new Date() && user.subscriptionStatus !== 'active') {
            const freePlanResult = await db.query('SELECT id, name FROM plans WHERE price = 0 LIMIT 1')
            const freePlan = freePlanResult.rows[0]

            if (freePlan && user.planId !== freePlan.id) {
                await db.query(`
                    UPDATE users
                    SET "planId" = $1, "subscriptionStatus" = 'expired', "planExpiresAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [freePlan.id, user.id])

                finalPlan = freePlan.name
                finalPlanId = freePlan.id
                user.subscriptionStatus = 'expired'

                if (isInTrial) {
                    trialExpired = true
                    isInTrial = false
                }
            }
        }

        const planFeatures = parseFeatures(user.planFeatures)

        await auditLogger.log({
            level: 'INFO',
            event_type: 'USER_LOGIN_SUCCESS',
            actor: { user_id: user.id, role: user.role },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: user.id },
            metadata: { plan: finalPlan, sessionVersion }
        })

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                plan: finalPlan,
                planId: finalPlanId,
                isInTrial,
                trialExpired,
                planExpiresAt: user.planExpiresAt,
                subscriptionStatus: user.subscriptionStatus,
                planFeatures
            }
        })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// ─── Forgot Password ──────────────────────────────────────────────────────────

const RESET_SENT = 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em breve.'

router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        // As colunas do link (resetPasswordToken/Expires) são criadas pelo ensureSchema
        const email = cleanEmail((req.body || {}).email)

        if (!email) {
            return res.status(400).json({ message: 'Digite o e-mail da sua conta.' })
        }

        // Mesma resposta e mais ou menos o mesmo tempo com ou sem conta (não diz quem tem conta)
        const started = Date.now()
        const answer = async () => {
            const wait = 500 - (Date.now() - started)
            if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
            return res.status(200).json({ message: RESET_SENT })
        }

        // No máximo 3 e-mails por hora para o mesmo endereço (ninguém enche a caixa de alguém)
        if (await countAttempt('reset', email, 60) > RESET_MAX_PER_EMAIL) return answer()

        const result = await db.query(
            'SELECT id, name, email FROM users WHERE LOWER(email) = $1 AND "deletedAt" IS NULL ORDER BY id LIMIT 1',
            [email]
        )
        const user = result.rows[0]
        if (!user) return answer()

        const resetToken = crypto.randomBytes(32).toString('hex')
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

        await db.query(`
            UPDATE users
            SET "resetPasswordToken" = $1, "resetPasswordExpires" = $2
            WHERE id = $3
        `, [hashedToken, expiresAt, user.id])

        await sendPasswordResetEmail(user.email, resetToken)

        await auditLogger.log({
            level: 'INFO',
            event_type: 'PASSWORD_RESET_REQUESTED',
            actor: { user_id: user.id },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: user.id }
        })

        return answer()
    } catch (error) {
        console.error('Forgot password error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// ─── Reset Password ───────────────────────────────────────────────────────────

const TOKEN_RE = /^[a-f0-9]{64}$/i

router.post('/reset-password', authLimiter, async (req, res) => {
    try {
        const { token, newPassword } = req.body || {}

        if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
            return res.status(400).json({ message: 'Este link não é válido. Peça um novo em "Esqueci a senha".', reason: 'invalid_token' })
        }
        const pwError = passwordError(newPassword)
        if (pwError) return res.status(400).json({ message: pwError })
        if (await isPwnedPassword(newPassword)) return res.status(400).json({ message: PWNED_MESSAGE, reason: 'pwned' })

        const hashedToken = crypto.createHash('sha256').update(token.toLowerCase()).digest('hex')
        const hashedPassword = await bcrypt.hash(newPassword, 10)

        // Confere e usa o link na mesma instrução: o mesmo link não serve duas vezes,
        // nem com dois pedidos ao mesmo tempo
        const result = await db.query(`
            UPDATE users
            SET password = $1, "resetPasswordToken" = NULL, "resetPasswordExpires" = NULL,
                "sessionVersion" = COALESCE("sessionVersion", 1) + 1
            WHERE "resetPasswordToken" = $2
              AND "resetPasswordExpires" > NOW()
              AND "deletedAt" IS NULL
            RETURNING id, email
        `, [hashedPassword, hashedToken])

        const user = result.rows[0]
        if (!user) {
            return res.status(400).json({ message: 'Token de recuperação inválido ou expirado. Solicite novamente.', reason: 'invalid_token' })
        }

        // Sai de todos os aparelhos e libera o e-mail travado por tentativas erradas
        await pool.query(
            `UPDATE user_sessions SET is_active = 0, invalidated_at = NOW() WHERE user_id = $1`,
            [user.id]
        )
        const lower = String(user.email).toLowerCase()
        await Promise.all([
            clearAttempts('login-email', lower),
            db.query(`DELETE FROM auth_attempts WHERE kind = 'login' AND key LIKE $1`, [lower.replace(/[\\%_]/g, '\\$&') + '|%']).catch(() => {})
        ])

        await auditLogger.log({
            level: 'INFO',
            event_type: 'PASSWORD_RESET_COMPLETED',
            actor: { user_id: user.id },
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: user.id }
        })

        res.status(200).json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' })
    } catch (error) {
        console.error('Reset password error:', error)
        res.status(500).json({ message: 'Erro interno. Tente novamente.' })
    }
})

// ─── Get Current User ─────────────────────────────────────────────────────────

router.get('/me', authMiddleware, (req, res) => {
    // Com pagamento pendente, o site mostra o plano escolhido para cobrar;
    // os recursos liberados (planFeatures) continuam os do Gratuito até pagar.
    if (req.user.pendingPlanId) {
        return res.json({ ...req.user, planId: req.user.pendingPlanId, plan: req.user.pendingPlan })
    }
    res.json(req.user)
})

// ─── Delete Own Account (LGPD art. 18, VI) ────────────────────────────────────

const ACCOUNT_DELETION_CONFIRMATION = 'EXCLUIR'

router.delete('/me', authMiddleware, authLimiter, async (req, res) => {
    const { password, confirmation } = req.body || {}

    if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
        return res.status(400).json({ message: `Digite ${ACCOUNT_DELETION_CONFIRMATION} para confirmar a exclusão.` })
    }
    if (typeof password !== 'string' || !password) {
        return res.status(400).json({ message: 'Informe sua senha para confirmar a exclusão.' })
    }

    let client
    try {
        const userResult = await db.query(
            'SELECT id, email, role, password, "stripeSubscriptionId" FROM users WHERE id = $1 AND "deletedAt" IS NULL',
            [req.user.id]
        )
        const user = userResult.rows[0]

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' })
        }

        if (user.role === 'ADMIN') {
            return res.status(403).json({ message: 'Contas de administrador não podem ser excluídas por aqui.' })
        }

        const validPassword = await bcrypt.compare(password, user.password)
        if (!validPassword) {
            await auditLogger.log({
                level: 'WARN',
                event_type: 'ACCOUNT_DELETE_FAILED',
                actor: { user_id: user.id, role: user.role },
                context: req.context || {},
                metadata: { reason: 'wrong_password' }
            })
            return res.status(401).json({ message: 'Senha incorreta.' })
        }

        // Garante que nenhuma cobrança recorrente continue depois da exclusão
        try {
            await cancelStripeSubscriptionIfActive(user.stripeSubscriptionId)
        } catch (stripeErr) {
            console.error('Account deletion: Stripe cancel failed:', stripeErr.message)
            return res.status(502).json({
                message: 'Não conseguimos cancelar sua assinatura agora, então nenhum dado foi excluído. Tente novamente em alguns minutos ou fale com o suporte.'
            })
        }

        client = await pool.connect()
        try {
            await client.query('BEGIN')
            await deleteUserData(client, user.id)
            await client.query('COMMIT')
        } catch (txError) {
            await client.query('ROLLBACK')
            throw txError
        }

        // Registro mínimo, sem dados identificáveis em claro (só o hash do e-mail)
        await auditLogger.log({
            level: 'WARN',
            event_type: 'USER_SELF_DELETED',
            actor: {},
            context: req.context || {},
            target: { resource_type: 'USER', resource_id: user.id },
            metadata: { email_sha256: crypto.createHash('sha256').update(String(user.email).toLowerCase()).digest('hex') }
        })

        res.json({ message: 'Sua conta e todos os seus dados foram excluídos definitivamente.' })
    } catch (error) {
        console.error('Delete own account error:', error)
        res.status(500).json({ message: 'Erro ao excluir a conta. Nenhum dado foi excluído; tente novamente.' })
    } finally {
        if (client) client.release()
    }
})

module.exports = router
