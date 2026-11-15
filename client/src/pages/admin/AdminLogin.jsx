import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import BrandMark from '../../components/ui/BrandMark'
import { AuthAlert, PasswordField, looksLikeEmail, normalizeEmail } from '../../components/auth/AuthFrame'
import './AdminLogin.css'

/**
 * Entrada do painel do administrador. Mesmo acesso do Entrar (POST /api/auth/login,
 * com a trava de tentativas), com scope 'admin': o servidor só devolve a sessão
 * para conta de administrador.
 */
export default function AdminLogin() {
    const navigate = useNavigate()
    const { user, loading: authLoading, login } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    // Trava de tentativas: até quando e para qual e-mail (o aviso conta os minutos que faltam)
    const [lock, setLock] = useState(null) // { until, email, message }
    const [now, setNow] = useState(Date.now())

    // Página fora do Google
    useEffect(() => {
        const meta = document.createElement('meta')
        meta.name = 'robots'
        meta.content = 'noindex, nofollow'
        document.head.appendChild(meta)
        const title = document.title
        document.title = 'Painel do administrador · EuSempreMEI'
        return () => {
            meta.remove()
            document.title = title
        }
    }, [])

    useEffect(() => {
        if (!lock) return
        const timer = setInterval(() => setNow(Date.now()), 15000)
        return () => clearInterval(timer)
    }, [lock])

    const lockLeft = lock ? Math.max(0, lock.until - now) : 0
    const lockedNow = !!lock && lockLeft > 0 && normalizeEmail(email) === lock.email
    const lockMessage = () => {
        if (!lock || lockLeft <= 0) return ''
        const m = Math.max(1, Math.ceil(lockLeft / 60000))
        return lock.message.replace(/em \d+ minutos?/, `em ${m === 1 ? '1 minuto' : `${m} minutos`}`)
    }

    // Administrador que já entrou vai direto para o painel
    if (!authLoading && user?.role === 'ADMIN') return <Navigate to="/admin" replace />

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        const cleanEmail = normalizeEmail(email)
        if (!looksLikeEmail(cleanEmail)) return setError('Digite o e-mail da conta de administrador.')
        if (!password) return setError('Digite a sua senha.')

        setLoading(true)
        setLock(null)
        try {
            const logged = await login(cleanEmail, password, { scope: 'admin' })
            if (logged.role !== 'ADMIN') {
                // O servidor já recusa; isto é só uma segunda conferência
                setError('Esta conta não tem acesso ao painel do administrador.')
                setLoading(false)
                return
            }
            navigate('/admin', { replace: true })
        } catch (err) {
            if (err.retryAfter) {
                setNow(Date.now())
                setLock({ until: Date.now() + err.retryAfter * 1000, email: cleanEmail, message: err.message })
            } else {
                setError(err.message || 'Não deu para entrar agora. Tente de novo.')
            }
            setLoading(false)
        }
    }

    return (
        <div className="acesso adl">
            <main className="adl-wrap">
                <section className="adl-card" aria-labelledby="adl-title">
                    <header className="adl-head">
                        <Link to="/" className="acs-brand acs-brand--light" aria-label="EuSempreMEI, ir para o início">
                            <BrandMark size={28} /> <span>EuSempreMEI</span>
                        </Link>
                        <span className="adl-tag">
                            <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
                            Administrador
                        </span>
                    </header>

                    <div className="adl-body">
                        <h1 id="adl-title" className="acs-title">Entrar no painel do administrador</h1>
                        <p className="acs-sub">Só contas de administrador entram aqui.</p>

                        <form onSubmit={handleSubmit} className="acs-form" noValidate>
                            <AuthAlert>{error || lockMessage()}</AuthAlert>
                            {lock && lockLeft <= 0 && <AuthAlert tone="success">Já pode tentar de novo.</AuthAlert>}

                            <div className="acs-field">
                                <label htmlFor="adl-email">E-mail</label>
                                <input
                                    id="adl-email"
                                    type="email"
                                    inputMode="email"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    disabled={loading}
                                    maxLength={254}
                                />
                            </div>

                            <PasswordField
                                id="adl-password"
                                label="Senha"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                disabled={loading}
                                aside={<Link to="/esqueci-senha" className="acs-link acs-link--small">Esqueci a senha</Link>}
                            />

                            <button type="submit" className="acs-submit" disabled={loading || lockedNow}>
                                {loading ? 'Entrando...' : 'Entrar no painel'}
                            </button>
                        </form>
                    </div>

                    <footer className="adl-foot">
                        <Link to="/" className="adl-back">
                            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
                            Voltar ao site
                        </Link>
                        <span>
                            Cliente? <Link to="/login" className="acs-link">Entrar na sua conta</Link>
                        </span>
                    </footer>
                </section>
            </main>
        </div>
    )
}
