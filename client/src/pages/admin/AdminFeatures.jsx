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

                <AdminTrialSettings />

                <div className="alert-banner" style={{ marginTop: 'var(--spacing-6)', marginBottom: 0 }}>
                    <span>💡</span>
                    <span>As alterações são aplicadas imediatamente para todos os usuários do plano.</span>
                </div>
            </div>
        </div>
    )
}

function AdminTrialSettings() {
    const [trialEnabled, setTrialEnabled] = useState(false)
    const [trialDays, setTrialDays] = useState(7)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchTrialSettings()
    }, [])

    const fetchTrialSettings = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            const enabled = data.find(s => s.key === 'trial_enabled')?.value === 'true'
            const days = data.find(s => s.key === 'trial_days')?.value || 7
            setTrialEnabled(enabled)
            setTrialDays(parseInt(days))
        } catch (error) {
            console.error('Erro ao buscar trial:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSaveTrial = async (newEnabled, newDays) => {
        setSaving(true)
        try {
            const token = localStorage.getItem('token')

            // Save enabled status
            await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ key: 'trial_enabled', value: newEnabled.toString() })
            })

            // Save days
            await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ key: 'trial_days', value: newDays.toString() })
            })

            alert('Configurações de Trial salvas!')
        } catch (error) {
            console.error('Erro ao salvar trial:', error)
            alert('Erro ao salvar configurações')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return null

    return (
        <div className="admin-card" style={{ marginTop: '2rem' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--color-slate-200)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    ⭐ Acesso para Novos Usuários (Trial)
                </h2>
                <p className="text-secondary">Disponibiliza todas as funções premium automaticamente para novos cadastros.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h4 style={{ margin: 0 }}>Ativar Período de Avaliação</h4>
                        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>Novos usuários receberão o plano Ouro temporariamente.</p>
                    </div>
                    <div
                        className={`admin-toggle ${trialEnabled ? 'active' : ''}`}
                        onClick={() => {
                            const next = !trialEnabled
                            setTrialEnabled(next)
                            handleSaveTrial(next, trialDays)
                        }}
                        style={{ opacity: saving ? 0.5 : 1 }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h4 style={{ margin: 0 }}>Duração do Acesso (Dias)</h4>
                        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>Quantidade de dias que o usuário terá acesso total.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="number"
                            value={trialDays}
                            onChange={(e) => setTrialDays(e.target.value)}
                            style={{ width: '80px', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-slate-200)' }}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleSaveTrial(trialEnabled, trialDays)}
                            disabled={saving}
                        >
                            {saving ? '...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
