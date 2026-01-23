import { useState, useEffect } from 'react'
import { useTenant } from '../../context/TenantContext'
import { useAuth } from '../../context/AuthContext'
import './FamilyDashboard.css'
import { Pencil, Trash2, FileDown, AlertTriangle } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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

    const [editingUnit, setEditingUnit] = useState(null)
    const [deletingUnit, setDeletingUnit] = useState(null)
    const [backupDownloaded, setBackupDownloaded] = useState(false)

    // ... create unit logic ...
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
                body: JSON.stringify({ name: newUnitName, cnpj: newUnitDoc })
            })

            if (res.ok) {
                alert('Nova Unidade de Negócio criada com sucesso!')
                setShowCreateModal(false)
                setNewUnitName('')
                setNewUnitDoc('')
                window.location.reload()
            } else {
                alert('Erro ao criar unidade.')
            }
        } catch (error) {
            console.error(error)
            alert('Erro de conexão.')
        }
    }
    const handleUpdateUnit = async (e) => {
        e.preventDefault()
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/family/units/${editingUnit.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newUnitName, cnpj: newUnitDoc })
            })

            if (res.ok) {
                alert('Empresa atualizada!')
                setEditingUnit(null)
                window.location.reload()
            }
        } catch (error) {
            console.error(error)
        }
    }

    const generateBackupPDF = async (unitId, unitName) => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/family/units/${unitId}/backup`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()

            const doc = new jsPDF()
            doc.setFontSize(18)
            doc.text(`Backup de Dados: ${unitName}`, 14, 20)
            doc.setFontSize(10)
            doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 28)

            // Transactions Table
            if (data.transactions?.length > 0) {
                doc.text('Transações', 14, 40)
                autoTable(doc, {
                    startY: 45,
                    head: [['Data', 'Tipo', 'Categoria', 'Valor', 'Status']],
                    body: data.transactions.map(t => [
                        new Date(t.date).toLocaleDateString(),
                        t.type,
                        t.categoryId, // Ideal would be to map to name, keeping simple for backup
                        `R$ ${t.amount}`,
                        t.status
                    ])
                })
            }

            // Bills Table
            if (data.bills?.length > 0) {
                const finalY = doc.lastAutoTable.finalY || 45
                doc.text('Contas a Pagar', 14, finalY + 15)
                autoTable(doc, {
                    startY: finalY + 20,
                    head: [['Vencimento', 'Descrição', 'Valor', 'Status']],
                    body: data.bills.map(b => [
                        new Date(b.dueDate).toLocaleDateString(),
                        b.description,
                        `R$ ${b.amount}`,
                        b.status
                    ])
                })
            }

            doc.save(`backup-${unitName.replace(/\s+/g, '_')}.pdf`)
            setBackupDownloaded(true)
        } catch (err) {
            console.error(err)
            alert('Erro ao gerar backup.')
        }
    }

    const handleDeleteUnit = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/family/units/${deletingUnit.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (res.ok) {
                alert('Unidade excluída com sucesso.')
                setDeletingUnit(null)
                window.location.reload()
            } else {
                const err = await res.json()
                alert(`Erro: ${err.message}`)
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
                                    <div className="mt-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div className="status-indicator">
                                            {percentage > 100 ? (
                                                <span className="text-danger">⚠️ Limite Excedido!</span>
                                            ) : isDanger ? (
                                                <span className="text-warning">⚠️ Atenção: Próximo ao teto!</span>
                                            ) : (
                                                <span className="text-success">✅ Situação Regular</span>
                                            )}
                                        </div>
                                        <div className="unit-actions">
                                            <button
                                                className="btn-icon"
                                                title="Editar"
                                                onClick={() => {
                                                    setEditingUnit(unit)
                                                    setNewUnitName(unit.name)
                                                    setNewUnitDoc(unit.cnpj || '')
                                                }}
                                            >
                                                <Pencil size={18} color="#64748b" />
                                            </button>
                                            {!unit.isPrimary && (
                                                <button
                                                    className="btn-icon"
                                                    title="Excluir"
                                                    onClick={() => {
                                                        setDeletingUnit(unit)
                                                        setBackupDownloaded(false)
                                                    }}
                                                >
                                                    <Trash2 size={18} color="#ef4444" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            {/* CREATE / EDIT MODAL */}
            {(showCreateModal || editingUnit) && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>{editingUnit ? 'Editar Unidade' : 'Nova Unidade de Negócio'}</h3>
                        <form onSubmit={editingUnit ? handleUpdateUnit : handleCreateUnit}>
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
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowCreateModal(false); setEditingUnit(null); }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">{editingUnit ? 'Salvar' : 'Criar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE WARNING MODAL */}
            {deletingUnit && (
                <div className="modal-overlay">
                    <div className="modal-content warning-modal">
                        <div className="modal-header-danger">
                            <AlertTriangle size={32} color="#ef4444" />
                            <h3>Zona de Perigo</h3>
                        </div>
                        <p>Você está prestes a excluir <strong>{deletingUnit.name}</strong>.</p>
                        <ul className="warning-list">
                            <li>Isso apagará <strong>todas</strong> as transações financeiras.</li>
                            <li>Isso apagará <strong>todas</strong> as contas a pagar.</li>
                            <li>Esta ação é <strong>irreversível</strong>.</li>
                        </ul>

                        <div className="backup-section">
                            <p className="text-sm text-slate-600 mb-2">Recomendação: Baixe o backup antes de continuar.</p>
                            <button
                                onClick={() => generateBackupPDF(deletingUnit.id, deletingUnit.name)}
                                className={`btn ${backupDownloaded ? 'btn-success-outline' : 'btn-outline'} w-full flex items-center justify-center gap-2`}
                            >
                                <FileDown size={18} />
                                {backupDownloaded ? 'Backup Baixado' : 'Baixar Backup em PDF'}
                            </button>
                        </div>

                        <div className="modal-actions vertical">
                            <button
                                className="btn btn-danger w-full"
                                onClick={handleDeleteUnit}
                                disabled={!backupDownloaded}
                                title={!backupDownloaded ? "Baixe o backup primeiro" : ""}
                            >
                                Excluir Permanentemente
                            </button>
                            <button className="btn btn-secondary w-full" onClick={() => setDeletingUnit(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
