import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './Results.css'

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const reais = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (v) => `${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const thousand = (v) => `R$ ${(Number(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
const ACTIVITY = { comercio: 'Comércio', servico: 'Serviço', ambos: 'Comércio e serviço' }
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Próximo DAS: vence no dia 20 do mês seguinte ao do faturamento (dia de hoje em Brasília)
function nextDas(now = new Date()) {
    const [y, m, d] = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number)
    let year = y, month = m // mês do vencimento (1-12)
    if (d > 20) { month += 1; if (month > 12) { month = 1; year += 1 } }
    const ref = month === 1 ? 12 : month - 1
    return { date: `20/${String(month).padStart(2, '0')}/${year}`, ref: MONTHS[ref - 1] }
}

export default function Results() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [result, setResult] = useState(null)

    useEffect(() => {
        try {
            const stored = JSON.parse(sessionStorage.getItem('simulationResult') || 'null')
            if (stored && Number.isFinite(Number(stored.dasMonthly))) setResult(stored)
            else navigate('/simular', { replace: true })
        } catch {
            navigate('/simular', { replace: true })
        }
    }, [navigate])

    if (!result) return null

    const { limits = {}, breakdown = {} } = result
    const year = limits.year
    const percent = Number(result.limitPercentage) || 0
    const left = (Number(limits.annualLimit) || 0) - (Number(result.annualRevenue) || 0)
    const tone = percent > 100 ? 'over' : percent >= (Number(limits.warningPercentage) || 70) ? 'near' : 'ok'
    const excess = result.excess?.kind
    const next = result.next
    const due = nextDas()

    const notice = tone === 'ok'
        ? { title: 'Dentro do limite', text: `Com esse faturamento ainda cabem ${brl(left)} no ano.` }
        : tone === 'near'
            ? { title: 'Perto do limite', text: `Sobram ${brl(left)} até o limite de ${year || 'este ano'}. Acompanhe mês a mês para não passar.` }
            : excess === 'acima20'
                ? { title: `Passa mais de 20% do limite`, text: `São ${brl(-left)} acima. Nesse caso o MEI é desenquadrado desde janeiro do mesmo ano e paga os impostos como Microempresa sobre o ano todo. Converse com um contador.` }
                : { title: 'Passa do limite em até 20%', text: `São ${brl(-left)} acima. O MEI paga imposto extra sobre o que passou, numa guia própria, e vira Microempresa a partir de janeiro do ano seguinte.` }

    return (
        <div className="resultado">
            <div className="res-wrap">
                <Link to="/simular" className="res-back"><ArrowLeft size={18} aria-hidden="true" /> Nova simulação</Link>

                <div className="res-top">
                    {/* DAS: o elemento marcante */}
                    <section className="res-das" aria-labelledby="res-das-title">
                        <h1 id="res-das-title" className="res-das__label">
                            DAS{year ? ` de ${year}` : ''}{ACTIVITY[result.activityType] ? `, ${ACTIVITY[result.activityType]}` : ''}
                        </h1>
                        <p className="res-das__value">{brl(result.dasMonthly)}<span> por mês</span></p>
                        <p className="res-das__year">{brl(result.dasAnnual)} no ano</p>
                        <ul className="res-chips" aria-label="Do que é feito o DAS">
                            <li>INSS {brl(breakdown.inss)}</li>
                            {Number(breakdown.icms) > 0 && <li>ICMS {brl(breakdown.icms)}</li>}
                            {Number(breakdown.iss) > 0 && <li>ISS {brl(breakdown.iss)}</li>}
                        </ul>
                        <dl className="res-das__foot">
                            <div><dt>Próximo vencimento</dt><dd>{due.date}</dd></div>
                            <div><dt>Referente a</dt><dd>{due.ref}</dd></div>
                        </dl>
                        <p className="res-das__note">O valor é o mesmo todo mês e vence sempre no dia 20.</p>
                    </section>

                    <section className="res-limit" aria-labelledby="res-limit-title">
                        <h2 id="res-limit-title" className="res-h2">Faturamento e limite</h2>
                        <dl className="res-rows">
                            <div>
                                <dt>Faturamento no ano<small>{reais(result.monthlyRevenue)} por mês</small></dt>
                                <dd>{reais(result.annualRevenue)}</dd>
                            </div>
                            <div>
                                <dt>Uso do limite{year ? ` de ${year}` : ''}<small>de {thousand(limits.annualLimit)}</small></dt>
                                <dd className={`is-${tone}`}>{pct(percent)}</dd>
                            </div>
                            <div className="res-rows__bar">
                                <div className="res-bar" role="img" aria-label={`${pct(percent)} do limite`}>
                                    <i className={`is-${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
                                </div>
                            </div>
                            {next && (
                                <div>
                                    <dt>Com o limite de {next.year}<small>de {thousand(next.annualLimit)}</small></dt>
                                    <dd>{pct(next.limitPercentage)}</dd>
                                </div>
                            )}
                        </dl>
                    </section>
                </div>

                <div className={`res-notice is-${tone}`} role="status">
                    <strong>{notice.title}</strong>
                    <span>{notice.text}</span>
                </div>

                {Number(result.employeeCost) > 0 && (
                    <section className="res-box" aria-labelledby="res-emp">
                        <span className="res-box__icon" aria-hidden="true"><UserRound size={20} /></span>
                        <div>
                            <h2 id="res-emp" className="res-h2">Funcionário com salário mínimo: {brl(result.employeeCost)} por mês</h2>
                            <p>Salário{breakdown.minimumWage ? ` de ${brl(breakdown.minimumWage)}` : ''}, mais 8% de FGTS e 3% de INSS que o MEI paga. 13º e férias ficam de fora.
                                {result.employeesAllowed ? ` Em ${year} o MEI pode ter até ${result.employeesAllowed} funcionário${result.employeesAllowed > 1 ? 's' : ''}.` : ''}</p>
                        </div>
                    </section>
                )}

                <div className="res-actions">
                    {user ? (
                        <>
                            <Link to="/comparativo" className="res-btn res-btn--primary">Comparar MEI e Microempresa</Link>
                            <Link to="/alertas" className="res-btn">Ver os alertas do limite</Link>
                        </>
                    ) : (
                        <>
                            <Link to="/cadastro" className="res-btn res-btn--primary">Criar conta grátis</Link>
                            <Link to="/planos" className="res-btn">Comparar planos</Link>
                        </>
                    )}
                </div>
                {!user && <p className="res-foot">Com a conta, o site guarda as simulações e avisa quando o faturamento chega perto do limite.</p>}

                <p className="res-disclaimer">Estimativa com as regras atuais. Não substitui a orientação de um contador.</p>
            </div>
        </div>
    )
}
