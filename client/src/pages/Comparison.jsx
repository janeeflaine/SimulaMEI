import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Comparison.css'

export default function Comparison() {
    const { user } = useAuth()
    const [comparison, setComparison] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchComparison()
    }, [])

    const fetchComparison = async () => {
        try {
            const token = localStorage.getItem('token')
            const stored = sessionStorage.getItem('simulationResult')

            if (stored) {
                const simulation = JSON.parse(stored)
                const res = await fetch('/api/simulate/comparison', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ annualRevenue: simulation.annualRevenue })
                })
                const data = await res.json()
                setComparison(data)
            }
        } catch (error) {
            console.error('Erro ao carregar comparativo:', error)
        } finally {
            setLoading(false)
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

    if (!comparison) {
        return (
            <div className="comparison-page">
                <div className="container">
                    <div className="empty-state">
                        <h2>Faça uma simulação primeiro</h2>
                        <p>Realize uma simulação para ver o comparativo MEI x ME</p>
                        <Link to="/simular" className="btn btn-primary">
                            Simular Agora
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="comparison-page">
            <div className="container">
                <div className="comparison-header">
                    <h1>Comparativo MEI x ME</h1>
                    <p className="text-secondary">
                        Veja as diferenças entre ser MEI e Microempresa para seu faturamento
                    </p>
                </div>

                <div className="comparison-grid">
                    {/* MEI Card */}
                    <div className="comparison-card mei-card">
                        <div className="card-header">
                            <span className="card-badge">Atual</span>
                            <h2>MEI</h2>
                            <p>Microempreendedor Individual</p>
                        </div>
                        <div className="card-body">
                            <div className="price-row">
                                <span>Imposto Mensal (DAS)</span>
                                <span className="price">{formatCurrency(comparison.mei.monthlyTax)}</span>
                            </div>
                            <div className="price-row">
                                <span>Imposto Anual</span>
                                <span className="price">{formatCurrency(comparison.mei.annualTax)}</span>
                            </div>
                            <div className="price-row highlight">
                                <span>Limite Faturamento</span>
                                <span>{formatCurrency(comparison.mei.limit)}</span>
                            </div>
                        </div>
                        <ul className="features-list">
                            <li className="feature-item positive">✅ DAS fixo e simplificado</li>
                            <li className="feature-item positive">✅ Dispensa contador obrigatório</li>
                            <li className="feature-item positive">✅ Menos burocracia</li>
                            <li className="feature-item negative">❌ Limite de faturamento</li>
                            <li className="feature-item negative">❌ Apenas 1 funcionário</li>
                        </ul>
                    </div>

                    {/* ME Card */}
                    <div className="comparison-card me-card">
                        <div className="card-header">
                            <span className="card-badge pro">Alternativa</span>
                            <h2>ME</h2>
                            <p>Microempresa (Simples Nacional)</p>
                        </div>
                        <div className="card-body">
                            <div className="price-row">
                                <span>Imposto Mensal (Estimado)</span>
                                <span className="price">{formatCurrency(comparison.me.monthlyTax)}</span>
                            </div>
                            <div className="price-row">
                                <span>Imposto Anual (Estimado)</span>
                                <span className="price">{formatCurrency(comparison.me.annualTax)}</span>
                            </div>
                            <div className="price-row highlight">
                                <span>Limite Faturamento</span>
                                <span>{formatCurrency(comparison.me.limit)}</span>
                            </div>
                        </div>
                        <ul className="features-list">
                            <li className="feature-item positive">✅ Limite maior de faturamento</li>
                            <li className="feature-item positive">✅ Sem limite de funcionários</li>
                            <li className="feature-item positive">✅ Pode ter sócios</li>
                            <li className="feature-item negative">❌ Imposto variável</li>
                            <li className="feature-item negative">❌ Contador obrigatório</li>
                        </ul>
                    </div>
                </div>

                {/* Recommendation */}
                <div className={`recommendation ${comparison.recommendation}`}>
                    <h3>
                        {comparison.recommendation === 'mei'
                            ? '✅ Recomendamos permanecer como MEI'
                            : '⚠️ Considere migrar para ME'}
                    </h3>
                    <p>{comparison.message}</p>
                </div>

                <div className="actions">
                    <Link to="/simular" className="btn btn-secondary">
                        ↩️ Nova Simulação
                    </Link>
                    <Link to="/dashboard" className="btn btn-primary">
                        📊 Ir para Dashboard
                    </Link>
                </div>

                <div className="disclaimer">
                    ⚠️ Os valores de ME são estimativas baseadas no Simples Nacional.
                    Consulte um contador para análise detalhada.
                </div>
            </div>
        </div>
    )
}
