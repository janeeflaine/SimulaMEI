import { useState, useEffect } from 'react'
import './AdminPages.css'

export default function AdminLimits() {
    const [limits, setLimits] = useState({
        annualLimit: 81000,
        warningPercentage: 70,
        dangerPercentage: 90
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchLimits()
    }, [])

    const fetchLimits = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/admin/limits', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            if (data) setLimits(data)
        } catch (error) {
            console.error('Erro ao carregar limites:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setLimits(prev => ({ ...prev, [name]: parseFloat(value) || 0 }))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const token = localStorage.getItem('token')
            await fetch('/api/admin/limits', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(limits)
            })
            alert('Limites atualizados com sucesso!')
        } catch (error) {
            console.error('Erro ao salvar limites:', error)
            alert('Erro ao salvar limites')
        } finally {
            setSaving(false)
        }
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
                <h1>Limites do MEI</h1>
                <p className="text-secondary">Configure o limite de faturamento e alertas</p>
            </div>

            <div className="admin-card">
                <h2>Limite de Faturamento</h2>

                <div className="form-group" style={{ marginBottom: 'var(--spacing-6)' }}>
                    <label className="form-label">Limite Anual de Faturamento (R$)</label>
                    <input
                        type="number"
                        name="annualLimit"
                        value={limits.annualLimit}
                        onChange={handleChange}
                        className="form-input"
                        style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold' }}
                        step="1000"
                        min="0"
                    />
                    <span className="form-hint">
                        Limite atual: {formatCurrency(limits.annualLimit)}
                    </span>
                </div>

                <h2>Configuração de Alertas</h2>
                <p className="text-secondary mb-4">
                    Defina os percentuais para exibição de alertas visuais nas simulações
                </p>

                <div className="form-row">
                    <div className="form-row-label">
                        <span className="badge badge-success">Verde</span>
                        <span style={{ marginLeft: 'var(--spacing-2)' }}>Faturamento saudável</span>
                    </div>
                    <div className="form-row-value">
                        <span>0% até {limits.warningPercentage}%</span>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-row-label">
                        <span className="badge badge-warning">Amarelo</span>
                        <span style={{ marginLeft: 'var(--spacing-2)' }}>Atenção ao limite</span>
                    </div>
                    <div className="form-row-value">
                        <input
                            type="number"
                            name="warningPercentage"
                            value={limits.warningPercentage}
                            onChange={handleChange}
                            className="form-input"
                            style={{ width: '80px' }}
                            min="0"
                            max="100"
                        />
                        <span>% até {limits.dangerPercentage}%</span>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-row-label">
                        <span className="badge badge-danger">Vermelho</span>
                        <span style={{ marginLeft: 'var(--spacing-2)' }}>Limite em risco</span>
                    </div>
                    <div className="form-row-value">
                        <input
                            type="number"
                            name="dangerPercentage"
                            value={limits.dangerPercentage}
                            onChange={handleChange}
                            className="form-input"
                            style={{ width: '80px' }}
                            min="0"
                            max="100"
                        />
                        <span>% ou mais</span>
                    </div>
                </div>

                <div className="modal-actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Salvando...' : '💾 Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    )
}
