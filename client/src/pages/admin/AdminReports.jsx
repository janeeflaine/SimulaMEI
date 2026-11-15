import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPlus, Calculator, BadgeCheck, Wallet, BarChart3, Gem, Download, RotateCw, AlertTriangle } from 'lucide-react'
import { Stat, Block } from '../../components/cards/CardsSummaryPanel'
import Select from '../../components/ui/Select'
import { showToast } from '../../utils/toast'
// AdminPages.css segue importado: as outras páginas do admin ainda usam as classes dele
import './AdminPages.css'
import './AdminReports.css'

const PERIODS = [
    { value: '7d', label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: '12m', label: 'Últimos 12 meses' },
]
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const num = (v) => new Intl.NumberFormat('pt-BR').format(Number(v) || 0)
const pct = (v) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format((Number(v) || 0) * 100)}%`
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// "2026-11-15" -> "15/11" (dia) ou "nov/26" (mês). Sem Date: a data já vem no horário de Brasília.
function dateLabel(iso, unit, long = false) {
    const [y, m, d] = String(iso).split('-')
    if (unit === 'month') return long ? `${MONTHS[Number(m) - 1]} de ${y}` : `${MONTHS[Number(m) - 1]}/${y.slice(2)}`
    return long ? `${d}/${m}/${y}` : `${d}/${m}`
}

const isValid = (d) => d && Array.isArray(d.series) && Array.isArray(d.plans) && d.totals && d.subscriptions

// Planilha com ";" e vírgula decimal (abre direto no Excel em português). Só números
// somados, sem dado de pessoa. Texto que começa com = + - @ ganha ' na frente para
// a planilha não executar como fórmula.
function downloadCsv(filename, header, rows) {
    const cell = (v) => {
        let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '')
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
        return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function BarChart({ series, field, unit, noun }) {
    const [hover, setHover] = useState(null)
    const max = Math.max(1, ...series.map((r) => r[field]))
    // Rótulos do eixo (contando do fim): todos em 7 dias, um por semana em 30 dias, um a cada 3 meses em 12 meses
    const every = series.length > 14 ? 7 : series.length > 7 ? 3 : 1
    const last = series.length - 1
    const total = series.reduce((n, r) => n + r[field], 0)
    return (
        <figure className="arp-chart" aria-label={`${noun.many} por ${unit === 'month' ? 'mês' : 'dia'}: ${num(total)} no período`}>
            <div className="arp-chart__plot" onMouseLeave={() => setHover(null)}>
                <span className="arp-chart__max" aria-hidden="true">{num(max)}</span>
                <div className="arp-chart__bars" style={{ '--n': series.length }} aria-hidden="true">
                    {series.map((r, i) => (
                        <div key={r.date} className={`arp-col${hover === i ? ' is-hover' : ''}`} onMouseEnter={() => setHover(i)}>
                            {r[field] > 0 && <span className="arp-bar" style={{ height: `${(r[field] / max) * 100}%` }} />}
                        </div>
                    ))}
                </div>
                {hover !== null && (
                    <div className="arp-tip" style={{ '--x': `${((hover + 0.5) / series.length) * 100}%` }} data-edge={hover < 2 ? 'start' : hover > last - 2 ? 'end' : undefined} aria-hidden="true">
                        <b>{num(series[hover][field])} {series[hover][field] === 1 ? noun.one : noun.many}</b>
                        <span>{dateLabel(series[hover].date, unit, true)}</span>
                    </div>
                )}
            </div>
            <div className="arp-chart__axis" style={{ '--n': series.length }} aria-hidden="true">
                {series.map((r, i) => <span key={r.date}>{(last - i) % every === 0 ? dateLabel(r.date, unit) : ''}</span>)}
            </div>
        </figure>
    )
}

export default function AdminReports() {
    const [period, setPeriod] = useState('30d')
    const [data, setData] = useState(null)
    const [status, setStatus] = useState('loading')
    const reqId = useRef(0)
    const shown = useRef(null) // período dos números na tela
    const skipLoad = useRef(false)

    const load = useCallback(async (p) => {
        const id = ++reqId.current
        setStatus((s) => (s === 'ready' ? 'refreshing' : 'loading'))
        try {
            const res = await fetch(`/api/admin/reports?period=${encodeURIComponent(p)}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            })
            const body = await res.json().catch(() => null)
            if (!res.ok || !isValid(body)) throw new Error('resposta inesperada')
            if (id !== reqId.current) return // o período mudou enquanto carregava
            shown.current = body.period
            setData(body)
            setStatus('ready')
        } catch (err) {
            if (id !== reqId.current) return
            console.error('Relatórios:', err)
            // Falhou ao trocar o período: a lista volta para o período dos números na tela
            if (shown.current) {
                skipLoad.current = true
                setPeriod(shown.current)
            }
            setStatus((s) => (s === 'refreshing' ? 'ready' : 'error'))
            showToast('Não deu para carregar esse período. Tente de novo.', 'error')
        }
    }, [])
    useEffect(() => {
        if (skipLoad.current) { skipLoad.current = false; return }
        load(period)
    }, [load, period])

    const head = (
        <header className="arp-head">
            <div>
                <h1>Relatórios</h1>
                <p>Cadastros, simulações e assinaturas, só em números somados.</p>
            </div>
            <Select variant="pill" ariaLabel="Período" value={period} onChange={setPeriod} options={PERIODS} active={period !== '30d'} />
        </header>
    )

    if (status === 'loading' || (status === 'error' && !data)) {
        return (
            <div className="arp adm-light">
                {head}
                {status === 'loading' ? (
                    <div className="arp-state" role="status"><span className="arp-spinner" aria-hidden="true" />Carregando os relatórios…</div>
                ) : (
                    <div className="arp-state arp-state--error" role="alert">
                        <span className="arp-state__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                        <h2>Não deu para carregar os relatórios</h2>
                        <p>O servidor não respondeu direito. Tente de novo em alguns segundos.</p>
                        <button type="button" className="arp-btn arp-btn--primary" onClick={() => load(period)}>
                            <RotateCw size={16} aria-hidden="true" />Tentar de novo
                        </button>
                    </div>
                )}
            </div>
        )
    }

    const { series, totals, plans, subscriptions, unit } = data
    const per = unit === 'month' ? 'mês' : 'dia'
    const periodLabel = PERIODS.find((p) => p.value === data.period)?.label.toLowerCase() || 'no período'
    const plansSorted = [...plans].sort((a, b) => b.price - a.price || b.count - a.count)

    const exportSeries = () => downloadCsv(
        `relatorio-${data.period}-por-${unit === 'month' ? 'mes' : 'dia'}.csv`,
        [unit === 'month' ? 'Mês' : 'Dia', 'Cadastros', 'Simulações'],
        series.map((r) => [dateLabel(r.date, unit, true), r.signups, r.simulations]),
    )
    const exportPlans = () => downloadCsv(
        'relatorio-planos.csv',
        ['Plano', 'Contas', 'Pagando', 'Preço por mês', 'Receita por mês'],
        plansSorted.map((p) => [p.name, p.count, p.paying, p.price, Math.round(p.paying * p.price * 100) / 100]),
    )

    return (
        <div className={`arp adm-light${status === 'refreshing' ? ' is-refreshing' : ''}`} aria-busy={status === 'refreshing'}>
            {head}

            <div className="csp csp--flat">
                <dl className="csp-stats arp-stats">
                    <Stat icon={UserPlus} label="Cadastros" value={num(totals.signups)} note={periodLabel} />
                    <Stat icon={Calculator} label="Simulações" value={num(totals.simulations)} note={periodLabel} />
                    <Stat icon={BadgeCheck} label="Viraram assinantes" value={pct(totals.conversionRate)}
                        note={totals.signups > 0 ? `${num(totals.converted)} de ${num(totals.signups)} cadastros pagam hoje` : 'Nenhum cadastro no período'} />
                    <Stat icon={Wallet} label="Receita por mês, hoje" value={brl(subscriptions.monthlyRevenue)} main
                        note={`${num(subscriptions.paying)} ${subscriptions.paying === 1 ? 'assinatura pagando' : 'assinaturas pagando'}`} />
                </dl>

                <Block icon={BarChart3} title={`Por ${per}`} className="arp-block"
                    aside={<button type="button" className="arp-btn arp-btn--sm" onClick={exportSeries}><Download size={16} aria-hidden="true" />Baixar planilha</button>}>
                    <div className="arp-charts">
                        <div>
                            <h3 className="arp-chart__title">Cadastros</h3>
                            <BarChart series={series} field="signups" unit={unit} noun={{ one: 'cadastro', many: 'cadastros' }} />
                        </div>
                        <div>
                            <h3 className="arp-chart__title">Simulações</h3>
                            <BarChart series={series} field="simulations" unit={unit} noun={{ one: 'simulação', many: 'simulações' }} />
                        </div>
                    </div>
                    <details className="arp-table-toggle">
                        <summary>Ver em tabela</summary>
                        <div className="arp-table-wrap">
                            <table className="arp-table">
                                <thead><tr><th scope="col">{unit === 'month' ? 'Mês' : 'Dia'}</th><th scope="col">Cadastros</th><th scope="col">Simulações</th></tr></thead>
                                <tbody>
                                    {[...series].reverse().map((r) => (
                                        <tr key={r.date}><th scope="row">{dateLabel(r.date, unit, true)}</th><td>{num(r.signups)}</td><td>{num(r.simulations)}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </Block>

                <Block icon={Gem} title="Planos hoje" className="arp-block"
                    aside={<button type="button" className="arp-btn arp-btn--sm" onClick={exportPlans}><Download size={16} aria-hidden="true" />Baixar planilha</button>}>
                    <div className="arp-table-wrap">
                        <table className="arp-table arp-table--plans">
                            <thead>
                                <tr><th scope="col">Plano</th><th scope="col">Contas</th><th scope="col">Pagando</th><th scope="col" className="arp-wide">Receita por mês</th></tr>
                            </thead>
                            <tbody>
                                {plansSorted.map((p) => (
                                    <tr key={p.id ?? 'sem-plano'}>
                                        <th scope="row">{p.name}<small>{p.price > 0 ? `${brl(p.price)} por mês` : 'Grátis'}</small></th>
                                        <td>{num(p.count)}</td>
                                        <td>{p.price > 0 ? num(p.paying) : '–'}{p.price > 0 && <small className="arp-narrow">{brl(p.paying * p.price)} por mês</small>}</td>
                                        <td className="arp-wide">{p.price > 0 ? brl(p.paying * p.price) : '–'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="arp-foot">
                        "Pagando" conta só assinaturas ativas no Stripe. Quem recebeu o plano pelo admin entra em Contas, não em Pagando.
                        O histórico de cobranças, falhas e reembolsos fica no painel do Stripe.
                    </p>
                </Block>
            </div>
        </div>
    )
}
