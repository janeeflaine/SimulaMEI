import { useState } from 'react'
import {
    ChevronLeft, ChevronRight, Wallet, TrendingUp, CalendarDays, CreditCard, Tags,
    ReceiptText, CalendarClock, ShoppingBag, Lightbulb, BarChart3, PieChart, Table2
} from 'lucide-react'
import { useCardsDashboardSummary } from '../../hooks/useCardsDashboardSummary'
import MonthlyTrendChart from './charts/MonthlyTrendChart'
import './CardsSummaryPanel.css'

const MONTH_NAMES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** Quadro de um número, com ícone (o "Total gasto" vem em destaque) */
function Stat({ icon: Icon, label, value, note, main = false }) {
    return (
        <div className={`csp-stat ${main ? 'csp-stat--main' : ''}`}>
            <span className="csp-stat__icon" aria-hidden="true"><Icon size={20} /></span>
            <div className="csp-stat__body">
                <dt>{label}</dt>
                <dd>{value}</dd>
                {note && <span className="csp-stat__note">{note}</span>}
            </div>
        </div>
    )
}

/** Bloco com título e ícone */
function Block({ icon: Icon, title, children, className = '' }) {
    return (
        <section className={`csp-block ${className}`}>
            <h3 className="csp-block__title">
                <span className="csp-block__icon" aria-hidden="true"><Icon size={18} /></span>
                {title}
            </h3>
            {children}
        </section>
    )
}

/** Linhas com barra proporcional (por cartão, por categoria) */
function BarList({ rows, emptyLabel }) {
    if (!rows.length) return <p className="csp-muted">{emptyLabel}</p>
    const max = Math.max(...rows.map(r => r.total), 0)
    return (
        <ul className="csp-bars">
            {rows.map(row => (
                <li key={row.key} className={row.muted ? 'is-muted' : ''}>
                    <div className="csp-bars__line">
                        <span className="csp-bars__name">{row.label}</span>
                        <span className="csp-bars__value">{brl(row.total)}</span>
                    </div>
                    <div className="csp-bars__track" aria-hidden="true">
                        <span style={{ width: `${max > 0 ? Math.max(row.total > 0 ? 2 : 0, (row.total / max) * 100) : 0}%` }} />
                    </div>
                    {row.note && <span className="csp-bars__note">{row.note}</span>}
                </li>
            ))}
        </ul>
    )
}

/**
 * Gastos de todos os cartões no ano: números em quadros, destaques,
 * mês a mês, por cartão, por categoria e as faturas de cada cartão.
 * Os cálculos ficam no useCardsDashboardSummary.
 */
