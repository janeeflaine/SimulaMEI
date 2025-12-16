import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import './Account.css'

export default function Account() {
    const { user, logout } = useAuth()
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)

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
        alert('Integração com gateway de pagamento em desenvolvimento!')
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
                </div>
            </div>
        </div>
    )
}
