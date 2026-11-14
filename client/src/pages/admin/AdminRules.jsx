import { useState, useEffect } from 'react'
import { useConfirmDialog } from '../../components/ui/ConfirmDialog'
import './AdminPages.css'

export default function AdminRules() {
    const [rules, setRules] = useState({
        inssPercentage: 5,
        icmsValue: 1,
        issValue: 5,
        minimumWage: null
    })
    const [effective, setEffective] = useState(null)
    const { notify, dialog } = useConfirmDialog()
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
            if (res.ok && data) {
                const { effective: eff, ...saved } = data
                setRules(saved)
                setEffective(eff || null)
            }
        } catch (error) {
            console.error('Erro ao carregar regras:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        // Salário mínimo vazio = usar o da lei
        if (name === 'minimumWage' && value === '') return setRules(prev => ({ ...prev, minimumWage: null }))
        setRules(prev => ({ ...prev, [name]: parseFloat(value) || 0 }))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/admin/rules', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    inssPercentage: rules.inssPercentage,
                    icmsValue: rules.icmsValue,
                    issValue: rules.issValue,
                    minimumWage: rules.minimumWage
                })
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                notify({ title: 'Não foi salvo', message: body.message || 'Erro ao salvar regras', tone: 'error' })
                return
            }
            notify({ title: 'Regras salvas', message: 'As próximas simulações já usam os valores novos.', tone: 'success' })
            fetchRules()
        } catch (error) {
            console.error('Erro ao salvar regras:', error)
            notify({ title: 'Não foi salvo', message: 'Erro ao salvar regras. Confira a conexão.', tone: 'error' })
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
            {dialog}
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
                        <label className="form-label" htmlFor="rules-min-wage">Salário mínimo (R$)</label>
                        <input
                            id="rules-min-wage"
                            type="number"
                            name="minimumWage"
                            value={rules.minimumWage ?? ''}
                            placeholder={effective ? String(effective.lawMinimumWage) : ''}
                            onChange={handleChange}
                            className="form-input"
                            step="0.01"
                            min="0"
                        />
                        <span className="form-hint">
                            {effective
                                ? `Em ${effective.year} o site usa R$ ${effective.minimumWage.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Vazio: vale o da lei. Funcionário (salário + 8% FGTS + 3% INSS): R$ ${effective.employeeCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
                                : 'Base do INSS do DAS e do custo do funcionário. Vazio: vale o da lei.'}
                        </span>
                    </div>
                </div>

                <div className="modal-actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Salvando...' : 'Salvar alterações'}
                    </button>
                </div>
            </div>
        </div>
    )
}
