import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Plans.css'

export default function Plans() {
    const navigate = useNavigate()
    const { user, refreshUser } = useAuth()
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [verificationState, setVerificationState] = useState({
        loading: false,
        success: false,
        message: ''
    })

    useEffect(() => {
        fetchPlans()

        // Check for Stripe Checkout success/cancel
        const query = new URLSearchParams(window.location.search)
        const sessionId = query.get('session_id')
        const success = query.get('success')
        const canceled = query.get('canceled')

        if (sessionId) {
            handleVerifyStripeSession(sessionId)
        } else if (success) {
            setVerificationState({
                loading: false,
                success: true,
                message: 'Assinatura confirmada com sucesso! Atualizando seus dados...'
            })
            window.history.replaceState(null, '', window.location.pathname)
            refreshUser().then(() => {
                setTimeout(() => {
                    navigate('/dashboard')
                }, 2000)
            })
        }

        if (canceled) {
            alert('A transação foi cancelada no Stripe. Nenhuma cobrança foi efetuada.')
            window.history.replaceState(null, '', window.location.pathname)
        }
    }, [])

    const handleVerifyStripeSession = async (sessionId) => {
        setVerificationState({
            loading: true,
            success: false,
            message: 'Verificando confirmação de pagamento junto ao Stripe...'
        })

        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/stripe/verify-session?session_id=${sessionId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            const data = await res.json()

            if (res.ok && data.verified) {
                await refreshUser()
                setVerificationState({
                    loading: false,
                    success: true,
                    message: '✅ Pagamento aprovado no Stripe! Liberando acesso ao seu painel...'
                })
                window.history.replaceState(null, '', window.location.pathname)
                setTimeout(() => {
                    navigate('/dashboard')
                }, 2000)
            } else {
                setVerificationState({
                    loading: false,
                    success: false,
                    message: data.message || 'Pagamento ainda não foi concluído no Stripe. Se você pagou via Pix, aguarde alguns instantes pela confirmação.'
                })
                window.history.replaceState(null, '', window.location.pathname)
            }
        } catch (err) {
            console.error('Erro ao verificar Stripe:', err)
            setVerificationState({
                loading: false,
                success: false,
                message: 'Não foi possível verificar automaticamente. Se o Pix foi pago, seu plano será liberado em instantes.'
            })
            window.history.replaceState(null, '', window.location.pathname)
        }
    }

    const fetchPlans = async () => {
        try {
            const res = await fetch('/api/plans')
            const data = await res.json()
            const activePlans = data.filter(p => p.isActive)
            setPlans(activePlans)

            // Auto checkout if requested (e.g. from login redirect)
            const query = new URLSearchParams(window.location.search)
            const autoCheckout = query.get('autoCheckout')
            const selectedId = query.get('selected')
            if (autoCheckout === 'true' && selectedId && user) {
                const targetPlan = activePlans.find(p => Number(p.id) === Number(selectedId))
                if (targetPlan && Number(targetPlan.price) > 0) {
                    window.history.replaceState(null, '', window.location.pathname)
                    handleCheckout(targetPlan)
                }
            }
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
                navigate('/dashboard')
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
                // Redirect user to Stripe hosted checkout (Pix, Cartão, Boleto)
                window.location.href = body.url
            } else {
                alert(body.message || 'Erro ao iniciar o checkout seguro.')
                setCheckoutLoading(false)
            }
        } catch (error) {
            console.error('Checkout error:', error)
            alert('Erro de comunicação com o servidor. Tente novamente mais tarde.')
            setCheckoutLoading(false)
        }
    }

    const featureLabels = {
        historico: 'Histórico de simulações',
        pdf: 'Exportar relatórios em PDF',
        comparativo: 'Comparativo MEI x ME',
        alertas: 'Alertas de limite personalizados',
        contas_pagar: 'Contas a pagar e receber',
        upload_faturas: 'Leitura de faturas com IA'
    }

    const isPendingPayment = user?.subscriptionStatus === 'pending_payment'
    const query = new URLSearchParams(window.location.search)
    const showPendingAlert = isPendingPayment || query.get('pending')

    return (
        <div className="plans-page">
            <div className="container">

                {/* Verification Overlay / Alert */}
                {verificationState.loading && (
                    <div className="alert alert-info" style={{
                        background: '#eff6ff',
                        border: '1px solid #3b82f6',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        marginBottom: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <div className="loader" style={{ width: '24px', height: '24px' }}></div>
                        <span style={{ color: '#1e40af', fontWeight: '500' }}>{verificationState.message}</span>
                    </div>
                )}

                {verificationState.success && (
                    <div className="alert alert-success" style={{
                        background: '#ecfdf5',
                        border: '1px solid #10b981',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        marginBottom: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <span style={{ fontSize: '20px' }}>🎉</span>
                        <span style={{ color: '#065f46', fontWeight: '600' }}>{verificationState.message}</span>
                    </div>
                )}

                {verificationState.message && !verificationState.loading && !verificationState.success && (
                    <div className="alert alert-warning" style={{
                        background: '#fffbeb',
                        border: '1px solid #f59e0b',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        marginBottom: '24px'
                    }}>
                        <span style={{ color: '#92400e', fontWeight: '500' }}>{verificationState.message}</span>
                    </div>
                )}

                {showPendingAlert && !verificationState.loading && (
                    <div style={{
                        background: '#fef2f2',
                        border: '2px solid #ef4444',
                        padding: '18px 24px',
                        borderRadius: '12px',
                        marginBottom: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '16px'
                    }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '28px' }}>⚠️</span>
                                <div>
                                    <h3 style={{ margin: 0, color: '#991b1b', fontSize: '17px' }}>
                                        Pagamento Pendente no Stripe
                                    </h3>
                                    <p style={{ margin: '4px 0 0 0', color: '#b91c1c', fontSize: '14px' }}>
                                        O seu acesso aos recursos exclusivos requer a confirmação do pagamento via Pix ou Cartão junto ao Stripe.
                                    </p>
                                </div>
                            </div>
                            {(() => {
                                const pendingPlan = plans.find(p => Number(p.id) === Number(user?.planId)) ||
                                                    plans.find(p => Number(p.id) === Number(query.get('retryPlan')))
                                if (pendingPlan) {
                                    return (
                                        <button
                                            className="btn btn-primary"
                                            style={{ background: '#ef4444', borderColor: '#dc2626', fontWeight: 'bold' }}
                                            onClick={() => handleCheckout(pendingPlan)}
                                            disabled={checkoutLoading}
                                        >
                                            {checkoutLoading ? 'Conectando...' : `💳 Concluir Pagamento (${pendingPlan.name})`}
                                        </button>
                                    )
                                }
                                return null
                            })()}
                        </div>
                    )}

                {/* Header */}
                <div className="plans-header">
                    <span className="plans-badge">💎 Escolha seu plano</span>
                    <h1>Planos que cabem no seu bolso</h1>
                    <p>Comece grátis ou turbine seu negócio com os planos profissionais com pagamento via Pix ou Cartão</p>
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
                            const isPaid = Number(plan.price) > 0

                            return (
                                <div
                                    key={plan.id}
                                    className={`plan-card ${isPopular ? 'featured' : ''} ${isCurrentPlan ? 'current' : ''}`}
                                >
                                    {isPopular && <span className="featured-badge">Mais Popular</span>}
                                    {isCurrentPlan && (
                                        <span className={`current-badge ${isPendingPayment ? 'pending' : ''}`} style={isPendingPayment ? { background: '#f59e0b', color: '#fff' } : {}}>
                                            {isPendingPayment ? 'Pagamento Pendente' : 'Seu Plano'}
                                        </span>
                                    )}

                                    <h2 className="plan-name">{plan.name}</h2>

                                    <div className="plan-price">
                                        {!isPaid ? (
                                            <span className="price-free">Grátis</span>
                                        ) : (
                                            <>
                                                <span className="price-currency">R$</span>
                                                <span className="price-value">{Number(plan.price).toFixed(2).replace('.', ',')}</span>
                                                <span className="price-period">/mês</span>
                                            </>
                                        )}
                                    </div>

                                    {isPaid && (
                                        <div style={{ fontSize: '13px', color: '#059669', fontWeight: '500', marginBottom: '16px' }}>
                                            ⚡ Pix Instantâneo ou Cartão via Stripe
                                        </div>
                                    )}

                                    <ul className="plan-features">
                                        <li className="feature included">
                                            <svg className="feature-icon included" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            Simulações ilimitadas
                                        </li>
                                        {Object.entries(featureLabels).map(([key, label]) => {
                                            const isIncluded = plan.features?.[key]
                                            return (
                                                <li key={key} className={`feature ${isIncluded ? 'included' : 'excluded'}`}>
                                                    {isIncluded ? (
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
                                            )
                                        })}
                                    </ul>

                                    {user ? (
                                        isCurrentPlan ? (
                                            isPendingPayment ? (
                                                <button
                                                    className="btn btn-warning btn-lg"
                                                    style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff', fontWeight: 'bold' }}
                                                    onClick={() => handleCheckout(plan)}
                                                    disabled={checkoutLoading}
                                                >
                                                    {checkoutLoading ? 'Conectando ao Stripe...' : '💳 Pagar no Stripe (Pix)'}
                                                </button>
                                            ) : (
                                                <button className="btn btn-secondary btn-lg" disabled>
                                                    Plano Atual
                                                </button>
                                            )
                                        ) : (
                                            <button
                                                className="btn btn-primary btn-lg"
                                                onClick={() => isDowngrade ? handleDowngrade() : handleCheckout(plan)}
                                                disabled={checkoutLoading}
                                            >
                                                {checkoutLoading ? 'Conectando ao Stripe...' : (isDowngrade ? 'Cancelar Assinatura' : 'Fazer Upgrade')}
                                            </button>
                                        )
                                    ) : (
                                        <button
                                            onClick={() => {
                                                sessionStorage.setItem('selectedPlanId', String(plan.id))
                                                navigate(`/cadastro?planId=${plan.id}`)
                                            }}
                                            className="btn btn-primary btn-lg"
                                        >
                                            {isPaid ? `Escolher Plano ${plan.name}` : 'Começar Grátis'}
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Benefits Section */}
                <div className="plans-benefits">
                    <h2>Por que escolher o SimulaMEI Premium?</h2>
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
                            <h4>Como funciona o pagamento via Pix com o Stripe?</h4>
                            <p>Ao selecionar seu plano, você é direcionado para a página segura do Stripe, onde pode escolher pagar por Pix (com QR Code instantâneo e código Copia e Cola) ou Cartão de Crédito.</p>
                        </div>
                        <div className="faq-item">
                            <h4>Posso cancelar a qualquer momento?</h4>
                            <p>Sim! Você pode fazer downgrade ou cancelar seu plano a qualquer momento, sem multas ou fidelidade.</p>
                        </div>
                        <div className="faq-item">
                            <h4>Quando meu acesso é liberado?</h4>
                            <p>Assim que o Stripe confirmar o pagamento do Pix ou aprovação do cartão, seu plano é liberado automaticamente.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
