import { useNavigate } from 'react-router-dom'
import {
    TrendingUp,
    Calculator,
    ShieldCheck,
    CreditCard,
    Bell,
    PieChart,
    Activity,
    FileText,
    Zap,
    CheckCircle,
    ArrowRight,
    Star,
    LayoutDashboard,
    Wallet
} from 'lucide-react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart as RePieChart,
    Pie,
    Cell
} from 'recharts'
import './Home.css'

const demoData = [
    { name: 'Jan', entrada: 4000, saida: 2400 },
    { name: 'Fev', entrada: 3000, saida: 1398 },
    { name: 'Mar', entrada: 2000, saida: 9800 },
    { name: 'Abr', entrada: 2780, saida: 3908 },
    { name: 'Mai', entrada: 1890, saida: 4800 },
    { name: 'Jun', entrada: 2390, saida: 3800 },
]

const pieData = [
    { name: 'Operacional', value: 400 },
    { name: 'Impostos', value: 300 },
    { name: 'Pessoal', value: 300 },
    { name: 'Marketing', value: 200 },
]

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']

export default function Home() {
    const navigate = useNavigate()

    return (
        <div className="home-v2">
            {/* 1. HERO SECTION */}
            <section className="hero-v2">
                <div className="hero-grid container">
                    <div className="hero-text">
                        <div className="badge-glow">🚀 O braço direito do MEI moderno</div>
                        <h1>Evolua a Gestão do seu MEI para o <span>Nível Profissional</span></h1>
                        <p>Diga adeus às planilhas confusas. O SimulaMEI é a plataforma completa para você simular impostos, controlar finanças e nunca mais perder prazos.</p>
                        <div className="hero-buttons">
                            <button onClick={() => navigate('/cadastro')} className="btn-main">
                                Começar Agora <ArrowRight size={20} />
                            </button>
                            <button onClick={() => navigate('/simular')} className="btn-outline-v2">
                                Simular Grátis
                            </button>
                        </div>
                        <div className="hero-trust">
                            <div className="trust-icons">
                                <ShieldCheck size={18} /> <span>100% Seguro</span>
                                <Star size={18} /> <span>Feito para Microempreendedores</span>
                            </div>
                        </div>
                    </div>
                    <div className="hero-visual">
                        <div className="dashboard-preview-card">
                            <div className="preview-header">
                                <Activity size={20} /> Preview do Dashboard
                            </div>
                            <div className="preview-chart">
                                <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart data={demoData}>
                                        <defs>
                                            <linearGradient id="colorEntrada" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="entrada" stroke="#10b981" fillOpacity={1} fill="url(#colorEntrada)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="preview-stats">
                                <div className="p-stat"><span>Receita</span> <strong>+R$ 15.420</strong></div>
                                <div className="p-stat"><span>Lucro</span> <strong className="text-emerald">↑ 12%</strong></div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. FERRAMENTAS SECTION (THE MOST IMPORTANT PART) */}
            <section className="tools-section container">
                <div className="section-header-v2">
                    <h2>Ferramentas Poderosas</h2>
                    <p>Tudo o que você precisa para dominar seu CNPJ em um só lugar.</p>
                </div>

                <div className="tools-grid-v2">
                    <div className="tool-card-v2 featured">
                        <div className="tool-icon-v2"><Calculator size={32} /></div>
                        <h3>Simulador de Impostos</h3>
                        <p>Descubra exatamente quanto pagará de DAS e impostos excedentes com base no seu faturamento real.</p>
                        <ul className="tool-features">
                            <li><CheckCircle size={16} /> Limite de Faturamento</li>
                            <li><CheckCircle size={16} /> Cálculo de Excesso</li>
                            <li><CheckCircle size={16} /> Relatórios Exportáveis</li>
                        </ul>
                    </div>

                    <div className="tool-card-v2">
                        <div className="tool-icon-v2"><Wallet size={32} /></div>
                        <h3>Gestão Financeira</h3>
                        <p>Controle entradas e saídas (PF e PJ) com separação inteligente para não misturar as contas.</p>
                        <ul className="tool-features">
                            <li><CheckCircle size={16} /> Fluxo de Caixa</li>
                            <li><CheckCircle size={16} /> Categorias Inteligentes</li>
                            <li><CheckCircle size={16} /> Extrato Detalhado</li>
                        </ul>
                    </div>

                    <div className="tool-card-v2">
                        <div className="tool-icon-v2"><Bell size={32} /></div>
                        <h3>Alertas & Prazos</h3>
                        <p>Nunca mais esqueça de pagar seu DAS ou de fazer sua declaração anual com nossos lembretes.</p>
                        <ul className="tool-features">
                            <li><CheckCircle size={16} /> Vencimento do DAS</li>
                            <li><CheckCircle size={16} /> Alerta de Limite</li>
                            <li><CheckCircle size={16} /> Notificações Dash</li>
                        </ul>
                    </div>

                    <div className="tool-card-v2">
                        <div className="tool-icon-v2"><CreditCard size={32} /></div>
                        <h3>Gestão de Cartões</h3>
                        <p>Cadastre seus cartões de crédito e veja o impacto das faturas no seu saldo mensal automaticamente.</p>
                        <ul className="tool-features">
                            <li><CheckCircle size={16} /> Cartões Visuais</li>
                            <li><CheckCircle size={16} /> Controle de Faturas</li>
                            <li><CheckCircle size={16} /> Lançamento Rápido</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* 3. PLANO OURO (HIGHLIGHTED) */}
            <section className="gold-highlight">
                <div className="container">
                    <div className="gold-grid">
                        <div className="gold-visual">
                            <div className="chart-preview-v2">
                                <ResponsiveContainer width="100%" height={300}>
                                    <RePieChart>
                                        <Pie
                                            data={pieData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </RePieChart>
                                </ResponsiveContainer>
                                <div className="chart-overlay">
                                    <span>Planilha do MEI</span>
                                    <strong>PLATINA</strong>
                                </div>
                            </div>
                        </div>
                        <div className="gold-content">
                            <div className="gold-badge">💎 EXCLUSIVO OURO</div>
                            <h2>A Visão Completa que faltava para o seu Negócio</h2>
                            <p>Assinantes Ouro têm acesso a uma inteligência de dados que normalmente só grandes empresas possuem.</p>

                            <div className="gold-perks">
                                <div className="perk-item">
                                    <PieChart size={24} />
                                    <div>
                                        <h4>Gráficos de Análise</h4>
                                        <p>Visualize para onde vai cada centavo com gráficos de pizza e área dinâmicos.</p>
                                    </div>
                                </div>
                                <div className="perk-item">
                                    <LayoutDashboard size={24} />
                                    <div>
                                        <h4>Dashboard Mestre</h4>
                                        <p>Uma central de comando que resume toda a sua vida financeira em um clique.</p>
                                    </div>
                                </div>
                                <div className="perk-item">
                                    <FileText size={24} />
                                    <div>
                                        <h4>Exportação Completa</h4>
                                        <p>PDFs profissionais para apresentar ao contador ou bancos.</p>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => navigate('/planos')} className="btn-gold">
                                Conhecer Plano Ouro
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. PERSUASIVE / MEI FOCUS */}
            <section className="persuasion-pills container">
                <div className="section-header-v2">
                    <h2>Por que o SimulaMEI é essencial?</h2>
                    <p>Feito por quem entende as dores de ser um MEI no Brasil.</p>
                </div>
                <div className="pills-grid">
                    <div className="pill-card">
                        <Zap size={28} />
                        <h3>Decisões Rápidas</h3>
                        <p>Saiba se pode faturar mais este mês sem desenquadrar do MEI.</p>
                    </div>
                    <div className="pill-card">
                        <ShieldCheck size={28} />
                        <h3>Sono Tranquilo</h3>
                        <p>Prazos e impostos sob controle. Sem multas por esquecimento.</p>
                    </div>
                    <div className="pill-card">
                        <TrendingUp size={28} />
                        <h3>Mais Lucro</h3>
                        <p>Ao entender suas despesas, você descobre onde pode economizar.</p>
                    </div>
                </div>
            </section>

            {/* 5. FINAL CTA */}
            <section className="final-cta container">
                <div className="final-cta-card">
                    <h2>Não deixe sua gestão para amanhã.</h2>
                    <p>Junte-se a milhares de microempreendedores que já simplificaram sua rotina financeira.</p>
                    <button onClick={() => navigate('/cadastro')} className="btn-main-lg">
                        Começar Agora - É Grátis
                    </button>
                </div>
            </section>
        </div>
    )
}
