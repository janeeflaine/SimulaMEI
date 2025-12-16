import { Link, useNavigate } from 'react-router-dom'
import './Home.css'

export default function Home() {
    const navigate = useNavigate()

    return (
        <div className="home">
            {/* Hero Section */}
            <section className="hero">
                <div className="hero-bg">
                    <div className="hero-gradient"></div>
                    <div className="hero-pattern"></div>
                </div>
                <div className="container">
                    <div className="hero-content">
                        <span className="hero-badge">✨ Gratuito e sem cadastro</span>
                        <h1 className="hero-title">
                            Descubra quanto você paga de
                            <span className="text-gradient"> imposto como MEI</span>
                        </h1>
                        <p className="hero-subtitle">
                            Simule seus impostos de forma rápida e simples.
                            Entenda o DAS mensal, limite de faturamento e muito mais.
                        </p>
                        <div className="hero-actions">
                            <button onClick={() => navigate('/simular')} className="btn btn-primary btn-lg">
                                🚀 Simular Agora
                            </button>
                            <a href="#como-funciona" className="btn btn-secondary btn-lg">
                                Saiba Mais
                            </a>
                        </div>
                        <div className="hero-stats">
                            <div className="stat">
                                <span className="stat-value">15mil+</span>
                                <span className="stat-label">Simulações</span>
                            </div>
                            <div className="stat-divider"></div>
                            <div className="stat">
                                <span className="stat-value">98%</span>
                                <span className="stat-label">Satisfação</span>
                            </div>
                            <div className="stat-divider"></div>
                            <div className="stat">
                                <span className="stat-value">100%</span>
                                <span className="stat-label">Gratuito</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="benefits" id="beneficios">
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Benefícios</span>
                        <h2 className="section-title">Por que usar o SimulaMEI?</h2>
                        <p className="section-subtitle">
                            Ferramentas simples para você ter controle do seu negócio
                        </p>
                    </div>

                    <div className="benefits-grid">
                        <div className="benefit-card">
                            <div className="benefit-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-primary)' }}>
                                ⚡
                            </div>
                            <h3 className="benefit-title">Resultado Instantâneo</h3>
                            <p className="benefit-description">
                                Calcule seus impostos em segundos, sem complicações ou fórmulas complexas.
                            </p>
                        </div>

                        <div className="benefit-card">
                            <div className="benefit-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-secondary)' }}>
                                📊
                            </div>
                            <h3 className="benefit-title">Acompanhe seu Limite</h3>
                            <p className="benefit-description">
                                Visualize quanto do limite anual do MEI você já utilizou e evite surpresas.
                            </p>
                        </div>

                        <div className="benefit-card">
                            <div className="benefit-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
                                🔔
                            </div>
                            <h3 className="benefit-title">Alertas Inteligentes</h3>
                            <p className="benefit-description">
                                Receba avisos quando estiver próximo de ultrapassar o limite de faturamento.
                            </p>
                        </div>

                        <div className="benefit-card">
                            <div className="benefit-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                                📄
                            </div>
                            <h3 className="benefit-title">Relatórios em PDF</h3>
                            <p className="benefit-description">
                                Exporte suas simulações e compartilhe com seu contador facilmente.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="how-it-works" id="como-funciona">
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Passo a Passo</span>
                        <h2 className="section-title">Como Funciona?</h2>
                        <p className="section-subtitle">
                            Três passos simples para descobrir seus impostos
                        </p>
                    </div>

                    <div className="steps">
                        <div className="step">
                            <div className="step-number">1</div>
                            <div className="step-content">
                                <h3 className="step-title">Informe sua Atividade</h3>
                                <p className="step-description">
                                    Escolha se você trabalha com comércio, serviço ou ambos.
                                </p>
                            </div>
                        </div>

                        <div className="step-connector"></div>

                        <div className="step">
                            <div className="step-number">2</div>
                            <div className="step-content">
                                <h3 className="step-title">Digite o Faturamento</h3>
                                <p className="step-description">
                                    Informe seu faturamento mensal ou anual estimado.
                                </p>
                            </div>
                        </div>

                        <div className="step-connector"></div>

                        <div className="step">
                            <div className="step-number">3</div>
                            <div className="step-content">
                                <h3 className="step-title">Veja o Resultado</h3>
                                <p className="step-description">
                                    Receba instantaneamente o valor do seu DAS e outras informações.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <div className="container">
                    <div className="cta-card">
                        <div className="cta-content">
                            <h2 className="cta-title">Pronto para calcular seus impostos?</h2>
                            <p className="cta-subtitle">
                                É grátis, rápido e você não precisa criar uma conta.
                            </p>
                            <button onClick={() => navigate('/simular')} className="btn btn-primary btn-lg">
                                🚀 Começar Simulação Grátis
                            </button>
                        </div>
                        <div className="cta-decoration">
                            <div className="cta-circle"></div>
                            <div className="cta-circle cta-circle-2"></div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
