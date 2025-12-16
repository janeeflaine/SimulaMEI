import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Results.css'

export default function Results() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [result, setResult] = useState(null)

    useEffect(() => {
        const stored = sessionStorage.getItem('simulationResult')
        if (stored) {
            setResult(JSON.parse(stored))
        } else {
            navigate('/simular')
        }
    }, [navigate])

    if (!result) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
                <div className="loader"></div>
            </div>
        )
    }

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const getStatusColor = (percentage) => {
        if (percentage < result.limits.warningPercentage) return 'success'
        if (percentage < result.limits.dangerPercentage) return 'warning'
        return 'danger'
    }

    const statusColor = getStatusColor(result.limitPercentage)

    const getStatusMessage = () => {
        if (statusColor === 'success') {
            return {
                icon: '✅',
                title: 'Você está dentro do limite!',
                message: 'Seu faturamento está saudável e bem abaixo do limite MEI.'
            }
        }
        if (statusColor === 'warning') {
            return {
                icon: '⚠️',
                title: 'Atenção ao limite!',
                message: 'Você está se aproximando do limite de faturamento MEI. Fique atento!'
            }
        }
        return {
            icon: '🚨',
            title: 'Limite em risco!',
            message: 'Você está muito próximo ou acima do limite. Considere migrar para ME.'
        }
    }

    const status = getStatusMessage()

    return (
        <div className="results-page">
            <div className="container">
                <div className="results-container">
                    {/* Status Alert */}
                    <div className={`status-alert status-${statusColor}`}>
                        <span className="status-icon">{status.icon}</span>
                        <div>
                            <strong>{status.title}</strong>
                            <p>{status.message}</p>
                        </div>
                    </div>

                    {/* Main Results */}
                    <div className="results-grid">
                        <div className="result-card main-card">
                            <span className="result-icon">📋</span>
                            <span className="result-label">DAS Mensal</span>
                            <span className="result-value">{formatCurrency(result.dasMonthly)}</span>
                            <span className="result-detail">
                                INSS: {formatCurrency(result.breakdown.inss)} +
                                {result.breakdown.icms > 0 ? ` ICMS: ${formatCurrency(result.breakdown.icms)}` : ''}
                                {result.breakdown.iss > 0 ? ` ISS: ${formatCurrency(result.breakdown.iss)}` : ''}
                            </span>
                        </div>

                        <div className="result-card">
                            <span className="result-icon">📅</span>
                            <span className="result-label">Total Anual Estimado</span>
                            <span className="result-value">{formatCurrency(result.dasAnnual)}</span>
                            <span className="result-detail">12x DAS mensal</span>
                        </div>

                        <div className="result-card">
                            <span className="result-icon">📊</span>
                            <span className="result-label">Uso do Limite MEI</span>
                            <span className={`result-value text-${statusColor}`}>
                                {result.limitPercentage.toFixed(1)}%
                            </span>
                            <span className="result-detail">
                                {formatCurrency(result.annualRevenue)} de {formatCurrency(result.limits.annualLimit)}
                            </span>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="limit-section">
                        <div className="limit-header">
                            <span>Limite de Faturamento MEI</span>
                            <span className={`badge badge-${statusColor}`}>
                                {result.limitPercentage.toFixed(1)}%
                            </span>
                        </div>
                        <div className="progress-bar">
                            <div
                                className={`progress-bar-fill ${statusColor}`}
                                style={{ width: `${Math.min(result.limitPercentage, 100)}%` }}
                            ></div>
                        </div>
                        <div className="limit-labels">
                            <span>R$ 0</span>
                            <span className="limit-value">{formatCurrency(result.limits.annualLimit)}</span>
                        </div>
                    </div>

                    {/* Employee Cost */}
                    {result.employeeCost > 0 && (
                        <div className="employee-section">
                            <h3>👤 Custo com Funcionário</h3>
                            <p>
                                Custo estimado mensal: <strong>{formatCurrency(result.employeeCost)}</strong>
                                <br />
                                <span className="text-muted">Inclui salário mínimo, FGTS (8%) e férias proporcionais.</span>
                            </p>
                        </div>
                    )}

                    {/* Upgrade CTA - Prominent when limit is exceeded */}
                    {statusColor !== 'success' && (
                        <div className="upgrade-banner-prominent">
                            <div className="upgrade-banner-content">
                                <span className="upgrade-icon">💎</span>
                                <div className="upgrade-text">
                                    <h3>
                                        {statusColor === 'danger'
                                            ? '🚨 Você está acima do limite MEI!'
                                            : '⚠️ Seu faturamento está alto'}
                                    </h3>
                                    <p>
                                        {statusColor === 'danger'
                                            ? 'Compare os custos MEI x ME e descubra a melhor opção para seu negócio.'
                                            : 'Acompanhe seu limite com alertas personalizados e evite surpresas.'}
                                    </p>
                                </div>
                            </div>
                            <div className="upgrade-features">
                                <span>✅ Comparativo MEI x ME</span>
                                <span>✅ Alertas de limite</span>
                                <span>✅ Relatórios em PDF</span>
                            </div>
                            <Link to="/planos" className="btn btn-upgrade btn-lg">
                                💎 Ver Planos e Benefícios
                            </Link>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="results-actions">
                        <button onClick={() => navigate('/simular')} className="btn btn-secondary">
                            ↩️ Nova Simulação
                        </button>

                        {user ? (
                            <Link to="/comparativo" className="btn btn-primary">
                                📊 Ver Comparativo MEI x ME
                            </Link>
                        ) : (
                            <div className="upgrade-cta">
                                <p>Quer salvar suas simulações e ver comparativos?</p>
                                <div className="upgrade-cta-buttons">
                                    <Link to="/cadastro" className="btn btn-primary">
                                        🚀 Criar Conta Grátis
                                    </Link>
                                    <Link to="/planos" className="btn btn-secondary">
                                        💎 Ver Planos
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="disclaimer">
                        ⚠️ <strong>Importante:</strong> Esta simulação é baseada nas regras vigentes e valores
                        configurados. Consulte um contador para orientações específicas ao seu negócio.
                    </div>
                </div>
            </div>
        </div>
    )
}
