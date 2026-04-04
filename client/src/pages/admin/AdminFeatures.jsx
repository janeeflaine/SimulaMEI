import { useState, useEffect } from 'react'
import './AdminPages.css'

export default function AdminFeatures() {
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const featuresList = [
        // ── Grátis ──────────────────────────────────────────────────────────
        { key: 'comparativo',    name: 'Comparativo MEI x ME',          description: 'Comparar custos entre MEI e Microempresa',              group: 'Grátis' },
        { key: 'alertas',        name: 'Alertas de Limite',              description: 'Alertas sobre limite anual de faturamento',             group: 'Grátis' },
        { key: 'categorias',     name: 'Categorias Personalizadas',      description: 'Criar e gerenciar categorias de receitas e despesas',   group: 'Grátis' },
        { key: 'cartoes',        name: 'Cartões (Cadastro Manual)',      description: 'Cadastrar cartões e lançar despesas manualmente',       group: 'Grátis' },
        // ── Prata ────────────────────────────────────────────────────────────
        { key: 'historico',      name: 'Histórico de Simulações',        description: 'Salvar e visualizar simulações anteriores',             group: 'Prata'  },
        { key: 'pdf',            name: 'Exportar PDF',                   description: 'Baixar relatórios em PDF',                             group: 'Prata'  },
        { key: 'contas_pagar',   name: 'Contas a Pagar (Boletos)',        description: 'Gerenciar boletos e contas futuras',                   group: 'Prata'  },
        { key: 'transferencias', name: 'Transferências entre Carteiras', description: 'Mover saldo entre carteiras PF e PJ',                  group: 'Prata'  },
        { key: 'multi_carteiras',name: 'Multi-Carteiras',                description: 'Criar e gerenciar múltiplas carteiras',                group: 'Prata'  },
        { key: 'upload_faturas', name: 'Leitura de Faturas com IA',     description: 'Upload de PDF/foto e extração inteligente via Gemini',  group: 'Prata'  },
        // ── Ouro ─────────────────────────────────────────────────────────────
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
                            {['Grátis', 'Prata', 'Ouro'].map(group => {
                                const groupFeatures = featuresList.filter(f => f.group === group)
                                return (
                                    <>
                                        <tr key={`group-${group}`}>
                                            <td colSpan={plans.length + 1} style={{ background: 'rgba(37,99,235,0.07)', padding: '6px 16px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: '#93c5fd', textTransform: 'uppercase', borderTop: '1px solid rgba(37,99,235,0.15)', borderBottom: '1px solid rgba(37,99,235,0.15)' }}>
                                                {group === 'Grátis' ? '🆓 Padrão Grátis' : group === 'Prata' ? '🥈 Prata' : '🥇 Ouro'}
                                            </td>
                                        </tr>
                                        {groupFeatures.map((feature) => (
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
                                    </>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                <AdminTransactionLimits plans={plans} />

                <AdminWalletLimits plans={plans} />

                <AdminTrialSettings />

                <div className="alert-banner" style={{ marginTop: 'var(--spacing-6)', marginBottom: 0 }}>
                    <span>💡</span>
                    <span>As alterações são aplicadas imediatamente para todos os usuários do plano.</span>
                </div>
            </div>
        </div>
    )
}

function AdminTransactionLimits({ plans }) {
    const [limits, setLimits] = useState({})
    const [saving, setSaving] = useState(false)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => { fetchLimits() }, [])

    const fetchLimits = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
            const data = await res.json()
            const parsed = {}
            plans.forEach(p => {
                const setting = data.find(s => s.key === `transaction_limit_${p.id}`)
                parsed[p.id] = setting ? setting.value : '0'
            })
            setLimits(parsed)
        } catch (err) {
            console.error('Erro ao buscar limites de transações:', err)
        } finally {
            setLoaded(true)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const token = localStorage.getItem('token')
            await Promise.all(
                plans.map(p =>
                    fetch('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ key: `transaction_limit_${p.id}`, value: String(limits[p.id] ?? '0') })
                    })
                )
            )
            alert('Limites de lançamentos salvos!')
        } catch (err) {
            console.error(err)
            alert('Erro ao salvar limites')
        } finally {
            setSaving(false)
        }
    }

    if (!loaded) return null

    return (
        <div className="admin-card" style={{ marginTop: '2rem' }}>
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                    📝 Limite de Lançamentos por Plano (mensal)
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: 0 }}>
                    Quantidade máxima de lançamentos financeiros por mês. Use <strong style={{ color: '#93c5fd' }}>0</strong> para ilimitado.
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {plans.map(plan => (
                    <div key={plan.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                            <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}>{plan.name}</h4>
                            <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.8rem', margin: '3px 0 0' }}>
                                {limits[plan.id] === '0' || !limits[plan.id] ? 'Ilimitado' : `Máximo de ${limits[plan.id]} lançamentos/mês`}
                            </p>
                        </div>
                        <input
                            type="number"
                            min="0"
                            value={limits[plan.id] ?? '0'}
                            onChange={e => setLimits(prev => ({ ...prev, [plan.id]: e.target.value }))}
                            style={{ width: '76px', padding: '9px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#111827', color: '#f1f5f9', textAlign: 'center', fontSize: '0.9rem', fontFamily: 'inherit' }}
                        />
                    </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar Limites'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function AdminWalletLimits({ plans }) {
    const [limits, setLimits] = useState({})   // { [planId]: { total, pf, pj } }
    const [saving, setSaving] = useState(false)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => { fetchLimits() }, [])

    const fetchLimits = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
            const data = await res.json()
            const parsed = {}
            plans.forEach(p => {
                parsed[p.id] = {
                    total: data.find(s => s.key === `wallet_limit_${p.id}`)?.value    ?? '0',
                    pf:    data.find(s => s.key === `wallet_pf_limit_${p.id}`)?.value ?? '0',
                    pj:    data.find(s => s.key === `wallet_pj_limit_${p.id}`)?.value ?? '0',
                }
            })
            setLimits(parsed)
        } catch (err) {
            console.error('Erro ao buscar limites de carteiras:', err)
        } finally {
            setLoaded(true)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const token = localStorage.getItem('token')
            const saves = plans.flatMap(p => [
                fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ key: `wallet_limit_${p.id}`,    value: String(limits[p.id]?.total ?? '0') }) }),
                fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ key: `wallet_pf_limit_${p.id}`, value: String(limits[p.id]?.pf    ?? '0') }) }),
                fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ key: `wallet_pj_limit_${p.id}`, value: String(limits[p.id]?.pj    ?? '0') }) }),
            ])
            await Promise.all(saves)
            alert('Limites de carteiras salvos!')
        } catch (err) {
            console.error(err)
            alert('Erro ao salvar limites')
        } finally {
            setSaving(false)
        }
    }

    const update = (planId, field, value) =>
        setLimits(prev => ({ ...prev, [planId]: { ...prev[planId], [field]: value } }))

    const describeLimit = (v) => v === '0' ? 'Ilimitado' : v

    if (!loaded) return null

    const inputStyle = { width: '68px', padding: '8px 6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#111827', color: '#f1f5f9', textAlign: 'center', fontSize: '0.875rem', fontFamily: 'inherit' }
    const colLabel = { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginBottom: '6px' }

    return (
        <div className="admin-card" style={{ marginTop: '2rem' }}>
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                    👛 Limite de Carteiras por Plano
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '6px', marginBottom: 0 }}>
                    Defina o total de carteiras e os limites por tipo PF/PJ por plano. Use <strong style={{ color: '#93c5fd' }}>0</strong> para ilimitado.
                </p>
            </div>

            {/* Header das colunas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px 72px', gap: '10px', alignItems: 'center', padding: '0 16px 8px' }}>
                <div />
                <div style={colLabel}>Total</div>
                <div style={colLabel}>👤 PF</div>
                <div style={colLabel}>🏢 PJ</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {plans.map(plan => {
                    const l = limits[plan.id] || { total: '0', pf: '0', pj: '0' }
                    return (
                        <div key={plan.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px 72px', gap: '10px', alignItems: 'center', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div>
                                <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}>{plan.name}</h4>
                                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.775rem', margin: '3px 0 0' }}>
                                    Total: {describeLimit(l.total)} &nbsp;·&nbsp; PF: {describeLimit(l.pf)} &nbsp;·&nbsp; PJ: {describeLimit(l.pj)}
                                </p>
                            </div>
                            <input type="number" min="0" value={l.total} onChange={e => update(plan.id, 'total', e.target.value)} style={inputStyle} />
                            <input type="number" min="0" value={l.pf}    onChange={e => update(plan.id, 'pf',    e.target.value)} style={inputStyle} />
                            <input type="number" min="0" value={l.pj}    onChange={e => update(plan.id, 'pj',    e.target.value)} style={inputStyle} />
                        </div>
                    )
                })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar Limites'}
                </button>
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
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                    ⭐ Acesso para Novos Usuários (Trial)
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '6px', marginBottom: 0 }}>Disponibiliza todas as funções premium automaticamente para novos cadastros.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                        <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}>Ativar Período de Avaliação</h4>
                        <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.8rem', margin: '3px 0 0' }}>Novos usuários receberão o plano Ouro temporariamente.</p>
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

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                        <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}>Duração do Acesso (Dias)</h4>
                        <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.8rem', margin: '3px 0 0' }}>Quantidade de dias que o usuário terá acesso total.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="number"
                            value={trialDays}
                            onChange={(e) => setTrialDays(e.target.value)}
                            style={{ width: '76px', padding: '9px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#111827', color: '#f1f5f9', textAlign: 'center', fontSize: '0.9rem', fontFamily: 'inherit' }}
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
