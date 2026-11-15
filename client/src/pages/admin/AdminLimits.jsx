import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RotateCw, Scale } from 'lucide-react'
import { showToast } from '../../utils/toast'
// AdminPages.css segue importado: as outras páginas do admin ainda usam as classes dele
import './AdminPages.css'
import './AdminLimits.css'

// Limite do MEI por ano (LC 238/2026: 81 mil até 2026, 110 mil em 2027, 140 mil a partir de 2028)
const brl = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
const moneyText = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
// "81.000,00" -> 81000
const parseMoney = (txt) => {
    const clean = String(txt || '').replace(/[^\d,]/g, '')
    if (!clean) return null
    const [int, dec = ''] = clean.split(',')
    const n = Number(`${int || '0'}.${dec.slice(0, 2).padEnd(2, '0')}`)
    return Number.isFinite(n) ? n : null
}

const authHeaders = (json = false) => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` }
    if (json) h['Content-Type'] = 'application/json'
    return h
}

const isValid = (d) => d && Array.isArray(d.years) && d.years.length > 0 && typeof d.year === 'number'
    && d.years.every((r) => typeof r.year === 'number' && Number.isFinite(Number(r.annualLimit)))

export default function AdminLimits() {
    const [data, setData] = useState(null)
    const [status, setStatus] = useState('loading')
    const [year, setYear] = useState(null)
    const [form, setForm] = useState({ annualLimit: '', warning: '70', danger: '90' })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    const load = useCallback(async (keepYear) => {
        try {
            const res = await fetch('/api/admin/limits', { headers: authHeaders() })
            const body = await res.json().catch(() => null)
            if (!res.ok || !isValid(body)) throw new Error('resposta inesperada')
            setData(body)
            const y = keepYear || body.year
            const row = body.years.find((r) => r.year === y) || body.years[0]
            setYear(row.year)
            setForm({ annualLimit: moneyText(row.annualLimit), warning: String(body.warningPercentage ?? 70), danger: String(body.dangerPercentage ?? 90) })
            setStatus('ready')
        } catch (err) {
            console.error('Limites do MEI:', err)
            setStatus('error')
        }
    }, [])
    useEffect(() => { load() }, [load])

    const row = data?.years.find((r) => r.year === year)
    const warning = Number(form.warning)
    const danger = Number(form.danger)
    const limitValue = parseMoney(form.annualLimit)

    const pickYear = (r) => {
        setYear(r.year)
        setForm((f) => ({ ...f, annualLimit: moneyText(r.annualLimit) }))
        setError(null)
    }

    const save = async (e) => {
        e.preventDefault()
        setError(null)
        if (limitValue === null || limitValue < 1000 || limitValue > 10000000) {
            return setError({ field: 'limit', text: 'O limite anual fica entre R$ 1.000,00 e R$ 10.000.000,00.' })
        }
        if (!(Number.isInteger(warning) && warning >= 1 && warning <= 99)) {
            return setError({ field: 'pct', text: 'O amarelo começa entre 1% e 99% do limite.' })
        }
        // A segunda porcentagem guardada não é usada pelas telas; só precisa ficar acima do amarelo
        const dangerToSave = Number.isInteger(danger) && danger > warning && danger <= 100 ? danger : Math.min(100, warning + 1)
        setSaving(true)
        try {
            const res = await fetch('/api/admin/limits', {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify({ year, annualLimit: limitValue, warningPercentage: warning, dangerPercentage: dangerToSave }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body.message || 'Não deu para salvar. Tente de novo.')
            showToast(`Limite de ${year} salvo: ${brl(limitValue)}.`, 'success')
            await load(year)
        } catch (err) {
            setError({ text: err.message })
        } finally {
            setSaving(false)
        }
    }

    if (status === 'loading') {
        return <div className="alm adm-light"><div className="alm-state" role="status"><span className="alm-spinner" aria-hidden="true" />Carregando os limites…</div></div>
    }
    if (status === 'error') {
        return (
            <div className="alm adm-light">
                <div className="alm-state alm-state--error" role="alert">
                    <span className="alm-state__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                    <h2>Não deu para carregar os limites</h2>
                    <p>O servidor não respondeu direito. Tente de novo em alguns segundos.</p>
                    <button type="button" className="alm-btn alm-btn--primary" onClick={() => { setStatus('loading'); load() }}>
                        <RotateCw size={16} aria-hidden="true" />Tentar de novo
                    </button>
                </div>
            </div>
        )
    }

    const pctOk = Number.isInteger(warning) && warning >= 1 && warning <= 99
    const changedFromLaw = row && limitValue !== null && Math.round(limitValue * 100) !== Math.round(Number(row.lawLimit) * 100)

    return (
        <div className="alm adm-light">
            <header className="alm-head">
                <h1>Limites do MEI</h1>
                <p>Limite de faturamento de cada ano e as cores de aviso. Os alertas e o Simulador usam o limite do ano em curso e trocam sozinhos em 1º de janeiro.</p>
            </header>

            <section className="alm-years" aria-labelledby="alm-years-t">
                <h2 id="alm-years-t" className="alm-sr">Ano</h2>
                <div role="radiogroup" aria-label="Ano" className="alm-years__list">
                    {data.years.map((r) => (
                        <button
                            key={r.year}
                            type="button"
                            role="radio"
                            aria-checked={r.year === year}
                            className={`alm-year ${r.year === year ? 'is-on' : ''}`}
                            onClick={() => pickYear(r)}
                        >
                            <span className="alm-year__top">
                                <strong>{r.year}</strong>
                                {r.year === data.year && <span className="alm-year__now">Ano atual</span>}
                            </span>
                            <span className="alm-year__value">{brl(r.annualLimit)}</span>
                            <span className="alm-year__src">{r.source === 'lei' ? 'Valor da lei' : 'Definido aqui'}</span>
                        </button>
                    ))}
                </div>
            </section>

            <form className="alm-card" onSubmit={save} noValidate>
                <div className="alm-block">
                    <h2>Limite anual de {year}</h2>
                    <p className="alm-muted">
                        Pela LC 238/2026: R$ 81 mil até 2026, R$ 110 mil em 2027 e R$ 140 mil a partir de 2028 (este depende do orçamento).
                    </p>
                    <div className="alm-limit-row">
                        <label className="alm-field">
                            <span>Limite por ano</span>
                            <span className="alm-money">
                                <b aria-hidden="true">R$</b>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={form.annualLimit}
                                    onChange={(e) => setForm({ ...form, annualLimit: e.target.value.replace(/[^\d.,]/g, '') })}
                                    onBlur={() => { const v = parseMoney(form.annualLimit); if (v !== null) setForm((f) => ({ ...f, annualLimit: moneyText(v) })) }}
                                    aria-invalid={error?.field === 'limit' || undefined}
                                    aria-describedby="alm-limit-hint"
                                    disabled={saving}
                                />
                            </span>
                            <small id="alm-limit-hint">
                                {limitValue ? `Dá ${brl(limitValue / 12)} por mês, em média. ` : ''}
                                Valor da lei para {year}: {brl(row?.lawLimit)}.
                            </small>
                        </label>
                        {changedFromLaw && (
                            <button type="button" className="alm-btn" onClick={() => setForm((f) => ({ ...f, annualLimit: moneyText(row.lawLimit) }))} disabled={saving}>
                                <Scale size={16} aria-hidden="true" />Usar o valor da lei
                            </button>
                        )}
                    </div>
                </div>

                <div className="alm-block">
                    <h2>Aviso de atenção no Simulador</h2>
                    <p className="alm-muted">
                        No resultado do Simulador, o faturamento fica amarelo a partir desta porcentagem do limite e vermelho quando passa do limite.
                        Vale para todos os anos. Os alertas de cada pessoa usam a porcentagem que ela escolhe em Alertas.
                    </p>
                    <div className={`alm-bar ${pctOk ? '' : 'is-off'}`} aria-hidden="true">
                        <span className="alm-bar__ok" style={{ width: `${pctOk ? warning * 0.8 : 56}%` }} />
                        <span className="alm-bar__warn" style={{ width: `${pctOk ? (100 - warning) * 0.8 : 24}%` }} />
                        <span className="alm-bar__danger" style={{ width: '20%' }} />
                    </div>
                    <ul className="alm-bands">
                        <li>
                            <span className="alm-dot alm-dot--ok" aria-hidden="true" />
                            <span className="alm-bands__name">Verde: tranquilo</span>
                            <span className="alm-bands__val">abaixo de {pctOk ? warning : '…'}%</span>
                        </li>
                        <li>
                            <span className="alm-dot alm-dot--warn" aria-hidden="true" />
                            <label className="alm-bands__name" htmlFor="alm-warn">Amarelo: perto do limite, a partir de</label>
                            <span className="alm-pct">
                                <input id="alm-warn" type="text" inputMode="numeric" value={form.warning} maxLength={2}
                                    onChange={(e) => setForm({ ...form, warning: e.target.value.replace(/\D/g, '') })}
                                    aria-invalid={error?.field === 'pct' || undefined} disabled={saving} />%
                            </span>
                        </li>
                        <li>
                            <span className="alm-dot alm-dot--danger" aria-hidden="true" />
                            <span className="alm-bands__name">Vermelho: passou do limite</span>
                            <span className="alm-bands__val">acima de 100%</span>
                        </li>
                    </ul>
                </div>

                {error && <p className="alm-note alm-note--error" role="alert">{error.text}</p>}

                <div className="alm-actions">
                    <button type="submit" className="alm-btn alm-btn--primary" disabled={saving}>{saving ? 'Salvando…' : `Salvar limite de ${year}`}</button>
                </div>
            </form>
        </div>
    )
}
