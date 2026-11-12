import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import MemberCard from '../components/plans/MemberCard'
import PlanComparison, { PlanTableButton } from '../components/plans/PlanComparison'
import { FEATURE_LABELS, tierOf, formatBRL, sortPlans } from '../components/plans/planFeatures'
import usePlanActions from '../hooks/usePlanActions'
import './Plans.css'

const FAQ = [
    {
        q: 'Como eu pago?',
        a: 'Ao escolher o plano, você vai para a página segura do Stripe e paga com Pix (QR Code ou copia e cola) ou cartão de crédito.'
    },
    {
        q: 'Quando o plano é liberado?',
        a: 'Assim que o Stripe confirmar o Pix ou aprovar o cartão. Normalmente leva poucos segundos.'
    },
    {
        q: 'Posso cancelar quando quiser?',
        a: 'Sim, sem multa e sem fidelidade. Você continua com o plano até o fim do período já pago e não há nova cobrança.'
    },
    {
        q: 'Como funciona o assistente no WhatsApp?',
        a: 'Você conecta seu número em Minha conta e manda mensagens como "gastei 50 no mercado no pix". O assistente mostra um resumo e só salva depois que você confirma.'
    }
]

export default function Plans() {
    const navigate = useNavigate()
    const { user, refreshUser } = useAuth()
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const { busy: checkoutLoading, checkout: handleCheckout, actionFor: planAction } = usePlanActions({ onChanged: () => navigate('/dashboard') })
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
                    message: 'Pagamento aprovado! Liberando acesso ao seu painel...'
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
            const activePlans = sortPlans(data)
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

    const isPendingPayment = user?.subscriptionStatus === 'pending_payment'
    const query = new URLSearchParams(window.location.search)
    const showPendingAlert = isPendingPayment || query.get('pending')

    const userCurrentPlan = plans.find(p => Number(p.id) === Number(user?.planId)) || plans.find(p => p.name === user?.plan)
    const isCurrentPlan = (plan) => !!user && (Number(user?.planId) === Number(plan.id) || user?.plan === plan.name)
    const pendingPlan = plans.find(p => Number(p.id) === Number(user?.planId)) ||
        plans.find(p => Number(p.id) === Number(query.get('retryPlan')))
    const mostComplete = plans.length > 1 ? plans[plans.length - 1] : null
    const mediaPlan = plans.find(p => p.features?.whatsapp_midia)
    const hasWhatsapp = plans.some(p => p.features?.whatsapp)

    /** O que o plano tem a mais que o plano anterior (o mais barato mostra o que já inclui). */
    const highlightsOf = (plan, index) => {
        const has = (p, key) => !!p?.features?.[key]
        const previous = index > 0 ? plans[index - 1] : null
        const keys = FEATURE_LABELS.filter(([key]) => has(plan, key) && !has(previous, key))
        return { previous, items: keys.map(([, label]) => label) }
    }

    /** Ação de cada plano (cartão e tabela). Visitante vai para o cadastro; logado usa a regra de cobrança. */
    const actionFor = (plan) => {
        if (!user) {
            const isPaid = Number(plan.price) > 0
            return {
                label: isPaid ? `Assinar ${plan.name}` : 'Começar grátis',
                short: isPaid ? 'Assinar' : 'Começar',
                up: isPaid,
                onClick: () => {
                    sessionStorage.setItem('selectedPlanId', String(plan.id))
                    navigate(`/cadastro?planId=${plan.id}`)
                }
            }
        }
        const action = planAction(plan, userCurrentPlan)
        if (!action) return null
        return {
            ...action,
            label: checkoutLoading ? 'Aguarde...' : action.label,
            onClick: action.run,
            disabled: checkoutLoading
        }
    }

    const isCanceling = !!user && user.subscriptionStatus === 'canceling'
    const endsOn = user?.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString('pt-BR') : null

    return (
        <div className="pricing-page">
            <div className="container pricing-container">

                {/* Avisos do pagamento */}
                {verificationState.loading && (
                    <div className="pricing-alert pricing-alert--info" role="status">
                        <div className="loader pricing-alert__loader"></div>
                        <span>{verificationState.message}</span>
                    </div>
                )}

                {verificationState.success && (
                    <div className="pricing-alert pricing-alert--ok" role="status">
                        <span>{verificationState.message}</span>
                    </div>
                )}

                {verificationState.message && !verificationState.loading && !verificationState.success && (
                    <div className="pricing-alert pricing-alert--warn" role="status">
                        <span>{verificationState.message}</span>
                    </div>
                )}

                {showPendingAlert && !verificationState.loading && (
                    <div className="pricing-alert pricing-alert--pending" role="alert">
                        <div>
                            <strong>Falta concluir o pagamento</strong>
                            <p>Os recursos do plano são liberados quando o Stripe confirmar o Pix ou o cartão.</p>
                        </div>
                        {pendingPlan && (
                            <button
                                type="button"
                                className="pricing-cta pricing-cta--up"
                                onClick={() => handleCheckout(pendingPlan)}
                                disabled={checkoutLoading}
                            >
                                {checkoutLoading ? 'Abrindo pagamento...' : `Pagar o ${pendingPlan.name}`}
                            </button>
                        )}
                    </div>
                )}

                <header className="pricing-header">
                    <h1>Escolha o plano do seu MEI</h1>
                    <p>Comece grátis e assine quando precisar. Pague com Pix ou cartão e cancele quando quiser, sem multa.</p>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center" style={{ padding: 'var(--spacing-8)' }}>
                        <div className="loader"></div>
                    </div>
                ) : (
                    <>
                        <div className="pricing-choices">
                            {plans.map((plan, index) => {
                                const tier = tierOf(plan.name)
                                const isPaid = Number(plan.price) > 0
                                const current = isCurrentPlan(plan)
                                const action = actionFor(plan)
                                const { previous, items } = highlightsOf(plan, index)
                                const [reais, centavos] = Number(plan.price).toFixed(2).split('.')
                                return (
                                    <article
                                        key={plan.id}
                                        className={`pricing-choice ${current ? 'is-current' : ''}`}
                                        aria-label={`Plano ${plan.name}`}
                                    >
                                        {mostComplete && plan.id === mostComplete.id && !current && (
                                            <span className="pricing-choice__tag">Mais completo</span>
                                        )}
                                        {current && (
                                            <span className={`pricing-choice__tag pricing-choice__tag--current ${isPendingPayment || isCanceling ? 'is-pending' : ''}`}>
                                                {isPendingPayment ? 'Pagamento pendente' : isCanceling ? 'Cancelado' : 'Seu plano'}
                                            </span>
                                        )}
                                        <MemberCard
                                            tier={tier}
                                            label={plan.name}
                                            body={
                                                isPaid ? (
                                                    <span className="member-card__price" aria-label={`${formatBRL(plan.price)} por mês`}>
                                                        <span>R$</span>
                                                        <strong>{reais},{centavos}</strong>
                                                        <span>/mês</span>
                                                    </span>
                                                ) : (
                                                    <span className="member-card__price"><strong>Grátis</strong></span>
                                                )
                                            }
                                            footer={
                                                <span className="member-card__note">
                                                    {isPaid ? 'Pix ou cartão, sem fidelidade' : 'Sem pagamento'}
                                                </span>
                                            }
                                        />

                                        <div className="pricing-choice__body">
                                            <p className="pricing-choice__lead">
                                                {previous ? `Tudo do ${previous.name}, e mais:` : 'Para começar:'}
                                            </p>
                                            <ul className="pricing-choice__list">
                                                {items.slice(0, 5).map(item => <li key={item}>{item}</li>)}
                                                {items.length > 5 && (
                                                    <li className="pricing-choice__more">
                                                        <a href="#comparar">e mais {items.length - 5} na comparação</a>
                                                    </li>
                                                )}
                                            </ul>
                                        </div>

                                        {current && isCanceling && (
                                            <p className="pricing-choice__notice">
                                                {endsOn ? `Seu plano vale até ${endsOn} e não será renovado.` : 'Seu plano não será renovado.'}
                                            </p>
                                        )}
                                        {action ? (
                                            <button
                                                type="button"
                                                className={`pricing-cta ${action.up ? 'pricing-cta--up' : ''}`}
                                                onClick={action.onClick}
                                                disabled={action.disabled}
                                            >
                                                {action.label}
                                            </button>
                                        ) : (
                                            <p className="pricing-choice__current">
                                                {current
                                                    ? 'Este é o seu plano atual'
                                                    : (endsOn ? `Você volta para este plano em ${endsOn}` : 'Você volta para este plano no fim do período')}
                                            </p>
                                        )}
                                    </article>
                                )
                            })}
                        </div>

                        {hasWhatsapp && (
                            <section className="pricing-whatsapp" aria-labelledby="whatsapp-titulo">
                                <div className="pricing-whatsapp__text">
                                    <h2 id="whatsapp-titulo">Lance e pague contas pelo WhatsApp</h2>
                                    <p>Mande uma mensagem do seu jeito. O assistente entende, mostra o resumo e só salva quando você confirma.</p>
                                    <ul>
                                        <li>Despesas, receitas e contas a pagar por texto</li>
                                        <li>Lança na carteira certa: sua, da empresa ou de outra pessoa da conta</li>
                                        <li>Lembrete às 8h quando tem conta vencendo</li>
                                        {mediaPlan && <li>No {mediaPlan.name}, também por áudio e foto do boleto</li>}
                                    </ul>
                                </div>
                                <div className="pricing-chat" aria-label="Exemplo de conversa com o assistente">
                                    <div className="pricing-chat__bubble pricing-chat__bubble--me">gastei 50 no mercado no pix</div>
                                    <div className="pricing-chat__bubble">
                                        <span>Confere?</span>
                                        <span><b>Despesa:</b> Mercado</span>
                                        <span><b>Valor:</b> R$ 50,00</span>
                                        <span><b>Pagamento:</b> PIX</span>
                                        <span className="pricing-chat__buttons" aria-hidden="true">
                                            <i>Confirmar</i><i>Cancelar</i>
                                        </span>
                                    </div>
                                    <div className="pricing-chat__bubble pricing-chat__bubble--me">Confirmar</div>
                                    <div className="pricing-chat__bubble">Registrado! Já aparece no seu extrato.</div>
                                </div>
                            </section>
                        )}

                        <section className="pricing-compare" id="comparar" aria-labelledby="comparar-titulo">
                            <h2 id="comparar-titulo">Compare os planos</h2>
                            <PlanComparison
                                plans={plans}
                                currentPlanId={user ? userCurrentPlan?.id : null}
                                currentLabel={isPendingPayment ? 'Pagamento pendente' : isCanceling && endsOn ? `Vale até ${endsOn}` : 'Seu plano'}
                                renderAction={(plan) => {
                                    const action = actionFor(plan)
                                    if (!action) return <span className="plan-table__current-note">Plano atual</span>
                                    return (
                                        <PlanTableButton
                                            planName={plan.name}
                                            up={action.up}
                                            onClick={action.onClick}
                                            disabled={action.disabled}
                                            shortLabel={action.short}
                                        >
                                            {action.label}
                                        </PlanTableButton>
                                    )
                                }}
                            />
                        </section>
                    </>
                )}

                <section className="pricing-faq" aria-labelledby="faq-titulo">
                    <h2 id="faq-titulo">Perguntas frequentes</h2>
                    {FAQ.map(item => (
                        <details key={item.q} className="pricing-faq__item">
                            <summary>{item.q}</summary>
                            <p>{item.a}</p>
                        </details>
                    ))}
                </section>
            </div>
        </div>
    )
}
