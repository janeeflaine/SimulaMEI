import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Plans.css'
import PaymentModal from '../components/PaymentModal'

export default function Plans() {
    const { user, refreshUser } = useAuth()
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedPlan, setSelectedPlan] = useState(null)
    const [checkoutLoading, setCheckoutLoading] = useState(false)

    useEffect(() => {
        fetchPlans()
        // Check for Stripe Checkout success/cancel
        const query = new URLSearchParams(window.location.search)
        if (query.get('success')) {
            alert('Assinatura ativada com sucesso! Bem-vindo(a)!')
            // Clean URL
            window.history.replaceState(null, '', window.location.pathname)
            refreshUser()
            setTimeout(() => {
                window.location.href = '/dashboard'
            }, 1500)
        }
        if (query.get('canceled')) {
            alert('A assinatura foi cancelada. Você não foi cobrado.')
            window.history.replaceState(null, '', window.location.pathname)
        }
    }, [])

    const fetchPlans = async () => {
        try {
            const res = await fetch('/api/plans')
            const data = await res.json()
            setPlans(data.filter(p => p.isActive))
        } catch (error) {
            console.error('Erro ao carregar planos:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDowngrade = async () => {
        if (!confirm('Tem certeza que deseja cancelar seu plano atual e voltar para o gratuito? Todos os benefícios serão perdidos imediatamente.')) return

        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/plans/downgrade', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                await refreshUser()
                alert('Plano cancelado com sucesso.')
                window.location.href = '/dashboard'
            } else {
                alert('Erro ao cancelar plano.')
            }
        } catch (error) {
            console.error(error)
            alert('Erro ao processar solicitação.')
        }
    }

    const handleCheckout = async (plan) => {
        setCheckoutLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/stripe/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ planId: plan.id })
            })
            const body = await res.json()

            if (res.ok && body.url) {
                window.location.href = body.url // Redirect to Stripe
            } else {
                alert(body.message || 'Erro ao iniciar o checkout seguro.')
                setCheckoutLoading(false)
            }
        } catch (error) {
            console.error('Checkout error:', error)
            alert('Erro de comunicação. Tente novamente mais tarde.')
            setCheckoutLoading(false)
        }
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const featureLabels = {
        historico: 'Histórico de simulações',
        pdf: 'Exportar relatórios em PDF',
        comparativo: 'Comparativo MEI x ME',
        alertas: 'Alertas de limite personalizados'
    }

    return (
        <div className="plans-page">
            <div className="container">
                {/* Header */}
                <div className="plans-header">
                    <span className="plans-badge">💎 Escolha seu plano</span>
                    <h1>Planos que cabem no seu bolso</h1>
                    <p>Comece grátis e faça upgrade quando precisar de mais recursos</p>
                </div>

                {/* Plans Grid */}
                {loading ? (
                    <div className="flex items-center justify-center" style={{ padding: 'var(--spacing-8)' }}>
                        <div className="loader"></div>
                    </div>
                ) : (
                    <div className="plans-grid">
                        {plans.map((plan) => {
                            const isCurrentPlan = Number(user?.planId) === Number(plan.id) || user?.plan === plan.name
                            const userCurrentPlan = plans.find(p => Number(p.id) === Number(user?.planId)) || plans.find(p => p.name === user?.plan)
                            const isDowngrade = userCurrentPlan && Number(plan.price) < Number(userCurrentPlan.price)
                            const isPopular = plan.name === 'Ouro'

                            return (
                                <div
                                    key={plan.id}
                                    className={`plan-card ${isPopular ? 'featured' : ''} ${isCurrentPlan ? 'current' : ''}`}
                                >
                                    {isPopular && <span className="featured-badge">Mais Popular</span>}
                                    {isCurrentPlan && <span className="current-badge">Seu Plano</span>}

                                    <h2 className="plan-name">{plan.name}</h2>

                                    <div className="plan-price">
                                        {plan.price === 0 ? (
                                            <span className="price-free">Grátis</span>
                                        ) : (
                                            <>
                                                <span className="price-currency">R$</span>
                                                <span className="price-value">{plan.price.toFixed(2).replace('.', ',')}</span>
                                                <span className="price-period">/mês</span>
                                            </>
                                        )}
                                    </div>

                                    <ul className="plan-features">
                                        <li className="feature included">
                                            <svg className="feature-icon included" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            Simulações ilimitadas
                                        </li>
                                        {Object.entries(featureLabels).map(([key, label]) => (
                                            <li key={key} className={`feature ${plan.features?.[key] ? 'included' : 'excluded'}`}>
                                                {plan.features?.[key] ? (
                                                    <svg className="feature-icon included" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                ) : (
                                                    <svg className="feature-icon excluded" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                                {label}
                                            </li>
                                        ))}
                                    </ul>

                                    {user ? (
                                        isCurrentPlan ? (
                                            <button className="btn btn-secondary btn-lg" disabled>
                                                Plano Atual
                                            </button>
                                        ) : (
                                            <button
                                                className="btn btn-primary btn-lg"
                                                onClick={() => isDowngrade ? handleDowngrade() : handleCheckout(plan)}
                                                disabled={checkoutLoading}
                                            >
                                                {checkoutLoading ? 'Redirecionando...' : (isDowngrade ? 'Cancelar Assinatura' : 'Fazer Upgrade')}
                                            </button>
                                        )
                                    ) : (
                                        <Link to="/cadastro" className="btn btn-primary btn-lg">
                                            Começar Agora
                                        </Link>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Benefits Section */}
                <div className="plans-benefits">
                    <h2>Por que fazer upgrade?</h2>
                    <div className="benefits-grid">
                        <div className="benefit-item">
                            <span className="benefit-icon">📊</span>
                            <h3>Histórico Completo</h3>
                            <p>Acompanhe todas as suas simulações e veja a evolução do seu negócio ao longo do tempo.</p>
                        </div>
                        <div className="benefit-item">
                            <span className="benefit-icon">📄</span>
                            <h3>Relatórios em PDF</h3>
                            <p>Exporte relatórios profissionais para compartilhar com seu contador ou para seus registros.</p>
                        </div>
                        <div className="benefit-item">
                            <span className="benefit-icon">⚖️</span>
                            <h3>Comparativo MEI x ME</h3>
                            <p>Descubra quando vale a pena migrar para Microempresa com análise detalhada de custos.</p>
                        </div>
                        <div className="benefit-item">
                            <span className="benefit-icon">🔔</span>
                            <h3>Alertas Personalizados</h3>
                            <p>Receba notificações quando estiver próximo do limite de faturamento do MEI.</p>
                        </div>
                    </div>
                </div>

                {/* FAQ */}
                <div className="plans-faq">
                    <h2>Perguntas Frequentes</h2>
                    <div className="faq-list">
                        <div className="faq-item">
                            <h4>Posso cancelar a qualquer momento?</h4>
                            <p>Sim! Você pode fazer downgrade ou cancelar seu plano a qualquer momento, sem multas.</p>
                        </div>
                        <div className="faq-item">
                            <h4>Os valores das simulações são precisos?</h4>
                            <p>Os valores são estimativas baseadas nas regras vigentes. Recomendamos sempre consultar um contador.</p>
                        </div>
                        <div className="faq-item">
                            <h4>Como funciona o pagamento?</h4>
                            <p>Aceitamos cartão de crédito e PIX. A cobrança é mensal e você pode cancelar quando quiser.</p>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    )
}
