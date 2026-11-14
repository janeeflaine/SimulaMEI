import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    Calculator,
    Wallet,
    Receipt,
    CreditCard,
    BellRing,
    MessageCircle,
    ShieldCheck,
    Check
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './Home.css'

// Limite do MEI por ano (LC 238/2026). O servidor manda o valor atual do admin;
// estes ficam só enquanto ele não responde.
const LAW = { 2026: 81000, 2027: 110000, 2028: 140000 }
const lawLimit = (year) => (year >= 2028 ? LAW[2028] : year === 2027 ? LAW[2027] : LAW[2026])
const thisYear = () => Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 4))

const brl = (v, cents = false) => (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0
})
const thousand = (v) => `R$ ${(Number(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
const parseMoney = (text) => {
    let s = String(text ?? '').replace(/[R$\s]/g, '')
    if (!s) return NaN
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
    return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

const FEATURES = [
    { icon: Calculator, title: 'Simulador do MEI', text: 'Quanto vai pagar de DAS e quanto do limite anual o seu faturamento usa.' },
    { icon: Wallet, title: 'Dinheiro do MEI separado do da casa', text: 'Carteiras do MEI e pessoais no mesmo Extrato, cada uma com o seu saldo.' },
    { icon: Receipt, title: 'Contas a pagar', text: 'Boletos com vencimento, avisados no dia pelo WhatsApp.' },
    { icon: CreditCard, title: 'Cartões e faturas', text: 'Compras do cartão por fatura. Mande o PDF e a IA lança as compras para você conferir.' },
    { icon: BellRing, title: 'Alertas do MEI', text: 'Aviso quando o faturamento chega perto do limite, antes do DAS e na época da declaração anual.' },
    { icon: MessageCircle, title: 'Assistente no WhatsApp', text: 'Escreva "gastei 45 no mercado" e o lançamento vai para o Extrato.' }
]

export default function Home() {
    const { user } = useAuth()
    const year = thisYear()
    const [limits, setLimits] = useState({ current: lawLimit(year), next: lawLimit(year + 1) })
    const [monthly, setMonthly] = useState('6.000')

    useEffect(() => {
        let alive = true
        fetch('/api/simulate/limits')
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (!alive || !data) return
                const cur = Number(data.current?.annualLimit), nxt = Number(data.next?.annualLimit)
                setLimits(l => ({ current: cur > 0 ? cur : l.current, next: nxt > 0 ? nxt : l.next }))
            })
            .catch(() => {})
        return () => { alive = false }
    }, [])

    const value = parseMoney(monthly)
    const calc = useMemo(() => {
        if (!Number.isFinite(value) || value <= 0) return null
        const annual = value * 12
        const pct = (annual / limits.current) * 100
        const pctNext = (annual / limits.next) * 100
        return { annual, pct, pctNext, left: limits.current - annual }
    }, [value, limits])
    const pctText = (p) => `${p.toLocaleString('pt-BR', { maximumFractionDigits: p < 10 ? 1 : 0 })}%`
    const status = !calc ? null : calc.pct > 100 ? 'over' : calc.pct >= 80 ? 'near' : 'ok'

    const primary = user
        ? { to: '/dashboard', label: 'Ir para o Painel' }
        : { to: '/cadastro', label: 'Criar conta grátis' }

    return (
        <div className="inicio">
            {/* Topo: a pergunta que todo MEI faz, respondida na hora */}
            <section className="ini-hero">
                <div className="ini-wrap ini-hero__grid">
                    <div className="ini-hero__text">
                        <h1 className="ini-title">O seu MEI em dia, sem planilha.</h1>
                        <p className="ini-lead">
                            Simule o DAS e o limite do ano, separe o dinheiro do MEI do da casa e
                            receba os vencimentos no WhatsApp.
                        </p>
                        <div className="ini-actions">
                            <Link to={primary.to} className="ini-btn ini-btn--primary">{primary.label}</Link>
                            <Link to="/simular" className="ini-btn">Abrir o Simulador</Link>
                        </div>
                        {!user && <p className="ini-trust">
                            <ShieldCheck size={16} aria-hidden="true" />
                            Plano gratuito para começar. Seus dados ficam protegidos pela LGPD.
                        </p>}
                    </div>

                    <div className="ini-calc" aria-labelledby="ini-calc-title">
                        <h2 id="ini-calc-title" className="ini-calc__title">Quanto do limite do MEI você usa?</h2>
                        <label className="ini-calc__field">
                            <span>O MEI recebe por mês</span>
                            <span className="ini-calc__money">
                                <b aria-hidden="true">R$</b>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    value={monthly}
                                    onChange={(e) => setMonthly(e.target.value.replace(/[^\d.,]/g, ''))}
                                    aria-describedby="ini-calc-result"
                                />
                            </span>
                        </label>

                        <div id="ini-calc-result" className="ini-calc__result" aria-live="polite">
                            {calc ? (
                                <>
                                    <p className="ini-calc__big">{pctText(calc.pct)}</p>
                                    <p className="ini-calc__caption">
                                        do limite de {year} ({thousand(limits.current)}), com {brl(calc.annual)} no ano
                                    </p>
                                    <div className="ini-bar" role="img" aria-label={`${pctText(calc.pct)} do limite de ${year}`}>
                                        <i className={`is-${status}`} style={{ width: `${Math.min(100, calc.pct)}%` }} />
                                    </div>
                                    <p className={`ini-calc__note is-${status}`}>
                                        {Math.abs(calc.left) < 0.5
                                            ? 'Bate exatamente no limite do ano.'
                                            : status === 'over'
                                            ? `Passa ${brl(-calc.left)} do limite: veja no Simulador o que acontece.`
                                            : status === 'near'
                                                ? `Perto do limite: sobram ${brl(calc.left)} até o fim do ano.`
                                                : `Ainda cabem ${brl(calc.left)} no ano.`}
                                    </p>
                                    <p className="ini-calc__next">
                                        Em {year + 1} o limite passa a {thousand(limits.next)}: o mesmo faturamento usaria {pctText(calc.pctNext)}.
                                    </p>
                                </>
                            ) : (
                                <p className="ini-calc__caption">Digite quanto entra por mês, por exemplo 6.000.</p>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* O que o site faz (só o que existe) */}
            <section className="ini-section" aria-labelledby="ini-features-title">
                <div className="ini-wrap">
                    <h2 id="ini-features-title" className="ini-h2">Tudo do MEI num lugar só</h2>
                    <ul className="ini-features">
                        {FEATURES.map(({ icon: Icon, title, text }) => (
                            <li key={title} className="ini-feature">
                                <span className="ini-feature__icon" aria-hidden="true"><Icon size={22} /></span>
                                <h3>{title}</h3>
                                <p>{text}</p>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* WhatsApp: o jeito mais rápido de lançar */}
            <section className="ini-section ini-section--paper" aria-labelledby="ini-wa-title">
                <div className="ini-wrap ini-wa">
                    <div className="ini-wa__text">
                        <h2 id="ini-wa-title" className="ini-h2">Lance pelo WhatsApp, do jeito que você fala</h2>
                        <p className="ini-lead ini-lead--sm">
                            Vincule o seu número em Minha conta e mande mensagens como numa conversa.
                            Antes de gravar, o assistente mostra o resumo para você confirmar.
                        </p>
                        <ul className="ini-checks">
                            <li><Check size={18} aria-hidden="true" /> "vendi 120 de espetinho no pix"</li>
                            <li><Check size={18} aria-hidden="true" /> "contas de hoje"</li>
                            <li><Check size={18} aria-hidden="true" /> Lembrete das contas que vencem, às 8h</li>
                        </ul>
                    </div>
                    <div className="ini-chat" aria-hidden="true">
                        <div className="ini-chat__head"><MessageCircle size={16} /> Eu Sempre MEI</div>
                        <p className="ini-msg ini-msg--me">gastei 45 no mercado no pix</p>
                        <div className="ini-msg ini-msg--bot">
                            <strong>Confere?</strong>
                            <span>Despesa de R$ 45,00</span>
                            <span>Mercado, carteira Casa, Pix</span>
                            <span className="ini-msg__btns"><em>Confirmar</em><em>Cancelar</em></span>
                        </div>
                        <p className="ini-msg ini-msg--me">Confirmar</p>
                        <p className="ini-msg ini-msg--bot">Pronto, lançado no Extrato.</p>
                    </div>
                </div>
            </section>

            {/* O limite mudou (LC 238/2026) */}
            <section className="ini-section" aria-labelledby="ini-law-title">
                <div className="ini-wrap ini-law">
                    <div>
                        <h2 id="ini-law-title" className="ini-h2">O limite do MEI vai subir</h2>
                        <p className="ini-lead ini-lead--sm">
                            Pela Lei Complementar 238/2026, o teto de faturamento anual muda nos próximos anos.
                            Os alertas e o Simulador já usam o limite de cada ano.
                        </p>
                    </div>
                    <ol className="ini-years">
                        <li><span>até 2026</span><strong>R$ 81 mil</strong></li>
                        <li><span>2027</span><strong>R$ 110 mil</strong></li>
                        <li><span>a partir de 2028</span><strong>R$ 140 mil</strong><small>depende do orçamento</small></li>
                    </ol>
                </div>
            </section>

            {!user && (
            <section className="ini-section ini-section--last">
                <div className="ini-wrap">
                <div className="ini-end">
                    <h2 className="ini-h2">Comece pelo plano gratuito</h2>
                    <p className="ini-lead ini-lead--sm">Crie a conta, cadastre a carteira do MEI e lance a primeira venda. Na página de planos você vê o que cada um libera.</p>
                    <div className="ini-actions ini-actions--center">
                        <Link to={primary.to} className="ini-btn ini-btn--primary">{primary.label}</Link>
                        <Link to="/planos" className="ini-btn">Comparar planos</Link>
                    </div>
                </div>
                </div>
            </section>
            )}
        </div>
    )
}
