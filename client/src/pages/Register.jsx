import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { LEGAL_VERSION } from '../utils/legalInfo'
import { track } from '../utils/metaPixel'
import { showToast } from '../utils/toast'
import AuthFrame, { AuthAlert, LimitFact, PasswordField, looksLikeEmail, normalizeEmail, passwordProblem, readJson } from '../components/auth/AuthFrame'

// Teste grátis não oferecido no cadastro: a conta fica no Gratuito e a pessoa fica sabendo
const TRIAL_SKIPPED = {
    email_used: 'Conta criada no Gratuito. Este e-mail já usou um teste grátis.',
    device_used: 'Conta criada no Gratuito. Este aparelho já foi usado em um teste grátis; para o plano completo, assine.',
    no_device: 'Conta criada no Gratuito. Não deu para liberar o teste grátis neste navegador.'
}

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Register() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const planIdParam = searchParams.get('planId') || sessionStorage.getItem('selectedPlanId')

    const { register } = useAuth()
    const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
    const [acceptedTerms, setAcceptedTerms] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [loadingStatus, setLoadingStatus] = useState('')
    const [selectedPlan, setSelectedPlan] = useState(null)
    // Teste grátis para contas novas (Admin > Funcionalidades), só para quem entra pelo Gratuito
    const [trial, setTrial] = useState(null)

    useEffect(() => {
        let alive = true
        fetch('/api/plans/trial')
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (alive && data?.enabled) setTrial(data) })
            .catch(() => {})
        return () => { alive = false }
    }, [])

    useEffect(() => {
        if (!planIdParam) return
        let alive = true
        fetch('/api/plans')
            .then(res => (res.ok ? res.json() : []))
            .then(plans => {
                const found = Array.isArray(plans) ? plans.find(p => Number(p.id) === Number(planIdParam)) : null
                if (alive && found) setSelectedPlan(found)
            })
            .catch(() => {})
        return () => { alive = false }
    }, [planIdParam])

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

    const pwProblem = passwordProblem(form.password)
    const longEnough = form.password.length >= 8
    const same = form.confirmPassword.length > 0 && form.password === form.confirmPassword

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        const name = form.name.trim()
        const email = normalizeEmail(form.email)

        if (name.length < 2) return setError('Digite o seu nome.')
        if (!looksLikeEmail(email)) return setError('Digite um e-mail válido, por exemplo joana@gmail.com.')
        if (pwProblem) return setError(pwProblem)
        if (form.password !== form.confirmPassword) return setError('As duas senhas não estão iguais.')
        if (!acceptedTerms) return setError('Para criar a conta, marque que leu e aceita os Termos de Serviço e a Política de Privacidade.')

        setLoading(true)
        setLoadingStatus('Criando sua conta...')

        try {
            const targetPlanId = selectedPlan ? selectedPlan.id : null
            const { user, trial: trialResult } = await register(name, email, form.password, targetPlanId, LEGAL_VERSION)
            // Pixel da Meta (só com o aceite de cookies): conta criada, sem dados pessoais.
            // O StartTrial vai quando o e-mail é confirmado (página Confirmar e-mail).
            track('CompleteRegistration')

            // Plano pago: vai direto para o pagamento no Stripe
            if (user?.requiresPayment || (selectedPlan && Number(selectedPlan.price) > 0)) {
                setLoadingStatus('Abrindo o pagamento...')
                sessionStorage.removeItem('selectedPlanId')
                const token = localStorage.getItem('token')
                try {
                    const stripeRes = await fetch('/api/stripe/create-checkout-session', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ planId: targetPlanId })
                    })
                    const stripeData = await readJson(stripeRes)
                    if (stripeRes.ok && stripeData.url) {
                        window.location.href = stripeData.url
                        return
                    }
                    throw new Error(stripeData.message || 'Erro ao abrir o pagamento.')
                } catch (stripeErr) {
                    console.error('Checkout error after register:', stripeErr)
                    // A conta já existe: em Planos dá para tentar o pagamento de novo
                    navigate(`/planos?pending=true&retryPlan=${targetPlanId}`)
                    return
                }
            }

            sessionStorage.removeItem('selectedPlanId')
            // Teste grátis: começa quando a pessoa abrir o link do e-mail
            if (trialResult?.status === 'pending') {
                navigate('/confirmar-email', { state: { trial: trialResult } })
                return
            }
            if (trialResult && TRIAL_SKIPPED[trialResult.status]) showToast(TRIAL_SKIPPED[trialResult.status], 'error')
            navigate('/dashboard')
        } catch (err) {
            setError(err.message || 'Não deu para criar a conta agora. Tente de novo.')
            setLoading(false)
            setLoadingStatus('')
        }
    }

    const isPaidPlan = selectedPlan && Number(selectedPlan.price) > 0
    const loginLink = planIdParam ? `/login?planId=${encodeURIComponent(planIdParam)}` : '/login'

    return (
        <AuthFrame aside="Comece pelo plano gratuito e mude quando quiser" extra={<LimitFact />}>
            <h1 className="acs-title">Criar conta</h1>
            <p className="acs-sub">
                {isPaidPlan ? 'Depois de criar a conta, você vai para o pagamento no cartão.' : 'Leva menos de um minuto. Não pede cartão.'}
            </p>

            {trial && !isPaidPlan && (
                <div className="acs-plan is-paid" role="note">
                    <div>
                        <span className="acs-plan__label">Teste grátis</span>
                        <strong>{trial.days} dias do plano {trial.planName}</strong>
                    </div>
                    <p className="acs-plan__note">
                        Sem cartão. Começa quando você confirmar o e-mail. No fim, a conta volta ao Gratuito sozinha, sem cobrança e sem perder os dados. Um teste por e-mail e por aparelho.
                    </p>
                </div>
            )}

            {selectedPlan && !(trial && !isPaidPlan) && (
                <div className={`acs-plan${isPaidPlan ? ' is-paid' : ''}`}>
                    <div>
                        <span className="acs-plan__label">Plano escolhido</span>
                        <strong>{selectedPlan.name}</strong>
                    </div>
                    <div className="acs-plan__price">
                        {isPaidPlan ? <>{brl(selectedPlan.price)}<small> por mês</small></> : 'Grátis'}
                    </div>
                    <Link to="/planos" className="acs-link acs-link--small">Trocar plano</Link>
                </div>
            )}

            <form onSubmit={handleSubmit} className="acs-form" noValidate>
                <AuthAlert>{error}</AuthAlert>

                <div className="acs-field">
                    <label htmlFor="acs-name">Nome</label>
                    <input id="acs-name" type="text" autoComplete="name" value={form.name} onChange={set('name')}
                        placeholder="Seu nome" disabled={loading} maxLength={80} />
                </div>

                <div className="acs-field">
                    <label htmlFor="acs-email">E-mail</label>
                    <input id="acs-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
                        spellCheck={false} value={form.email} onChange={set('email')} placeholder="seu@email.com"
                        disabled={loading} maxLength={254} />
                </div>

                <PasswordField id="acs-password" label="Senha" value={form.password} onChange={set('password')}
                    autoComplete="new-password" disabled={loading} describedBy="acs-rules" />

                <PasswordField id="acs-confirm" label="Repita a senha" value={form.confirmPassword} onChange={set('confirmPassword')}
                    autoComplete="new-password" disabled={loading} describedBy="acs-rules"
                    invalid={form.confirmPassword.length > 0 && !same} />

                <ul className="acs-rules" id="acs-rules">
                    <li className={longEnough ? 'is-ok' : ''}><Check size={16} strokeWidth={2.4} aria-hidden="true" />Pelo menos 8 caracteres</li>
                    <li className={same ? 'is-ok' : ''}><Check size={16} strokeWidth={2.4} aria-hidden="true" />As duas senhas iguais</li>
                </ul>

                <label className="acs-check">
                    <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} disabled={loading} />
                    <span className="acs-check__box" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
                    <span>
                        Tenho 18 anos ou mais, li e aceito os{' '}
                        <Link to="/termos-de-servico" target="_blank" rel="noopener" className="acs-link">Termos de Serviço</Link>{' '}
                        e estou ciente da{' '}
                        <Link to="/politica-de-privacidade" target="_blank" rel="noopener" className="acs-link">Política de Privacidade</Link>.
                    </span>
                </label>

                <button type="submit" className="acs-submit" disabled={loading}>
                    {loading ? (loadingStatus || 'Criando sua conta...') : (isPaidPlan ? 'Criar conta e pagar' : 'Criar conta grátis')}
                </button>
            </form>

            <p className="acs-switch">
                Já tem conta? <Link to={loginLink} className="acs-link">Entrar</Link>
            </p>
        </AuthFrame>
    )
}
