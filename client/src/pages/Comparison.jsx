import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, X } from 'lucide-react'
import '../components/cards/CardsSummaryPanel.css' // .csp-loading enquanto carrega
import './Comparison.css'

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v) => `${((Number(v) || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const ACTIVITY = { comercio: 'comércio', servico: 'serviço', ambos: 'comércio e serviço' }

export default function Comparison() {
    const [state, setState] = useState({ status: 'loading', data: null, sim: null, message: '' })

    useEffect(() => {
        let sim = null
        try { sim = JSON.parse(sessionStorage.getItem('simulationResult') || 'null') } catch { sim = null }
        if (!sim || !(Number(sim.annualRevenue) > 0)) { setState({ status: 'empty' }); return }
        const token = localStorage.getItem('token')
        fetch('/api/simulate/comparison', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ annualRevenue: sim.annualRevenue, activityType: sim.activityType || 'comercio' })
        })
            .then(async res => {
                const body = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(body.message || 'Não deu para montar o comparativo.')
                setState({ status: 'ok', data: body, sim })
            })
            .catch(err => setState({ status: 'error', message: err.message }))
    }, [])

    if (state.status === 'loading') {
        return <div className="comparativo"><div className="cmp-wrap"><div className="csp-loading" aria-busy="true"><span /><span /></div></div></div>
    }
    if (state.status !== 'ok') {
        return (
            <div className="comparativo">
                <div className="cmp-wrap cmp-empty">
                    <h1 className="cmp-title">Comparativo MEI e Microempresa</h1>
                    <p className="cmp-sub">{state.status === 'error' ? state.message : 'Faça uma simulação primeiro: o comparativo usa o faturamento dela.'}</p>
                    <Link to="/simular" className="cmp-btn cmp-btn--primary">Abrir o Simulador</Link>
                </div>
            </div>
        )
    }

    const { data, sim } = state
    const { mei, me } = data
    const cheaper = me.annualTax < mei.annualTax ? 'me' : 'mei'
    const diff = Math.abs(me.annualTax - mei.annualTax)

    return (
        <div className="comparativo">
            <div className="cmp-wrap">
                <Link to="/resultado" className="cmp-back"><ArrowLeft size={18} aria-hidden="true" /> Voltar ao resultado</Link>
                <header className="cmp-head">
                    <h1 className="cmp-title">MEI ou Microempresa?</h1>
                    <p className="cmp-sub">Com {brl(sim.annualRevenue)} por ano em {ACTIVITY[sim.activityType] || 'comércio'}.</p>
                </header>

                <div className={`cmp-verdict is-${data.recommendation === 'mei' ? 'ok' : data.overLimit ? 'over' : 'near'}`} role="status">
                    <strong>{data.recommendation === 'mei' ? 'Ficar no MEI compensa' : data.overLimit ? 'Acima do limite do MEI' : 'Hora de planejar a mudança'}</strong>
                    <span>{data.message}</span>
                </div>

                <div className="cmp-grid">
                    <section className="cmp-card is-mei" aria-labelledby="cmp-mei">
                        <div className="cmp-card__head">
                            <h2 id="cmp-mei">MEI</h2>
                            <span className="cmp-tag">Hoje</span>
                        </div>
                        <dl className="cmp-rows">
                            <div><dt>Imposto por mês</dt><dd>{brl(mei.monthlyTax)}</dd></div>
                            <div className="is-strong"><dt>Imposto no ano</dt><dd>{brl(mei.annualTax)}</dd></div>
                            <div><dt>Limite de faturamento em {mei.year}</dt><dd>{brl(mei.limit)}</dd></div>
                        </dl>
                        <ul className="cmp-list">
                            <li className="is-pro"><Check size={16} aria-hidden="true" /> Valor fixo, faturando muito ou pouco</li>
                            <li className="is-pro"><Check size={16} aria-hidden="true" /> Não precisa de contador</li>
                            <li className="is-con"><X size={16} aria-hidden="true" /> Limite de faturamento por ano</li>
                            <li className="is-con"><X size={16} aria-hidden="true" /> {mei.employeesAllowed > 1 ? `Até ${mei.employeesAllowed} funcionários` : 'Só 1 funcionário'}, sem sócios</li>
                        </ul>
                    </section>

                    <section className="cmp-card" aria-labelledby="cmp-me">
                        <div className="cmp-card__head">
                            <h2 id="cmp-me">Microempresa</h2>
                            <span className="cmp-tag cmp-tag--soft">Simples Nacional, Anexo {me.annex}</span>
                        </div>
                        <dl className="cmp-rows">
                            <div><dt>Imposto por mês</dt><dd>{brl(me.monthlyTax)}</dd></div>
                            <div className="is-strong"><dt>Imposto no ano</dt><dd>{brl(me.annualTax)}</dd></div>
                            <div><dt>Alíquota efetiva</dt><dd>{pct(me.rate)}</dd></div>
                            <div><dt>Limite de faturamento</dt><dd>{brl(me.limit)}</dd></div>
                        </dl>
                        <ul className="cmp-list">
                            <li className="is-pro"><Check size={16} aria-hidden="true" /> Fatura até R$ 4,8 milhões por ano</li>
                            <li className="is-pro"><Check size={16} aria-hidden="true" /> Mais funcionários e sócios</li>
                            <li className="is-con"><X size={16} aria-hidden="true" /> Imposto sobe junto com o faturamento</li>
                            <li className="is-con"><X size={16} aria-hidden="true" /> Precisa de contador (custo fora desta conta)</li>
                        </ul>
                    </section>
                </div>

                <p className="cmp-diff">
                    {cheaper === 'mei'
                        ? <>No MEI você paga <strong>{brl(diff)} a menos</strong> de imposto por ano.</>
                        : <>Como Microempresa o imposto seria <strong>{brl(diff)} menor</strong> no ano, mas some o custo do contador.</>}
                </p>

                <p className="cmp-note">
                    Microempresa calculada com as faixas do Simples Nacional: comércio no Anexo I e serviços no Anexo III
                    {sim.activityType === 'ambos' ? ' (para comércio e serviço juntos usamos o Anexo III, o mais caro dos dois)' : ''}.
                    Alguns serviços caem no Anexo V, com imposto maior. Estimativa, não substitui um contador.
                </p>

                <div className="cmp-actions">
                    <Link to="/simular" className="cmp-btn">Nova simulação</Link>
                    <Link to="/dashboard" className="cmp-btn cmp-btn--primary">Ir para o Painel</Link>
                </div>
            </div>
        </div>
    )
}
