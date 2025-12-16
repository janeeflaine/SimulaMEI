import { useState, useEffect } from 'react'
import './AdminPages.css'

export default function AdminFeatures() {
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const featuresList = [
        { key: 'historico', name: 'Histórico de Simulações', description: 'Salvar e visualizar simulações anteriores' },
        { key: 'pdf', name: 'Exportar PDF', description: 'Baixar relatórios em PDF' },
        { key: 'comparativo', name: 'Comparativo MEI x ME', description: 'Comparar custos entre MEI e Microempresa' },
        { key: 'alertas', name: 'Alertas Personalizados', description: 'Receber alertas sobre limite de faturamento' }
    ]

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
            setPlans(data.filter(p => p.isActive))
        } catch (error) {
            console.error('Erro ao carregar planos:', error)
        } finally {
            setLoading(false)
        }
    }

    const toggleFeature = async (planId, featureKey, currentValue) => {
        setSaving(true)
        try {
            const token = localStorage.getItem('token')
            const plan = plans.find(p => p.id === planId)
            const updatedFeatures = { ...plan.features, [featureKey]: !currentValue }

            await fetch(`/api/admin/plans/${planId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ...plan, features: updatedFeatures })
            })

            fetchPlans()
        } catch (error) {
            console.error('Erro ao atualizar funcionalidade:', error)
        } finally {
            setSaving(false)
        }
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
                <h1>Controle de Funcionalidades</h1>
                <p className="text-secondary">Defina quais recursos estão disponíveis em cada plano</p>
            </div>

            <div className="admin-card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Funcionalidade</th>
                                {plans.map(plan => (
                                    <th key={plan.id} style={{ textAlign: 'center' }}>{plan.name}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {featuresList.map((feature) => (
                                <tr key={feature.key}>
                                    <td>
                                        <div className="feature-info">
                                            <h4>{feature.name}</h4>
                                            <p>{feature.description}</p>
                                        </div>
                                    </td>
                                    {plans.map(plan => (
                                        <td key={plan.id} style={{ textAlign: 'center' }}>
                                            <div
                                                className={`admin-toggle ${plan.features?.[feature.key] ? 'active' : ''}`}
                                                onClick={() => toggleFeature(plan.id, feature.key, plan.features?.[feature.key])}
                                                style={{ margin: '0 auto', opacity: saving ? 0.5 : 1 }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="alert-banner" style={{ marginTop: 'var(--spacing-6)', marginBottom: 0 }}>
                    <span>💡</span>
                    <span>As alterações são aplicadas imediatamente para todos os usuários do plano.</span>
                </div>
            </div>
        </div>
    )
}
