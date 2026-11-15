import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RotateCw, Scale, Info } from 'lucide-react'
import { showToast } from '../../utils/toast'
// AdminPages.css segue importado: as outras páginas do admin ainda usam as classes dele
import './AdminPages.css'
import './AdminRules.css'

// Mesmas contas do servidor (server/logic/meiTax.js), só para mostrar antes de salvar
const EMPLOYEE_CHARGES = 0.11 // 8% FGTS + 3% INSS
const cents = (v) => Math.round(v * 100) / 100
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const moneyText = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
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
const isValid = (d) => d && d.effective && typeof d.effective.year === 'number' && Number.isFinite(Number(d.effective.lawMinimumWage))

function MoneyField({ id, label, value, onChange, hint, invalid, disabled, placeholder }) {
    return (
        <label className="arl-field" htmlFor={id}>
            <span>{label}</span>
            <span className="arl-money">
                <b aria-hidden="true">R$</b>
                <input id={id} type="text" inputMode="decimal" value={value} placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
                    onBlur={() => { const v = parseMoney(value); if (v !== null) onChange(moneyText(v)) }}
                    aria-invalid={invalid || undefined} disabled={disabled} />
            </span>
            {hint && <small>{hint}</small>}
        </label>
    )
}

export default function AdminRules() {
    const [data, setData] = useState(null)
    const [status, setStatus] = useState('loading')
    const [form, setForm] = useState({ inss: '5', icms: '1,00', iss: '5,00', wage: '' })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/rules', { headers: authHeaders() })
            const body = await res.json().catch(() => null)
            if (!res.ok || !isValid(body)) throw new Error('resposta inesperada')
            setData(body)
            setForm({
                inss: String(Number(body.inssPercentage ?? 5)).replace('.', ','),
                icms: moneyText(body.icmsValue ?? 1),
                iss: moneyText(body.issValue ?? 5),
                wage: body.minimumWage != null ? moneyText(body.minimumWage) : '',
            })
            setStatus('ready')
        } catch (err) {
            console.error('Regras de cálculo:', err)
            setStatus('error')
        }
    }, [])
    useEffect(() => { load() }, [load])

    if (status === 'loading') {
        return <div className="arl adm-light"><div className="arl-state" role="status"><span className="arl-spinner" aria-hidden="true" />Carregando as regras…</div></div>
    }
    if (status === 'error') {
        return (
            <div className="arl adm-light">
                <div className="arl-state arl-state--error" role="alert">
                    <span className="arl-state__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                    <h2>Não deu para carregar as regras</h2>
                    <p>O servidor não respondeu direito. Tente de novo em alguns segundos.</p>
                    <button type="button" className="arl-btn arl-btn--primary" onClick={() => { setStatus('loading'); load() }}>
                        <RotateCw size={16} aria-hidden="true" />Tentar de novo
                    </button>
                </div>
            </div>
        )
    }

    const year = data.effective.year
    const law = Number(data.effective.lawMinimumWage)
    const inss = String(form.inss).trim() === '' ? NaN : Number(String(form.inss).replace(',', '.'))
    const icms = parseMoney(form.icms)
    const iss = parseMoney(form.iss)
    const typedWage = parseMoney(form.wage)
    // O site usa o maior entre o salário gravado e o da lei
    const wage = Math.max(typedWage || 0, law)
    const wageBelowLaw = typedWage !== null && typedWage < law
    const ok = Number.isFinite(inss) && icms !== null && iss !== null
    const inssValue = ok ? cents(wage * inss / 100) : null

    const save = async (e) => {
        e.preventDefault()
        setError(null)
        if (!(Number.isFinite(inss) && inss >= 0 && inss <= 100)) return setError({ field: 'inss', text: 'O percentual do INSS fica entre 0 e 100.' })
        if (icms === null || icms > 1000) return setError({ field: 'icms', text: 'O ICMS fica entre R$ 0,00 e R$ 1.000,00.' })
        if (iss === null || iss > 1000) return setError({ field: 'iss', text: 'O ISS fica entre R$ 0,00 e R$ 1.000,00.' })
        if (typedWage !== null && (typedWage < 500 || typedWage > 100000)) return setError({ field: 'wage', text: 'O salário mínimo fica entre R$ 500,00 e R$ 100.000,00, ou vazio para usar o da lei.' })
        setSaving(true)
        try {
            const res = await fetch('/api/admin/rules', {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify({ inssPercentage: inss, icmsValue: icms, issValue: iss, minimumWage: typedWage }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body.message || 'Não deu para salvar. Tente de novo.')
            showToast('Regras salvas. As próximas simulações já usam os valores novos.', 'success')
            await load()
        } catch (err) {
            setError({ text: err.message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="arl adm-light">
            <header className="arl-head">
                <h1>Regras de cálculo</h1>
                <p>Valores do DAS e do custo do funcionário usados pelo Simulador.</p>
            </header>

            <p className="arl-info"><Info size={18} aria-hidden="true" />Valem para as próximas simulações. As que já foram feitas ficam com os valores da época.</p>

            <div className="arl-grid">
                <form className="arl-card" onSubmit={save} noValidate>
                    <h2>Valores</h2>
                    <div className="arl-fields">
                        <label className="arl-field" htmlFor="arl-inss">
                            <span>INSS do DAS</span>
                            <span className="arl-pct">
                                <input id="arl-inss" type="text" inputMode="decimal" value={form.inss} maxLength={5}
                                    onChange={(e) => setForm({ ...form, inss: e.target.value.replace(/[^\d,]/g, '') })}
                                    aria-invalid={error?.field === 'inss' || undefined} disabled={saving} />
                                <b>% do salário mínimo</b>
                            </span>
                            <small>Hoje a lei manda 5%.</small>
                        </label>
                        <MoneyField id="arl-icms" label="ICMS (comércio e indústria)" value={form.icms} onChange={(v) => setForm({ ...form, icms: v })}
                            hint="Hoje R$ 1,00 por mês." invalid={error?.field === 'icms'} disabled={saving} />
                        <MoneyField id="arl-iss" label="ISS (serviços)" value={form.iss} onChange={(v) => setForm({ ...form, iss: v })}
                            hint="Hoje R$ 5,00 por mês." invalid={error?.field === 'iss'} disabled={saving} />
                        <div className="arl-wage">
                            <MoneyField id="arl-wage" label={`Salário mínimo de ${year}`} value={form.wage} placeholder={moneyText(law)}
                                onChange={(v) => setForm({ ...form, wage: v })} invalid={error?.field === 'wage'} disabled={saving}
                                hint={`Vazio: vale o da lei (${brl(law)}). Todo janeiro, grave o valor novo aqui se a lei ainda não estiver no sistema.`} />
                            {form.wage && (
                                <button type="button" className="arl-btn" onClick={() => setForm({ ...form, wage: '' })} disabled={saving}>
                                    <Scale size={16} aria-hidden="true" />Usar o da lei
                                </button>
                            )}
                        </div>
                    </div>
                    {wageBelowLaw && (
                        <p className="arl-note arl-note--warn">Esse valor é menor que o da lei ({brl(law)}). O site usa sempre o maior dos dois, então o cálculo continua com {brl(law)}.</p>
                    )}
                    {error && <p className="arl-note arl-note--error" role="alert">{error.text}</p>}
                    <div className="arl-actions">
                        <button type="button" className="arl-btn" onClick={load} disabled={saving}>Desfazer</button>
                        <button type="submit" className="arl-btn arl-btn--primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar regras'}</button>
                    </div>
                </form>

                <aside className="arl-preview" aria-labelledby="arl-prev-t" aria-live="polite">
                    <h2 id="arl-prev-t">Como fica em {year}</h2>
                    <p className="arl-preview__sub">Com os valores da tela, sobre o salário mínimo de {brl(wage)}.</p>
                    {ok ? (
                        <>
                            <dl className="arl-das">
                                <div><dt>DAS do comércio</dt><dd>{brl(inssValue + icms)}</dd></div>
                                <div><dt>DAS de serviços</dt><dd>{brl(inssValue + iss)}</dd></div>
                                <div><dt>DAS de comércio e serviços</dt><dd>{brl(inssValue + icms + iss)}</dd></div>
                            </dl>
                            <dl className="arl-parts">
                                <div><dt>INSS ({String(inss).replace('.', ',')}%)</dt><dd>{brl(inssValue)}</dd></div>
                                <div><dt>Custo de um funcionário</dt><dd>{brl(cents(wage * (1 + EMPLOYEE_CHARGES)))}</dd></div>
                            </dl>
                            <p className="arl-preview__note">Funcionário: salário mínimo + 8% de FGTS + 3% de INSS.</p>
                        </>
                    ) : (
                        <p className="arl-preview__sub">Complete os valores para ver o cálculo.</p>
                    )}
                </aside>
            </div>
        </div>
    )
}
