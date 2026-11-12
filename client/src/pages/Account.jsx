import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import WhatsAppSection from '../components/WhatsAppSection'
import './Account.css'

// Nome que o usuário entende para cada recurso do plano (as chaves vêm do painel admin).
// Recursos fora desta lista não aparecem na comparação.
const FEATURE_LABELS = [
    ['whatsapp', 'Assistente no WhatsApp'],
    ['whatsapp_midia', 'Áudio, foto e PDF no WhatsApp'],
    ['contas_pagar', 'Contas a pagar com lembrete'],
    ['upload_faturas', 'Leitura de faturas com IA'],
    ['multi_carteiras', 'Várias carteiras (PF e MEI)'],
    ['transferencias', 'Transferência entre carteiras'],
    ['pdf', 'Relatórios em PDF'],
    ['historico', 'Histórico de simulações'],
    ['cartoes', 'Cartões de crédito'],
    ['categorias', 'Categorias personalizadas'],
    ['alertas', 'Alerta do limite anual do MEI'],
    ['comparativo', 'Comparativo MEI x ME']
]

const brDate = (value) => {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR')
}

const tierOf = (planName) => {
    const name = String(planName || '').toLowerCase()
    if (name.includes('ouro')) return 'ouro'
    if (name.includes('prata')) return 'prata'
    return 'gratuito'
}

/** Foto da conta: logo da primeira carteira criada (a mesma do avatar no topo). */
function useAccountPhoto(userId) {
    const [photo, setPhoto] = useState('')
    useEffect(() => {
        if (!userId) return undefined
        let cancelled = false
        const load = async () => {
            try {
                const res = await fetch('/api/finance/business-units', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                })
                if (!res.ok) return
                const data = await res.json()
                const first = [...data].sort((a, b) => {
                    const byDate = new Date(a.createdAt) - new Date(b.createdAt)
                    return byDate !== 0 && !Number.isNaN(byDate) ? byDate : a.id - b.id
                })[0]
                if (!cancelled) setPhoto(first?.logo_url || '')
            } catch (_) { /* sem foto, usa a inicial */ }
        }
        load()
        return () => { cancelled = true }
    }, [userId])
    return photo
}

function Check({ on }) {
    return on ? (
        <svg className="plan-check" viewBox="0 0 20 20" aria-label="Incluído" role="img">
            <circle cx="10" cy="10" r="9" />
            <path d="M6 10.4l2.6 2.6L14 7.6" />
        </svg>
    ) : (
        <span className="plan-dash" aria-label="Não incluído" role="img">–</span>
    )
}

