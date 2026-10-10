import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Register() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const planIdParam = searchParams.get('planId') || sessionStorage.getItem('selectedPlanId')

    const { register } = useAuth()
    const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [loadingStatus, setLoadingStatus] = useState('')
    const [selectedPlan, setSelectedPlan] = useState(null)

    useEffect(() => {
        if (planIdParam) {
            fetchSelectedPlan(planIdParam)
        }
    }, [planIdParam])

    const fetchSelectedPlan = async (id) => {
        try {
            const res = await fetch('/api/plans')
            if (res.ok) {
                const plans = await res.json()
                const found = plans.find(p => Number(p.id) === Number(id))
                if (found) setSelectedPlan(found)
            }
        } catch (err) {
            console.error('Erro ao buscar plano selecionado:', err)
        }
    }

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (formData.password !== formData.confirmPassword) {
            setError('As senhas não coincidem')
            return
        }

        if (formData.password.length < 8) {
            setError('A senha deve ter pelo menos 8 caracteres')
            return
        }

        setLoading(true)
        setLoadingStatus('Criando sua conta...')

        try {
            const targetPlanId = selectedPlan ? selectedPlan.id : (planIdParam ? Number(planIdParam) : null)
            const user = await register(formData.name, formData.email, formData.password, targetPlanId)

            // If user requires payment (paid plan selected), immediately redirect to Stripe Checkout!
            if (user?.requiresPayment || (selectedPlan && Number(selectedPlan.price) > 0)) {
                setLoadingStatus('Conectando ao Stripe para pagamento via Pix / Cartão...')
                sessionStorage.removeItem('selectedPlanId')
                const token = localStorage.getItem('token')
                try {
                    const stripeRes = await fetch('/api/stripe/create-checkout-session', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ planId: targetPlanId })
                    })

                    const stripeData = await stripeRes.json()
                    if (stripeRes.ok && stripeData.url) {
                        window.location.href = stripeData.url
                        return
                    } else {
                        throw new Error(stripeData.message || 'Erro ao gerar checkout com Stripe.')
                    }
                } catch (stripeErr) {
                    console.error('Checkout error after register:', stripeErr)
                    // If session creation had an issue, account is created; navigate to /planos where user can retry directly
                    navigate(`/planos?pending=true&retryPlan=${targetPlanId}`)
                    return
                }
            }

            sessionStorage.removeItem('selectedPlanId')
            // Free plan
            navigate('/dashboard')
        } catch (err) {
            setError(err.message || 'Erro ao cadastrar')
            setLoading(false)
            setLoadingStatus('')
        }
    }

    const isPaidPlan = selectedPlan && Number(selectedPlan.price) > 0

    return (
        <div className="auth-page">
            <div className="container">
                <div className="auth-container">
                    <div className="auth-header">
                        <Link to="/" className="auth-logo">
                            <span>📊</span> SimulaMEI
                        </Link>
                        <h1 className="auth-title">
                            {isPaidPlan ? `Crie sua conta - Plano ${selectedPlan.name}` : 'Crie sua conta'}
                        </h1>
                        <p className="auth-subtitle">
                            {isPaidPlan
                                ? 'Cadastre-se abaixo para ir direto ao pagamento seguro via Pix ou Cartão'
                                : 'Comece a gerenciar seus impostos gratuitamente'}
                        </p>
                    </div>

                    {selectedPlan && (
                        <div style={{
                            background: isPaidPlan ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)' : '#f3f4f6',
                            border: isPaidPlan ? '1px solid #10b981' : '1px solid #e5e7eb',
                            borderRadius: '12px',
                            padding: '14px 18px',
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: isPaidPlan ? '#059669' : '#6b7280' }}>
                                    Plano Escolhido
                                </span>
                                <h3 style={{ margin: '2px 0 0 0', fontSize: '18px', color: '#111827' }}>
                                    Plano {selectedPlan.name}
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#4b5563' }}>
                                    {isPaidPlan ? 'Pagamento seguro no Stripe via Pix ou Cartão' : 'Acesso Grátis'}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '20px', fontWeight: '800', color: isPaidPlan ? '#059669' : '#111827' }}>
                                    {Number(selectedPlan.price) === 0 ? 'Grátis' : `R$ ${Number(selectedPlan.price).toFixed(2).replace('.', ',')}`}
                                </span>
                                {Number(selectedPlan.price) > 0 && <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>/mês</span>}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="auth-form">
                        {error && (
                            <div className="alert alert-danger">
                                <span>⚠️</span> {error}
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Nome completo</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Seu nome"
                                className="form-input"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">E-mail</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="seu@email.com"
                                className="form-input"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Senha</label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="Mínimo 8 caracteres"
                                className="form-input"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirmar senha</label>
                            <input
                                type="password"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                placeholder="Digite a senha novamente"
                                className="form-input"
                                required
                                disabled={loading}
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg auth-submit"
                            disabled={loading}
                        >
                            {loading ? (loadingStatus || 'Processando...') : (
                                isPaidPlan ? `💳 Cadastrar e Pagar Plano ${selectedPlan?.name || ''}` : '🚀 Criar Conta Grátis'
                            )}
                        </button>
                    </form>

                    <div className="auth-footer">
                        <p>
                            Já tem uma conta?{' '}
                            <Link to={planIdParam ? `/login?planId=${planIdParam}` : '/login'} className="auth-link">
                                Entrar
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
