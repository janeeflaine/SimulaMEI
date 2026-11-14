import { useState, useEffect } from 'react'
import './AdminPages.css'

// Limite do MEI por ano (LC 238/2026: 81 mil até 2026, 110 mil em 2027, 140 mil a partir de 2028)
const brl = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)

export default function AdminLimits() {
    const [data, setData] = useState(null)
    const [year, setYear] = useState(null)
    const [form, setForm] = useState({ annualLimit: '', warningPercentage: 70, dangerPercentage: 90 })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState(null) // { ok, text }

    const token = localStorage.getItem('token')

    const fetchLimits = async (keepYear) => {
        try {
            const res = await fetch('/api/admin/limits', { headers: { 'Authorization': `Bearer ${token}` } })
            if (!res.ok) throw new Error()
            const body = await res.json()
            setData(body)
            const y = keepYear || body.year
            const row = body.years?.find(r => r.year === y)
            setYear(y)
            setForm({ annualLimit: row ? row.annualLimit : body.annualLimit, warningPercentage: body.warningPercentage, dangerPercentage: body.dangerPercentage })
        } catch {
            setStatus({ ok: false, text: 'Não deu para carregar os limites. Atualize a página.' })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchLimits() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const pickYear = (y) => {
        const row = data.years.find(r => r.year === y)
        setYear(y)
        setForm(f => ({ ...f, annualLimit: row.annualLimit }))
        setStatus(null)
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm(prev => ({ ...prev, [name]: value }))
        setStatus(null)
    }

    const handleSave = async () => {
        setSaving(true)
        setStatus(null)
        try {
            const res = await fetch('/api/admin/limits', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    year,
                    annualLimit: Number(form.annualLimit),
                    warningPercentage: Number(form.warningPercentage),
                    dangerPercentage: Number(form.dangerPercentage)
                })
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                setStatus({ ok: false, text: body.message || 'Não deu para salvar. Tente de novo.' })
                return
            }
            setStatus({ ok: true, text: `Limite de ${year} salvo: ${brl(form.annualLimit)}.` })
            fetchLimits(year)
        } catch {
            setStatus({ ok: false, text: 'Sem conexão. Nada foi salvo.' })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
                <div className="loader"></div>
            </div>
        )
    }
    if (!data) {
        return (
            <div className="admin-page">
                <p role="alert" style={{ color: '#fca5a5' }}>{status?.text}</p>
            </div>
        )
    }

    const row = data.years.find(r => r.year === year)
    const chip = (active) => ({
        padding: '10px 14px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', minWidth: '130px',
        border: `1.5px solid ${active ? '#93c5fd' : 'rgba(255,255,255,0.08)'}`,
        background: active ? 'rgba(147,197,253,0.12)' : 'rgba(255,255,255,0.02)', color: '#e2e8f0'
    })

    return (
        <div className="admin-page">
            <div className="page-header">
                <h1>Limites do MEI</h1>
                <p className="text-secondary">Limite de faturamento de cada ano e as faixas de aviso do Simulador</p>
            </div>

            <div className="admin-card">
                <h2>Limite de faturamento por ano</h2>
                <p className="text-secondary mb-4">
                    Pela LC 238/2026: R$ 81 mil até 2026, R$ 110 mil em 2027 e R$ 140 mil a partir de 2028 (este depende do orçamento).
                    Os alertas e o Simulador usam o limite do ano em curso e trocam sozinhos em 1º de janeiro.
                </p>

                <div role="radiogroup" aria-label="Ano" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: 'var(--spacing-6)' }}>
                    {data.years.map(r => (
                        <button key={r.year} type="button" role="radio" aria-checked={r.year === year} onClick={() => pickYear(r.year)} style={chip(r.year === year)}>
                            <strong style={{ display: 'block', fontSize: '0.95rem' }}>
                                {r.year}{r.year === data.year ? ' (atual)' : ''}
                            </strong>
                            <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)' }}>
                                {brl(r.annualLimit)} · {r.source === 'lei' ? 'da lei' : 'definido aqui'}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--spacing-6)' }}>
                    <label className="form-label" htmlFor="lim-annual">Limite anual de {year} (R$)</label>
                    <input
                        id="lim-annual"
                        type="number"
                        name="annualLimit"
                        value={form.annualLimit}
                        onChange={handleChange}
                        className="form-input"
                        style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold' }}
                        step="1000"
                        min="1000"
                    />
                    <span className="form-hint">
                        {row && row.source === 'lei'
                            ? `Valor da lei para ${year}. Só mude se a lei mudar.`
                            : `Valor da lei para ${year}: ${brl(row?.lawLimit)}.`}
                    </span>
                </div>

                <h2>Faixas de aviso do Simulador</h2>
                <p className="text-secondary mb-4">
                    Cores do resultado da simulação, em porcentagem do limite. Valem para todos os anos.
                </p>

                <div className="form-row">
                    <div className="form-row-label">
                        <span className="badge badge-success">Verde</span>
                        <span style={{ marginLeft: 'var(--spacing-2)' }}>Faturamento saudável</span>
                    </div>
                    <div className="form-row-value">
                        <span>0% até {form.warningPercentage}%</span>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-row-label">
                        <span className="badge badge-warning">Amarelo</span>
                        <span style={{ marginLeft: 'var(--spacing-2)' }}>Atenção ao limite</span>
                    </div>
                    <div className="form-row-value">
                        <input type="number" name="warningPercentage" aria-label="Começo do amarelo (%)" value={form.warningPercentage} onChange={handleChange} className="form-input" style={{ width: '80px' }} min="1" max="99" />
                        <span>% até {form.dangerPercentage}%</span>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-row-label">
                        <span className="badge badge-danger">Vermelho</span>
                        <span style={{ marginLeft: 'var(--spacing-2)' }}>Limite em risco</span>
                    </div>
                    <div className="form-row-value">
                        <input type="number" name="dangerPercentage" aria-label="Começo do vermelho (%)" value={form.dangerPercentage} onChange={handleChange} className="form-input" style={{ width: '80px' }} min="2" max="100" />
                        <span>% ou mais</span>
                    </div>
                </div>

                <div className="modal-actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    {status && (
                        <span role="status" style={{ fontSize: '0.85rem', color: status.ok ? '#6ee7b7' : '#fca5a5' }}>{status.text}</span>
                    )}
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Salvando...' : `Salvar limite de ${year}`}
                    </button>
                </div>
            </div>
        </div>
    )
}
