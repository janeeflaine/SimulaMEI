import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import WhatsAppSection from '../components/WhatsAppSection'
import './Account.css'

export default function Account() {
    const { user, logout } = useAuth()
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()
    const [showDeleteForm, setShowDeleteForm] = useState(false)
    const [deleteForm, setDeleteForm] = useState({ password: '', confirmation: '' })
    const [deleteError, setDeleteError] = useState('')
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        fetchPlans()
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

    return (
        <div className="account-page">
            <div className="container">
                <h1 className="page-title">Minha Conta</h1>

                {/* Profile Section */}
                <div className="section">
                    <h2>Dados Pessoais</h2>
                    <div className="profile-grid">
                        <div className="form-group">
                            <label className="form-label">Nome</label>
                            <input
                                type="text"
                                className="form-input"
                                value={user?.name || ''}
                                disabled
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">E-mail</label>
                            <input
                                type="email"
                                className="form-input"
                                value={user?.email || ''}
                                disabled
                            />
                        </div>
                    </div>
                </div>

                {/* Current Plan */}
                <div className="section">
                    <h2>Plano Atual</h2>
                    <div className="current-plan-card">
                        <div className="plan-info">
                            <span className="plan-name">{user?.plan || 'Gratuito'}</span>
                            <span className="plan-status badge badge-success">Ativo</span>
                        </div>
                        <p className="plan-description">
                            {user?.plan === 'FREE'
                                ? 'Você está no plano gratuito. Faça upgrade para acessar mais recursos.'
                                : 'Você tem acesso a todos os recursos do seu plano.'}
                        </p>
                    </div>
                </div>

                {/* WhatsApp */}
                <WhatsAppSection />

                {/* Available Plans */}
                <div className="section">
                    <h2>Planos Disponíveis</h2>

                    {loading ? (
                        <div className="flex items-center justify-center" style={{ padding: 'var(--spacing-8)' }}>
                            <div className="loader"></div>
                        </div>
                    ) : (
                        <div className="plans-grid">
                            {plans.map((plan) => (
                                <div
                                    key={plan.id}
                                    className={`plan-card ${user?.planId === plan.id ? 'current' : ''}`}
                                >
                                    <h3 className="plan-title">{plan.name}</h3>
                                    <div className="plan-price">
                                        {plan.price === 0 ? (
                                            <span>Grátis</span>
                                        ) : (
                                            <>
                                                <span className="price-value">{formatCurrency(plan.price)}</span>
                                                <span className="price-period">/mês</span>
                                            </>
                                        )}
                                    </div>
                                    <ul className="plan-features">
                                        {plan.features && Object.entries(plan.features).map(([key, value]) => (
                                            <li key={key} className={value ? 'included' : 'excluded'}>
                                                {value ? '✅' : '❌'} {key}
                                            </li>
                                        ))}
                                    </ul>
                                    {user?.planId === plan.id ? (
                                        <button className="btn btn-secondary" disabled>
                                            Plano Atual
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleUpgrade(plan.id)}
                                        >
                                            {plan.price === 0 ? 'Fazer Downgrade' : 'Fazer Upgrade'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Danger Zone */}
                <div className="section danger-zone">
                    <h2>Zona de Perigo</h2>
                    <div className="danger-actions">
                        <div>
                            <h4>Sair da conta</h4>
                            <p>Você será desconectado do sistema.</p>
                        </div>
                        <button className="btn btn-secondary" onClick={logout}>
                            Sair
                        </button>
                    </div>

                    <div className="danger-actions danger-actions-divider">
                        <div>
                            <h4>Excluir minha conta</h4>
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
                                    <label className="form-label">Senha</label>
                                    <input
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
                                    <label className="form-label">Digite EXCLUIR</label>
                                    <input
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
                </div>
            </div>
        </div>
    )
}
