import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { X, ArrowUpDown, ArrowDown } from 'lucide-react'
import Select from './ui/Select'
import { walletOptionGroups } from './ui/WalletDot'
import './TransferModal.css'

// Valor digitado como "1.234,56" (também aceita "1234.56")
const parseMoney = (text) => {
    let s = String(text ?? '').replace(/[R$\s]/g, '')
    if (!s) return NaN
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
    return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '')
const todayBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const MAX_AMOUNT = 100_000_000
const MAX_NOTE = 120
const kindOf = (w) => (w?.account_type === 'PJ' ? 'MEI' : 'Pessoal')

/**
 * Transferir entre carteiras: registra a saída numa carteira e a entrada na outra.
 * onSuccess(resumo) recebe o texto do que foi feito, para a página avisar.
 */
export default function TransferModal({ onClose, onSuccess, wallets }) {
    const list = Array.isArray(wallets) ? wallets : []
    const [form, setForm] = useState(() => ({
        source: list[0] ? String(list[0].id) : '',
        target: '',
        amount: '',
        date: todayBR(),
        note: ''
    }))
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const errorRef = useRef(null)

    const byId = useMemo(() => new Map(list.map(w => [String(w.id), w])), [list])
    const groups = (exclude) => walletOptionGroups(list, { exclude })

    // Carteiras chegaram depois de abrir: escolhe a principal como origem
    useEffect(() => {
        if (!form.source && list[0]) setForm(f => ({ ...f, source: String(list[0].id) }))
    }, [list.length]) // eslint-disable-line react-hooks/exhaustive-deps

    // Esc fecha (a lista de escolha aberta fecha primeiro); rolagem da página travada
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !saving) onClose() }
        window.addEventListener('keydown', onKey)
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
    }, [onClose, saving])

    useEffect(() => {
        if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, [error])

    const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError('') }
    const setSource = (value) => setForm(f => ({ ...f, source: value, target: f.target === value ? '' : f.target }))
    const swap = () => { setForm(f => ({ ...f, source: f.target, target: f.source })); setError('') }

    const source = byId.get(form.source)
    const target = byId.get(form.target)
    const amount = parseMoney(form.amount)
    const amountOk = Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT
    const ready = source && target && amountOk && form.date

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!source) return setError('Escolha de qual carteira o dinheiro sai.')
        if (!target) return setError('Escolha para qual carteira o dinheiro vai.')
        if (source.id === target.id) return setError('Escolha duas carteiras diferentes.')
        if (!Number.isFinite(amount) || amount <= 0) return setError('Informe o valor, por exemplo 1.500,00.')
        if (amount > MAX_AMOUNT) return setError('Esse valor está alto demais. Confira os números.')
        if (!form.date) return setError('Informe a data da transferência.')
        const note = form.note.trim().replace(/\s+/g, ' ')
        if (note.length > MAX_NOTE) return setError(`A descrição pode ter até ${MAX_NOTE} letras.`)

        setSaving(true)
        setError('')
        try {
            const res = await fetch('/api/finance/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({
                    sourceWalletId: source.id,
                    targetWalletId: target.id,
                    amount: Math.round(amount * 100) / 100,
                    date: form.date,
                    description: note
                })
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(body.message || 'Não deu para fazer a transferência. Tente de novo.')
                return
            }
            onSuccess?.(`${brl(amount)} saíram de ${source.name} e entraram em ${target.name}, em ${dateBR(form.date)}.`)
        } catch {
            setError('Sem conexão. A transferência não foi feita; confira a internet e tente de novo.')
        } finally {
            setSaving(false)
        }
    }

    const close = () => { if (!saving) onClose() }

    return (
        <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
            {list.length < 2 ? (
                <div className="cd-box tr-box" role="dialog" aria-modal="true" aria-labelledby="tr-title">
                    <button type="button" className="tr-box__close" onClick={close} aria-label="Fechar"><X size={20} aria-hidden="true" /></button>
                    <h2 id="tr-title" className="cd-title">Transferir entre carteiras</h2>
                    <p className="cd-message">
                        Para transferir, você precisa de pelo menos duas carteiras, por exemplo a do MEI e a pessoal.
                    </p>
                    <div className="cd-actions">
                        <button type="button" className="cd-btn" onClick={close}>Fechar</button>
                        <Link to="/financas/gerenciar-contas" className="cd-btn cd-btn--primary tr-link-btn">Criar carteira</Link>
                    </div>
                </div>
            ) : (
                <form className="cd-box tr-box" role="dialog" aria-modal="true" aria-labelledby="tr-title" onSubmit={handleSubmit} noValidate>
                    <button type="button" className="tr-box__close" onClick={close} aria-label="Fechar" disabled={saving}><X size={20} aria-hidden="true" /></button>
                    <h2 id="tr-title" className="cd-title">Transferir entre carteiras</h2>
                    <p className="cd-message">
                        O Extrato registra a saída numa carteira e a entrada na outra. Transferência não conta no faturamento do MEI.
                    </p>

                    <fieldset className="tr-route" disabled={saving}>
                        <legend className="tr-sr">Carteiras</legend>
                        <div className="tr-route__row">
                            <label className="tr-route__label" htmlFor="tr-source">Sai de</label>
                            <Select
                                id="tr-source"
                                variant="field"
                                value={form.source}
                                onChange={setSource}
                                options={groups('')}
                                placeholder="Escolha a carteira"
                                className="tr-select"
                            />
                            {source && <span className="tr-kind">{kindOf(source)}</span>}
                        </div>

                        <div className="tr-route__mid">
                            <ArrowDown size={18} className="tr-route__arrow" aria-hidden="true" />
                            <button
                                type="button"
                                className="tr-swap"
                                onClick={swap}
                                disabled={!form.target}
                                aria-label="Trocar: o destino vira a origem"
                                title="Trocar origem e destino"
                            >
                                <ArrowUpDown size={18} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="tr-route__row">
                            <label className="tr-route__label" htmlFor="tr-target">Entra em</label>
                            <Select
                                id="tr-target"
                                variant="field"
                                value={form.target}
                                onChange={(v) => set('target', v)}
                                options={groups(form.source)}
                                placeholder="Escolha a carteira"
                                className="tr-select"
                            />
                            {target && <span className="tr-kind">{kindOf(target)}</span>}
                        </div>
                    </fieldset>

                    <label className="tr-field">
                        <span>Valor</span>
                        <div className="tr-money">
                            <b aria-hidden="true">R$</b>
                            <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="0,00"
                                value={form.amount}
                                onChange={(e) => set('amount', e.target.value.replace(/[^\d.,]/g, ''))}
                                onBlur={() => { if (amountOk) set('amount', amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) }}
                                disabled={saving}
                            />
                        </div>
                    </label>

                    <div className="tr-grid">
                        <label className="tr-field">
                            <span>Data</span>
                            <input type="date" value={form.date} max="2100-12-31" onChange={(e) => set('date', e.target.value)} disabled={saving} />
                        </label>
                        <label className="tr-field">
                            <span>Descrição <em>(opcional)</em></span>
                            <input
                                type="text"
                                placeholder="Ex.: retirada do mês"
                                maxLength={MAX_NOTE}
                                value={form.note}
                                onChange={(e) => set('note', e.target.value)}
                                disabled={saving}
                            />
                        </label>
                    </div>

                    {ready && !error && (
                        <p className="tr-summary" aria-live="polite">
                            <strong>{brl(amount)}</strong> sai de <strong>{source.name}</strong> e entra em <strong>{target.name}</strong>
                            {form.date !== todayBR() ? <>, em {dateBR(form.date)}</> : ' hoje'}.
                        </p>
                    )}

                    {error && <p className="tr-alert" role="alert" ref={errorRef}>{error}</p>}

                    <div className="cd-actions">
                        <button type="button" className="cd-btn" onClick={close} disabled={saving}>Cancelar</button>
                        <button type="submit" className="cd-btn cd-btn--primary" disabled={saving}>
                            {saving ? 'Transferindo...' : amountOk ? `Transferir ${brl(amount)}` : 'Transferir'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    )
}
