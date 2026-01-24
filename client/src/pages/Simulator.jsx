import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Simulator.css'

export default function Simulator() {
    const navigate = useNavigate()
    const [formData, setFormData] = useState({
        activityType: 'comercio',
        revenueType: 'mensal',
        revenue: '',
        hasEmployee: false
    })
    const [loading, setLoading] = useState(false)

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)

        try {
            const token = localStorage.getItem('token')
            const headers = { 'Content-Type': 'application/json' }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const res = await fetch('/api/simulate', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    activityType: formData.activityType,
                    revenue: parseFloat(formData.revenue.replace(/\D/g, '')) / 100,
                    revenueType: formData.revenueType,
                    hasEmployee: formData.hasEmployee
                })
            })

            const result = await res.json()

            // Store result in sessionStorage for the results page
            sessionStorage.setItem('simulationResult', JSON.stringify(result))
            navigate('/resultado')
        } catch (error) {
            console.error('Erro na simulação:', error)
            alert('Erro ao realizar simulação. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (value) => {
        const numbers = value.replace(/\D/g, '')
        const amount = (parseInt(numbers) / 100).toFixed(2)
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(amount)
    }

    const handleRevenueChange = (e) => {
        const formatted = formatCurrency(e.target.value)
        setFormData(prev => ({ ...prev, revenue: formatted }))
    }

    return (
        <div className="simulator-page">
            <div className="container">
                <div className="simulator-container">
                    <div className="simulator-header">
                        <h1 className="simulator-title">Simulador de Impostos MEI</h1>
                        <p className="simulator-subtitle">
                            Preencha os dados abaixo para calcular seus impostos
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="simulator-form">
                        {/* Activity Type */}
                        <div className="form-group">
                            <label className="form-label">Tipo de Atividade</label>
                            <div className="activity-options">
                                <label className={`activity-option ${formData.activityType === 'comercio' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="activityType"
                                        value="comercio"
                                        checked={formData.activityType === 'comercio'}
                                        onChange={handleChange}
                                    />
                                    <span className="activity-icon">🛒</span>
                                    <span className="activity-name">Comércio</span>
                                    <span className="activity-desc">Venda de produtos</span>
                                </label>

                                <label className={`activity-option ${formData.activityType === 'servico' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="activityType"
                                        value="servico"
                                        checked={formData.activityType === 'servico'}
                                        onChange={handleChange}
                                    />
                                    <span className="activity-icon">💼</span>
                                    <span className="activity-name">Serviço</span>
                                    <span className="activity-desc">Prestação de serviços</span>
                                </label>

                                <label className={`activity-option ${formData.activityType === 'ambos' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="activityType"
                                        value="ambos"
                                        checked={formData.activityType === 'ambos'}
                                        onChange={handleChange}
                                    />
                                    <span className="activity-icon">🏪</span>
                                    <span className="activity-name">Ambos</span>
                                    <span className="activity-desc">Comércio e serviço</span>
                                </label>
                            </div>
                        </div>

                        {/* Revenue */}
                        <div className="form-group">
                            <label className="form-label">Faturamento</label>
                            <div className="revenue-group">
                                <div className="revenue-type-toggle">
                                    <button
                                        type="button"
                                        className={`toggle-btn ${formData.revenueType === 'mensal' ? 'active' : ''}`}
                                        onClick={() => setFormData(prev => ({ ...prev, revenueType: 'mensal' }))}
                                    >
                                        Mensal
                                    </button>
                                    <button
                                        type="button"
                                        className={`toggle-btn ${formData.revenueType === 'anual' ? 'active' : ''}`}
                                        onClick={() => setFormData(prev => ({ ...prev, revenueType: 'anual' }))}
                                    >
                                        Anual
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    name="revenue"
                                    value={formData.revenue}
                                    onChange={handleRevenueChange}
                                    placeholder="R$ 0,00"
                                    className="form-input revenue-input"
                                    required
                                />
                            </div>
                            <span className="form-hint">
                                {formData.revenueType === 'mensal'
                                    ? 'Informe seu faturamento médio mensal'
                                    : 'Informe seu faturamento anual total'}
                            </span>
                        </div>

                        {/* Employee */}
                        <div className="form-group">
                            <label className="form-label">Possui funcionário?</label>
                            <label className="checkbox-option">
                                <input
                                    type="checkbox"
                                    name="hasEmployee"
                                    checked={formData.hasEmployee}
                                    onChange={handleChange}
                                />
                                <span className="checkbox-custom"></span>
                                <span className="checkbox-text">
                                    Sim, possuo 1 funcionário registrado
                                </span>
                            </label>
                            <span className="form-hint">
                                O MEI pode contratar até 1 funcionário que receba o salário mínimo ou piso da categoria.
                            </span>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg submit-btn"
                            disabled={loading || !formData.revenue}
                        >
                            {loading ? (
                                <>
                                    <span className="loader" style={{ width: 20, height: 20, borderWidth: 2 }}></span>
                                    Calculando...
                                </>
                            ) : (
                                <>
                                    📊 Calcular Impostos
                                </>
                            )}
                        </button>
                    </form>

                    <div className="disclaimer">
                        ⚠️ <strong>Atenção:</strong> Esta é uma simulação estimativa baseada nas regras atuais.
                        Os valores apresentados não substituem a orientação de um contador profissional.
                    </div>
                </div>
            </div>
        </div>
    )
}
