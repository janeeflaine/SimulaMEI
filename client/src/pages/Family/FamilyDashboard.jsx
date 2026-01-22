import { useState, useEffect } from 'react'
import { useTenant } from '../../context/TenantContext'
import { useAuth } from '../../context/AuthContext'
import './FamilyDashboard.css'

export default function FamilyDashboard() {
    const { user } = useAuth()
    const { tenants, currentTenant, switchTenant } = useTenant() // trigger reload on switch if needed
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newUnitName, setNewUnitName] = useState('')
    const [newUnitDoc, setNewUnitDoc] = useState('')

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/family/consolidated', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setStats(data)
            }
        } catch (error) {
            console.error('Error fetching family stats:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStats()
    }, [])

    const handleCreateUnit = async (e) => {
        e.preventDefault()
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/family/units', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newUnitName, document: newUnitDoc })
            })

            if (res.ok) {
                alert('Nova empresa criada com sucesso!')
                setShowCreateModal(false)
                window.location.reload() // Reload to refresh context
            } else {
                alert('Erro ao criar empresa')
            }
        } catch (error) {
            console.error(error)
        }
    }

    if (loading) return <div className="p-5 text-center">Carregando dados familiares...</div>

    return (
        <div className="container family-dashboard">
            <header className="page-header">
                <div>
                    <h1>Gerenciamento Familiar</h1>
                    <p className="subtitle">Visão consolidada do seu grupo econômico (Cluster)</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                    + Nova MEI/Unidade
                </button>
            </header>

            {stats && (
                <>
                    <div className="stats-grid">
                        <div className="stat-card total-revenue">
                            <h3>Faturamento Global (Cluster)</h3>
                            <div className="value">R$ {parseFloat(stats.totalFamilyRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            <small>Soma de {stats.clusterCount} unidades</small>
                        </div>

                        <div className="stat-card">
                            <h3>Limite Total Combinado</h3>
                            {/* Assuming 81k per unit for now, or sum of unit limits */}
                            <div className="value" style={{ color: '#4f46e5' }}>
                                R$ {(stats.units.reduce((acc, u) => acc + (u.taxLimit || 81000), 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                            <small>Soma dos tetos de faturamento</small>
                        </div>
                    </div>

                    <h2 className="section-title mt-4">Unidades de Negócio</h2>
                    <div className="units-list">
                        {stats.units.map(unit => {
                            const limit = unit.taxLimit || 81000
                            const revenue = parseFloat(unit.currentRevenue || 0)
                            const percentage = (revenue / limit) * 100
                            const isDanger = percentage > 80

                            return (
                                <div key={unit.id} className={`unit-card ${isDanger ? 'danger' : ''}`}>
                                    <div className="unit-header">
                                        <h4>{unit.name}</h4>
                                        <span className="badge">{percentage.toFixed(1)}% do Limite</span>
                                    </div>
                                    <div className="progress-bar-container">
                                        <div
                                            className={`progress-bar ${isDanger ? 'bg-danger' : 'bg-success'}`}
                                            style={{ width: `${Math.min(percentage, 100)}%` }}
                                        ></div>
                                    </div>
                                    <div className="unit-details">
                                        <span>Faturado: R$ {revenue.toLocaleString('pt-BR')}</span>
                                        <span>Limite: R$ {limit.toLocaleString('pt-BR')}</span>
                                    </div>
                                    <div className="mt-3">
                                        {percentage > 100 ? (
                                            <div className="alert alert-danger">⚠️ Limite Excedido!</div>
                                        ) : isDanger ? (
                                            <div className="alert alert-warning">⚠️ Atenção: Próximo ao teto! Considere faturar em outra unidade.</div>
                                        ) : (
                                            <div className="text-success text-sm">✅ Situação Regular</div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Nova Unidade de Negócio</h3>
                        <form onSubmit={handleCreateUnit}>
                            <div className="form-group">
                                <label>Razão Social / Nome</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={newUnitName}
                                    onChange={e => setNewUnitName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>CNPJ / CPF</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={newUnitDoc}
                                    onChange={e => setNewUnitDoc(e.target.value)}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Criar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
