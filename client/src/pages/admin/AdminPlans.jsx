import { useState, useEffect } from 'react'
import './AdminPages.css'

// Lista mestra de funcionalidades — adicione aqui sempre que surgir uma nova feature
const ALL_FEATURES = [
    { key: 'comparativo',    name: 'Comparativo MEI x ME',          group: 'Padrão Grátis' },
    { key: 'alertas',        name: 'Alertas de Limite',              group: 'Padrão Grátis' },
    { key: 'categorias',     name: 'Categorias Personalizadas',      group: 'Padrão Grátis' },
    { key: 'cartoes',        name: 'Cartões (Cadastro Manual)',      group: 'Padrão Grátis' },
    { key: 'historico',      name: 'Histórico de Simulações',        group: 'Prata' },
    { key: 'pdf',            name: 'Exportar PDF',                   group: 'Prata' },
    { key: 'contas_pagar',   name: 'Contas a Pagar (Boletos)',        group: 'Prata' },
    { key: 'transferencias', name: 'Transferências entre Carteiras', group: 'Prata' },
    { key: 'multi_carteiras',name: 'Multi-Carteiras',                group: 'Prata' },
    { key: 'upload_faturas', name: 'Leitura de Faturas com IA',     group: 'Prata' },
]

export default function AdminPlans() {
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const [editingPlan, setEditingPlan] = useState(null)
    const [newPlan, setNewPlan] = useState({
        name: '',
        price: 0,
        features: {},
        isActive: true
    })

    useEffect(() => {
        fetchPlans()
    }, [])

    const fetchPlans = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/admin/plans', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setPlans(data)
        } catch (error) {
            console.error('Erro ao carregar planos:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSavePlan = async (plan) => {
        try {
            const token = localStorage.getItem('token')
            const method = plan.id ? 'PUT' : 'POST'
            const url = plan.id ? `/api/admin/plans/${plan.id}` : '/api/admin/plans'

            await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(plan)
            })

            fetchPlans()
            setEditingPlan(null)
            setNewPlan({ name: '', price: 0, features: {}, isActive: true })
        } catch (error) {
            console.error('Erro ao salvar plano:', error)
            alert('Erro ao salvar plano')
        }
    }

    const togglePlanActive = async (plan) => {
        await handleSavePlan({ ...plan, isActive: !plan.isActive })
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
                <div className="loader"></div>
            </div>
        )
    }

    return (
        <div className="admin-page">
            <div className="page-header">
                <h1>Gestão de Planos</h1>
                <p className="text-secondary">Crie e gerencie os planos de assinatura</p>
            </div>

            <div className="plans-admin-grid">
                {plans.map((plan) => (
                    <div key={plan.id} className={`plan-admin-card ${!plan.isActive ? 'inactive' : ''}`}>
                        <div className="plan-admin-header">
                            <div>
                                <h3 className="plan-admin-title">{plan.name}</h3>
                                <span className={`badge ${plan.isActive ? 'badge-success' : 'badge-danger'}`}>
                                    {plan.isActive ? 'Ativo' : 'Inativo'}
                                </span>
                            </div>
                        </div>

                        <div className="plan-admin-price">
                            {plan.price === 0 ? 'Grátis' : `${formatCurrency(plan.price)}/mês`}
                        </div>

                        <ul className="plan-features" style={{ marginBottom: 'var(--spacing-4)' }}>
                            {plan.features && Object.entries(plan.features).map(([key, value]) => (
                                <li key={key} className={value ? 'included' : 'excluded'}>
                                    {value ? '✅' : '❌'} {key}
                                </li>
                            ))}
                        </ul>

                        <div className="action-buttons">
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setEditingPlan(plan)}
                            >
                                ✏️ Editar
                            </button>
                            <button
                                className={`btn btn-sm ${plan.isActive ? 'btn-secondary' : 'btn-primary'}`}
                                onClick={() => togglePlanActive(plan)}
                            >
                                {plan.isActive ? '🔒 Desativar' : '✅ Ativar'}
                            </button>
                        </div>
                    </div>
                ))}

                {/* Add New Plan Card */}
                <div className="plan-admin-card" style={{ border: '2px dashed rgba(255,255,255,0.12)', background: 'transparent' }}>
                    <div className="text-center" style={{ padding: 'var(--spacing-4)' }}>
                        <span style={{ fontSize: '2rem' }}>➕</span>
                        <h3 style={{ marginTop: 'var(--spacing-2)' }}>Novo Plano</h3>
                        <button
                            className="btn btn-primary btn-sm"
                            style={{ marginTop: 'var(--spacing-4)' }}
                            onClick={() => setEditingPlan(newPlan)}
                        >
                            Criar Plano
                        </button>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {editingPlan && (
                <div className="modal-overlay" onClick={() => setEditingPlan(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{editingPlan.id ? 'Editar Plano' : 'Novo Plano'}</h2>

                        <div className="form-group">
                            <label className="form-label">Nome do Plano</label>
                            <input
                                type="text"
                                value={editingPlan.name}
                                onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                                className="form-input"
                                placeholder="Ex: Premium"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Preço Mensal (R$)</label>
                            <input
                                type="number"
                                value={editingPlan.price}
                                onChange={(e) => setEditingPlan({ ...editingPlan, price: parseFloat(e.target.value) || 0 })}
                                className="form-input"
                                step="0.01"
                                min="0"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Funcionalidades</label>
                            {['Padrão Grátis', 'Prata', 'Ouro'].map(group => (
                                <div key={group}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#93c5fd', padding: '10px 0 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '8px' }}>
                                        {group === 'Padrão Grátis' ? '🆓 Padrão Grátis' : group === 'Prata' ? '🥈 Prata' : '🥇 Ouro'}
                                    </div>
                                    {ALL_FEATURES.filter(f => f.group === group).map((feature) => (
                                        <div key={feature.key} className="feature-row" style={{ padding: '8px 0' }}>
                                            <span>{feature.name}</span>
                                            <div
                                                className={`admin-toggle ${editingPlan.features?.[feature.key] ? 'active' : ''}`}
                                                onClick={() => setEditingPlan({
                                                    ...editingPlan,
                                                    features: { ...editingPlan.features, [feature.key]: !editingPlan.features?.[feature.key] }
                                                })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setEditingPlan(null)}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={() => handleSavePlan(editingPlan)}>
                                💾 Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
