import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Wrench, Store } from 'lucide-react'
import './Simulator.css'

const ACTIVITIES = [
    { value: 'comercio', icon: ShoppingBag, title: 'Comércio', text: 'Vende produtos' },
    { value: 'servico', icon: Wrench, title: 'Serviço', text: 'Presta serviços' },
    { value: 'ambos', icon: Store, title: 'Comércio e serviço', text: 'Os dois' }
]
const MAX_REVENUE = 100000000

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const parseMoney = (text) => {
    let s = String(text ?? '').replace(/[R$\s]/g, '')
    if (!s) return NaN
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
    return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

export default function Simulator() {
    const navigate = useNavigate()
    const [form, setForm] = useState({ activityType: 'comercio', revenueType: 'mensal', revenue: '', hasEmployee: false })
    const [info, setInfo] = useState(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    // Valores do DAS do ano (salário mínimo e impostos fixos) para a explicação ao lado
    useEffect(() => {
        let alive = true
        fetch('/api/simulate/info').then(r => (r.ok ? r.json() : null)).then(d => { if (alive) setInfo(d) }).catch(() => {})
        return () => { alive = false }
    }, [])

    const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError('') }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const revenue = parseMoney(form.revenue)
        if (!Number.isFinite(revenue) || revenue <= 0) return setError('Informe quanto o MEI recebe, por exemplo 6.000,00.')
        if (revenue > MAX_REVENUE) return setError('Esse valor está alto demais. Confira os números.')
        setLoading(true)
        setError('')
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({ ...form, revenue: Math.round(revenue * 100) / 100 })
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) { setError(body.message || 'Não deu para simular agora. Tente de novo.'); return }
            sessionStorage.setItem('simulationResult', JSON.stringify(body))
            navigate('/resultado')
        } catch {
            setError('Sem conexão. Confira a internet e tente de novo.')
        } finally {
            setLoading(false)
        }
    }

    const year = info?.year
    const das = info?.das

    return (
        <div className="simulador">
            <div className="sim-wrap">
                <header className="sim-head">
                    <h1 className="sim-title">Simulador do MEI</h1>
                    <p className="sim-sub">Quanto o MEI paga de DAS e quanto do limite do ano o seu faturamento usa.</p>
                </header>

                <div className="sim-grid">
                    <form className="sim-card" onSubmit={handleSubmit} noValidate>
                        <fieldset className="sim-field">
                            <legend>O que o MEI faz</legend>
                            <div className="sim-options" role="radiogroup">
                                {ACTIVITIES.map(({ value, icon: Icon, title, text }) => (
                                    <label key={value} className={`sim-option ${form.activityType === value ? 'is-on' : ''}`}>
                                        <input type="radio" name="activityType" value={value} checked={form.activityType === value} onChange={() => set('activityType', value)} />
                                        <span className="sim-option__icon" aria-hidden="true"><Icon size={20} /></span>
                                        <strong>{title}</strong>
                                        <span>{text}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <div className="sim-field">
                            <span className="sim-field__row">
                                <label htmlFor="sim-revenue">Quanto o MEI recebe</label>
                                <span className="sim-seg" role="radiogroup" aria-label="Período do valor">
                                    {[['mensal', 'Por mês'], ['anual', 'Por ano']].map(([v, l]) => (
                                        <button key={v} type="button" role="radio" aria-checked={form.revenueType === v} className={form.revenueType === v ? 'is-on' : ''} onClick={() => set('revenueType', v)}>{l}</button>
                                    ))}
                                </span>
                            </span>
                            <span className="sim-money">
                                <b aria-hidden="true">R$</b>
                                <input
                                    id="sim-revenue"
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    placeholder="0,00"
                                    value={form.revenue}
                                    onChange={(e) => set('revenue', e.target.value.replace(/[^\d.,]/g, ''))}
                                />
                            </span>
                            <small>{form.revenueType === 'mensal' ? 'A média do que entra por mês, antes das despesas.' : 'O total que entrou ou deve entrar no ano, antes das despesas.'}</small>
                        </div>

                        <div className="sim-field">
                            <label className="sim-switch">
                                <input type="checkbox" checked={form.hasEmployee} onChange={(e) => set('hasEmployee', e.target.checked)} />
                                <span className="sim-switch__track" aria-hidden="true"><span /></span>
                                <span>Tenho funcionário registrado</span>
                            </label>
                            <small>Em 2026 o MEI pode ter 1 funcionário; a partir de 2027, até 2 (LC 238/2026).</small>
                        </div>

                        {error && <p className="sim-alert" role="alert">{error}</p>}

                        <button type="submit" className="sim-btn" disabled={loading}>{loading ? 'Calculando...' : 'Calcular'}</button>
                    </form>

                    <aside className="sim-aside" aria-labelledby="sim-how">
                        <h2 id="sim-how" className="sim-aside__title">Como o DAS{year ? ` de ${year}` : ''} é calculado</h2>
                        <p>O valor é o mesmo todo mês, com faturamento alto ou baixo, e vence no dia 20.</p>
                        {das ? (
                            <dl className="sim-das">
                                <div><dt>INSS: 5% do salário mínimo ({brl(das.minimumWage)})</dt><dd>{brl(das.inss)}</dd></div>
                                <div><dt>ICMS, se vende produtos</dt><dd>{brl(das.icms)}</dd></div>
                                <div><dt>ISS, se presta serviços</dt><dd>{brl(das.iss)}</dd></div>
                                <div className="is-total"><dt>Comércio</dt><dd>{brl(das.comercio)}</dd></div>
                                <div className="is-total"><dt>Serviço</dt><dd>{brl(das.servico)}</dd></div>
                                <div className="is-total"><dt>Comércio e serviço</dt><dd>{brl(das.ambos)}</dd></div>
                            </dl>
                        ) : (
                            <div className="sim-das sim-das--loading" aria-hidden="true" />
                        )}
                        <p className="sim-note">Estimativa com as regras atuais. Não substitui a orientação de um contador.</p>
                    </aside>
                </div>
            </div>
        </div>
    )
}