export default function Account() {
    const { user, logout } = useAuth()
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()
    const [showDeleteForm, setShowDeleteForm] = useState(false)
    const [deleteForm, setDeleteForm] = useState({ password: '', confirmation: '' })
    const [deleteError, setDeleteError] = useState('')
    const [deleting, setDeleting] = useState(false)
    const photo = useAccountPhoto(user?.id)

    useEffect(() => {
        fetchPlans()
    }, [])

    const fetchPlans = async () => {
        try {
            const res = await fetch('/api/plans')
            const data = await res.json()
            setPlans(data.filter(p => p.isActive).sort((a, b) => Number(a.price) - Number(b.price)))
        } catch (error) {
            console.error('Erro ao carregar planos:', error)
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const handleUpgrade = async (planId) => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/stripe/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ planId })
            })
            const data = await res.json()
            if (res.ok && data.url) {
                window.location.href = data.url
            } else {
                alert(data.message || 'Erro ao iniciar pagamento com Stripe')
            }
        } catch (e) {
            window.location.href = '/planos'
        }
    }

    const handleDeleteAccount = async (e) => {
        e.preventDefault()
        setDeleteError('')

        if (deleteForm.confirmation !== 'EXCLUIR') {
            setDeleteError('Digite EXCLUIR (em letras maiúsculas) para confirmar.')
            return
        }

        setDeleting(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/auth/me', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(deleteForm)
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setDeleteError(data.message || 'Não foi possível excluir a conta.')
                setDeleting(false)
                return
            }
            logout()
            alert(data.message || 'Sua conta foi excluída.')
            navigate('/')
        } catch (err) {
            setDeleteError('Erro de conexão. Nenhum dado foi excluído; tente novamente.')
            setDeleting(false)
        }
    }

    const planName = user?.plan || 'Gratuito'
    const tier = tierOf(planName)
    const currentPlan = plans.find(p => p.id === user?.planId)
    const currentPrice = Number(currentPlan?.price ?? 0)
    const expiresOn = brDate(user?.planExpiresAt)
    const initial = (user?.name || '?').trim().charAt(0).toUpperCase()
    const nameParts = String(user?.name || '').trim().split(/\s+/)
    const cardName = nameParts.length > 2 ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}` : (user?.name || '')

    let status = { label: 'Ativo', tone: 'ok' }
    if (user?.role === 'ADMIN') status = { label: 'Administrador', tone: 'ok' }
    else if (user?.isInTrial) status = { label: expiresOn ? `Teste grátis até ${expiresOn}` : 'Teste grátis', tone: 'info' }
    else if (user?.subscriptionStatus === 'pending_payment') status = { label: 'Pagamento pendente', tone: 'warn' }

    const renewal = !user?.isInTrial && user?.subscriptionStatus === 'active' && expiresOn && tier !== 'gratuito'
        ? `Renova em ${expiresOn}` : null

    const nextStep = {
        gratuito: 'Com o Prata você usa o assistente no WhatsApp, contas a pagar com lembrete e várias carteiras.',
        prata: 'Com o Ouro você também manda áudio, foto de boleto e comprovante pelo WhatsApp.',
        ouro: 'Você tem todos os recursos do EuSempreMEI liberados.'
    }[tier]

    const featureRows = FEATURE_LABELS.filter(([key]) => plans.some(p => p.features && key in p.features))

    return (
        <div className="account-page">
            <div className="container account-container">
                <h1 className="account-title">Minha conta</h1>

                {/* Cartão do plano + dados da conta */}
                <section className="account-hero" aria-label="Seu plano e seus dados">
                    <div className={`member-card member-card--${tier}`}>
                        <div className="member-card__top">
                            <span className="member-card__mark" aria-hidden="true">
                                <i /><i /><i />
                            </span>
                            <span className="member-card__brand">EuSempreMEI</span>
                            <span className="member-card__tier">{planName}</span>
                        </div>
                        <div className="member-card__holder">
                            <span className="member-card__photo">
                                {photo ? <img src={photo} alt="" /> : <span aria-hidden="true">{initial}</span>}
                            </span>
                            <span className="member-card__name">{cardName}</span>
                        </div>
                        <div className="member-card__bottom">
                            <span className={`member-card__status member-card__status--${status.tone}`}>{status.label}</span>
                            {renewal && <span className="member-card__renewal">{renewal}</span>}
                        </div>
                    </div>

                    <div className="account-summary">
                        <dl className="account-facts">
                            <div>
                                <dt>Nome</dt>
                                <dd>{user?.name}</dd>
                            </div>
                            <div>
                                <dt>E-mail</dt>
                                <dd>{user?.email}</dd>
                            </div>
                            <div>
                                <dt>Plano</dt>
                                <dd>
                                    {planName}
                                    {currentPlan && currentPrice > 0 && <span className="account-facts__muted">, {formatCurrency(currentPrice)} por mês</span>}
                                </dd>
                            </div>
                        </dl>
                        <p className="account-next">
                            {nextStep}{' '}
                            {tier !== 'ouro' && <a href="#planos">Comparar planos</a>}
                        </p>
                    </div>
                </section>

                <div className="account-block account-block--whatsapp">
                    <WhatsAppSection />
                </div>

                {/* Comparação de planos */}
                <section className="account-block" id="planos" aria-labelledby="planos-titulo">
                    <h2 id="planos-titulo" className="account-block__title">Planos</h2>
                    <p className="account-block__intro">O que cada plano inclui. Você pode mudar quando quiser.</p>

                    {loading ? (
                        <div className="flex items-center justify-center" style={{ padding: 'var(--spacing-8)' }}>
                            <div className="loader"></div>
                        </div>
                    ) : (
                        <div className="plan-table-wrap">
                            <table className="plan-table">
                                <caption className="sr-only">Comparação dos planos do EuSempreMEI</caption>
                                <thead>
                                    <tr>
                                        <th scope="col" className="plan-table__feature-head"><span className="sr-only">Recurso</span></th>
                                        {plans.map(plan => {
                                            const isCurrent = user?.planId === plan.id
                                            return (
                                                <th key={plan.id} scope="col" className={isCurrent ? 'is-current' : ''}>
                                                    {isCurrent && <span className="plan-table__yours">Seu plano</span>}
                                                    <span className="plan-table__name">{plan.name}</span>
                                                    <span className="plan-table__price">
                                                        {Number(plan.price) === 0
                                                            ? 'Grátis'
                                                            : <>{formatCurrency(plan.price)}<small>/mês</small></>}
                                                    </span>
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {featureRows.map(([key, label]) => (
                                        <tr key={key}>
                                            <th scope="row">{label}</th>
                                            {plans.map(plan => (
                                                <td key={plan.id} className={user?.planId === plan.id ? 'is-current' : ''}>
                                                    <Check on={!!plan.features?.[key]} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <th scope="row"><span className="sr-only">Ação</span></th>
                                        {plans.map(plan => {
                                            const isCurrent = user?.planId === plan.id
                                            const isUp = Number(plan.price) > currentPrice
                                            return (
                                                <td key={plan.id} className={isCurrent ? 'is-current' : ''}>
                                                    {isCurrent ? (
                                                        <span className="plan-table__current-note">Plano atual</span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className={`plan-table__action ${isUp ? 'is-up' : ''}`}
                                                            onClick={() => handleUpgrade(plan.id)}
                                                            aria-label={isUp ? `Assinar o plano ${plan.name}` : `Mudar para o plano ${plan.name}`}
                                                        >
                                                            {isUp ? 'Assinar' : 'Mudar'}
                                                            <span className="plan-table__action-target">
                                                                {isUp ? ` ${plan.name}` : ` para ${plan.name}`}
                                                            </span>
                                                        </button>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </section>

                {/* Sair e excluir */}
                <section className="account-block account-block--exit" aria-labelledby="sair-titulo">
                    <h2 id="sair-titulo" className="account-block__title">Sair ou excluir a conta</h2>

                    <div className="exit-row">
                        <div>
                            <h3>Sair da conta</h3>
                            <p>Você volta para a página inicial e precisa entrar de novo com e-mail e senha.</p>
                        </div>
                        <button className="btn btn-secondary" onClick={logout}>
                            Sair
                        </button>
                    </div>

                    <div className="exit-row exit-row--delete">
                        <div>
                            <h3>Excluir minha conta</h3>
                            <p>
                                Apaga definitivamente sua conta e todos os seus dados e cancela a assinatura, se houver.{' '}
                                <Link to="/exclusao-de-dados" className="danger-link">Saiba o que é excluído</Link>.
                            </p>
                        </div>
                        {!showDeleteForm && (
                            <button className="btn btn-danger-outline" onClick={() => setShowDeleteForm(true)}>
                                Excluir conta
                            </button>
                        )}
                    </div>

                    {showDeleteForm && (
                        <form className="delete-account-form" onSubmit={handleDeleteAccount}>
                            <p className="delete-account-warning">
                                Esta ação é <strong>irreversível</strong>. Para confirmar, informe sua senha e digite <strong>EXCLUIR</strong>.
                            </p>
                            {deleteError && (
                                <div className="alert alert-danger">
                                    <span>⚠️</span> {deleteError}
                                </div>
                            )}
                            <div className="profile-grid">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="delete-password">Senha</label>
                                    <input
                                        id="delete-password"
                                        type="password"
                                        className="form-input"
                                        value={deleteForm.password}
                                        onChange={(e) => setDeleteForm(prev => ({ ...prev, password: e.target.value }))}
                                        autoComplete="current-password"
                                        required
                                        disabled={deleting}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="delete-confirmation">Digite EXCLUIR</label>
                                    <input
                                        id="delete-confirmation"
                                        type="text"
                                        className="form-input"
                                        value={deleteForm.confirmation}
                                        onChange={(e) => setDeleteForm(prev => ({ ...prev, confirmation: e.target.value }))}
                                        placeholder="EXCLUIR"
                                        autoComplete="off"
                                        required
                                        disabled={deleting}
                                    />
                                </div>
                            </div>
                            <div className="delete-account-buttons">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => { setShowDeleteForm(false); setDeleteForm({ password: '', confirmation: '' }); setDeleteError('') }}
                                    disabled={deleting}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-danger" disabled={deleting}>
                                    {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
                                </button>
                            </div>
                        </form>
                    )}
                </section>
            </div>
        </div>
    )
}