export default function CardsSummaryPanel() {
    const currentYear = new Date().getFullYear()
    const [year, setYear] = useState(currentYear)

    const {
        loading, error, kpis, cards, totalCurrentMonth, totalNextMonth,
        cardBreakdown, categoryBreakdown, monthlyTrend, insights, refetch
    } = useCardsDashboardSummary(year)

    const hasData = !loading && !error && kpis?.totalSpent > 0
    const topMonth = kpis?.mostExpensiveMonth
    const monthsWithData = (monthlyTrend || []).filter(m => m.total > 0).length

    // Faturas por cartão: fatura atual e próxima (agora) + total do ano escolhido
    const yearByCard = new Map((cardBreakdown || []).map(c => [String(c.cardId), c]))
    const invoiceRows = (cards || []).map(card => {
        const yearData = yearByCard.get(String(card.id))
        return {
            id: card.id,
            name: card.name,
            current: Number(card.currentMonthTotal) || 0,
            next: Number(card.nextMonthTotal) || 0,
            yearTotal: yearData?.total || 0,
            percent: yearData?.percent || 0
        }
    }).sort((a, b) => b.yearTotal - a.yearTotal)

    return (
        <section className="csp" aria-labelledby="csp-title">
            <div className="csp-head">
                <div>
                    <h2 id="csp-title" className="csp-title">Gastos nos cartões em {year}</h2>
                    <p className="csp-sub">Soma das faturas de todos os cartões.</p>
                </div>
                <div className="csp-year" role="group" aria-label="Ano">
                    <button type="button" className="csp-year__btn" onClick={() => setYear(y => y - 1)} aria-label="Ano anterior">
                        <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <span className="csp-year__label">{year}</span>
                    <button
                        type="button"
                        className="csp-year__btn"
                        onClick={() => setYear(y => y + 1)}
                        disabled={year >= currentYear}
                        aria-label="Próximo ano"
                    >
                        <ChevronRight size={18} aria-hidden="true" />
                    </button>
                </div>
            </div>

            {loading && (
                <div className="csp-loading" aria-busy="true">
                    {Array.from({ length: 8 }, (_, i) => <span key={i} />)}
                </div>
            )}

            {error && !loading && (
                <div className="csp-message" role="alert">
                    <p>Não deu para carregar os gastos dos cartões.</p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={refetch}>Tentar de novo</button>
                </div>
            )}

            {!loading && !error && !hasData && (
                <div className="csp-message">
                    <span className="csp-message__icon" aria-hidden="true"><ReceiptText size={22} /></span>
                    <p><strong>Nenhuma fatura em {year}.</strong> Envie a fatura de um cartão em "Ver faturas" para ver os gastos aqui.</p>
                </div>
            )}

            {hasData && (
                <>
                    <dl className="csp-stats">
                        <Stat
                            main
                            icon={Wallet}
                            label="Total gasto"
                            value={brl(kpis.totalSpent)}
                            note={`em ${plural(monthsWithData, 'mês', 'meses')} com fatura`}
                        />
                        <Stat
                            icon={TrendingUp}
                            label="Média por mês"
                            value={brl(kpis.monthlyAverage)}
                            note="nos meses com fatura"
                        />
                        <Stat
                            icon={CalendarDays}
                            label="Mês mais caro"
                            value={topMonth ? MONTH_NAMES[topMonth.month] : '—'}
                            note={topMonth ? brl(topMonth.total) : null}
                        />
                        <Stat
                            icon={CreditCard}
                            label="Cartão que mais gastou"
                            value={kpis.topCard?.name || '—'}
                            note={kpis.topCard ? `${brl(kpis.topCard.total)}, ${kpis.topCardPercent}% do total` : null}
                        />
                        <Stat
                            icon={Tags}
                            label="Categoria com mais gastos"
                            value={kpis.topCategory?.category || '—'}
                            note={kpis.topCategory ? brl(kpis.topCategory.total) : null}
                        />
                        <Stat
                            icon={ReceiptText}
                            label="Faturas abertas agora"
                            value={brl(totalCurrentMonth)}
                            note="somando todos os cartões"
                        />
                        <Stat
                            icon={CalendarClock}
                            label="Próximas faturas"
                            value={brl(totalNextMonth)}
                            note="já lançado para o mês seguinte"
                        />
                        <Stat
                            icon={ShoppingBag}
                            label="Compras nas faturas"
                            value={kpis.totalTransactions}
                            note={`em ${plural(kpis.activeCards, 'cartão', 'cartões')}`}
                        />
                    </dl>

                    {insights?.length > 0 && (
                        <Block icon={Lightbulb} title="Destaques do ano" className="csp-block--insights">
                            <ul className="csp-insights">
                                {insights.map((text, i) => <li key={i}>{text}</li>)}
                            </ul>
                        </Block>
                    )}

                    <Block icon={BarChart3} title="Mês a mês">
                        <MonthlyTrendChart data={monthlyTrend} />
                    </Block>

                    <div className="csp-split">
                        <Block icon={CreditCard} title="Gasto por cartão">
                            <BarList
                                emptyLabel="Nenhum gasto nos cartões."
                                rows={cardBreakdown.map(c => ({
                                    key: c.cardId ?? c.name,
                                    label: c.name,
                                    total: c.total,
                                    note: `${c.percent}% do total`
                                }))}
                            />
                        </Block>
                        <Block icon={PieChart} title="Gasto por categoria">
                            <BarList
                                emptyLabel="Nenhuma categoria nas faturas."
                                rows={categoryBreakdown.map(c => ({
                                    key: c.category,
                                    label: c.category === 'Sem Categoria' ? 'Sem categoria' : c.category,
                                    total: c.total,
                                    muted: c.category === 'Outros' || c.category === 'Sem Categoria',
                                    note: plural(c.count, 'compra', 'compras')
                                }))}
                            />
                        </Block>
                    </div>

                    {invoiceRows.length > 0 && (
                        <Block icon={Table2} title="Faturas por cartão">
                            <table className="csp-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Cartão</th>
                                        <th scope="col">Fatura aberta</th>
                                        <th scope="col">Próxima fatura</th>
                                        <th scope="col">Total em {year}</th>
                                        <th scope="col">Parte do ano</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoiceRows.map(row => (
                                        <tr key={row.id}>
                                            <th scope="row" className="csp-table__name">{row.name}</th>
                                            <td data-label="Fatura aberta">{brl(row.current)}</td>
                                            <td data-label="Próxima fatura">{brl(row.next)}</td>
                                            <td data-label={`Total em ${year}`} className="csp-table__strong">{brl(row.yearTotal)}</td>
                                            <td data-label="Parte do ano">
                                                <span className="csp-table__share">
                                                    <span className="csp-bars__track" aria-hidden="true">
                                                        <span style={{ width: `${row.percent}%` }} />
                                                    </span>
                                                    {row.percent}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Block>
                    )}
                </>
            )}
        </section>
    )
}
