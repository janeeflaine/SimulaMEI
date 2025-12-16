import { useState, useEffect } from 'react'
import './AdminPages.css'

export default function AdminRules() {
    const [rules, setRules] = useState({
        inssPercentage: 5,
        icmsValue: 1,
        issValue: 5,
        employeeCost: 1412
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchRules()
    }, [])

    const fetchRules = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/admin/rules', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            if (data) setRules(data)
        } catch (error) {
            console.error('Erro ao carregar regras:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setRules(prev => ({ ...prev, [name]: parseFloat(value) || 0 }))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const token = localStorage.getItem('token')
            await fetch('/api/admin/rules', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(rules)
            })
            alert('Regras atualizadas com sucesso!')
        } catch (error) {
            console.error('Erro ao salvar regras:', error)
            alert('Erro ao salvar regras')
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
                <h1>Regras de Cálculo</h1>
                <p className="text-secondary">Configure os valores usados nas simulações</p>
            </div>

            <div className="alert-banner">
                <span>⚠️</span>
                <span>Alterações afetarão apenas novas simulações. Simulações anteriores mantêm os valores originais.</span>
            </div>

            <div className="admin-card">
                <h2>Valores de Impostos</h2>

                <div className="form-grid">
                    <div className="form-group">
                        <label className="form-label">Percentual INSS (%)</label>
                        <input
                            type="number"
                            name="inssPercentage"
                            value={rules.inssPercentage}
                            onChange={handleChange}
                            className="form-input"
                            step="0.1"
                            min="0"
                        />
                        <span className="form-hint">Atualmente: 5% do salário mínimo</span>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Valor ICMS (R$)</label>
                        <input
                            type="number"
                            name="icmsValue"
                            value={rules.icmsValue}
                            onChange={handleChange}
                            className="form-input"
                            step="0.01"
                            min="0"
                        />
                        <span className="form-hint">Aplicado para Comércio/Indústria</span>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Valor ISS (R$)</label>
                        <input
                            type="number"
                            name="issValue"
                            value={rules.issValue}
                            onChange={handleChange}
                            className="form-input"
                            step="0.01"
                            min="0"
                        />
                        <span className="form-hint">Aplicado para Serviços</span>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Custo Base Funcionário (R$)</label>
                        <input
                            type="number"
                            name="employeeCost"
                            value={rules.employeeCost}
                            onChange={handleChange}
                            className="form-input"
                            step="1"
                            min="0"
                        />
                        <span className="form-hint">Salário mínimo + encargos estimados</span>
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
