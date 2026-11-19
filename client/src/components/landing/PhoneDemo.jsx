import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Mic, Camera, SendHorizontal, CheckCheck, CircleCheck, ListChecks, Pause, Play,
    MessageSquareText, Receipt, CalendarClock, ChartColumn, FileText, Building2, User
} from 'lucide-react'
import BrandMark from '../ui/BrandMark'
import { buildScenes, brl, ddmm, todayBR } from './scenes'

const CHIP_ICONS = { texto: MessageSquareText, audio: Mic, boleto: Camera, contas: CalendarClock, resumo: ChartColumn }

const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const clockNow = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

// Lançamentos que já estavam no Extrato de exemplo
const BASE_ROWS = [
    { title: 'Venda no cartão', meta: 'Ontem, Crédito', wallet: 'MEI', value: 340, type: 'in' },
    { title: 'Mercado', meta: 'Ontem, PIX', wallet: 'Pessoal', value: 212.6, type: 'out' },
    { title: 'Embalagens', meta: 'Há 2 dias, Boleto', wallet: 'MEI', value: 96, type: 'out' }
]

/**
 * Celular com a conversa do assistente do WhatsApp e, ao lado, o que aparece no
 * site depois dela. Toca sozinho, uma cena depois da outra, só enquanto está na
 * tela; tem pausa. Com "reduzir movimento" do aparelho, mostra cada cena pronta.
 *
 * planNote(featureKey): texto do plano que libera o recurso (ou null).
 */
export default function PhoneDemo({ dasValue, planNote }) {
    const scenes = useMemo(() => buildScenes({ dasValue }), [dasValue])
    const [index, setIndex] = useState(0)
    const [autoplay, setAutoplay] = useState(() => !reducedMotion())
    const [paused, setPaused] = useState(false)
    const [log, setLog] = useState([])
    const [draft, setDraft] = useState('')
    const [rec, setRec] = useState(null)
    const [typing, setTyping] = useState(false)
    const [done, setDone] = useState(false)
    const [run, setRun] = useState(0)

    const rootRef = useRef(null)
    const visibleRef = useRef(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    const autoplayRef = useRef(autoplay)
    autoplayRef.current = autoplay

    // Só anda enquanto o celular está na tela e a aba está aberta
    useEffect(() => {
        const el = rootRef.current
        if (!el || typeof IntersectionObserver === 'undefined') { visibleRef.current = true; return }
        const io = new IntersectionObserver(([entry]) => { visibleRef.current = entry.isIntersecting }, { threshold: 0.25 })
        io.observe(el)
        return () => io.disconnect()
    }, [])

    useEffect(() => {
        const scene = scenes[index]
        const instant = reducedMotion()
        let cancelled = false
        let nextId = 0
        const time = clockNow()

        // Espera "ms" contando só o tempo em que a animação pode andar
        const sleep = (ms) => new Promise((resolve, reject) => {
            if (instant) return resolve()
            let left = ms
            const tick = () => {
                if (cancelled) return reject(new Error('cancelled'))
                const active = visibleRef.current && !pausedRef.current && !document.hidden
                if (active) left -= 50
                if (left <= 0) return resolve()
                setTimeout(tick, 50)
            }
            setTimeout(tick, 50)
        })
        const push = (item) => setLog(l => [...l, { id: ++nextId, time, ...item }].slice(-8))

        setLog([]); setDraft(''); setRec(null); setTyping(false); setDone(false)

        ;(async () => {
            let typed = ''
            await sleep(500)
            for (const step of scene.steps) {
                if (step.t === 'type') {
                    typed = step.text
                    if (instant) setDraft(typed)
                    else for (let i = 1; i <= typed.length; i++) { setDraft(typed.slice(0, i)); await sleep(55) }
                    await sleep(350)
                } else if (step.t === 'send') {
                    push({ from: 'me', kind: 'text', text: typed })
                    setDraft('')
                    await sleep(450)
                } else if (step.t === 'record') {
                    for (let s = 0; s <= step.secs; s++) { setRec(s); await sleep(420) }
                    setRec(null)
                    push({ from: 'me', kind: 'audio', secs: step.secs, transcript: step.transcript })
                    await sleep(500)
                } else if (step.t === 'photo') {
                    push({ from: 'me', kind: 'photo' })
                    await sleep(500)
                } else if (step.t === 'typing') {
                    setTyping(true); await sleep(step.ms); setTyping(false)
                } else if (step.t === 'bot') {
                    push({ from: 'bot', kind: 'bot', msg: step.msg })
                    await sleep(1100 + ((step.msg.lines?.length || step.msg.bills?.length || 2) * 260))
                } else if (step.t === 'tap') {
                    setLog(l => {
                        const copy = [...l]
                        for (let i = copy.length - 1; i >= 0; i--) {
                            if (copy[i].from === 'bot') { copy[i] = { ...copy[i], tapped: step.label }; break }
                        }
                        return copy
                    })
                    await sleep(500)
                    push({ from: 'me', kind: 'reply', text: step.label })
                    await sleep(350)
                } else if (step.t === 'result') {
                    setDone(true)
                }
            }
            await sleep(3800)
            if (!instant && autoplayRef.current) setIndex(i => (i + 1) % scenes.length)
        })().catch(() => {})

        return () => { cancelled = true }
    }, [index, run, scenes])

    const choose = useCallback((i) => {
        setAutoplay(false)
        setPaused(false)
        if (i === index) setRun(r => r + 1)
        else setIndex(i)
    }, [index])

    const togglePause = () => {
        if (!autoplay && !paused) { setPaused(true); return }
        if (paused) { setPaused(false); if (!reducedMotion()) setAutoplay(true); return }
        setPaused(true)
    }

    const scene = scenes[index]
    const note = planNote?.(scene.feature)

    return (
        <div className="lp-demo" ref={rootRef}>
            <div className="lp-demo__chips" role="group" aria-label="Exemplos de conversa">
                {scenes.map((s, i) => {
                    const Icon = CHIP_ICONS[s.id]
                    return (
                        <button
                            key={s.id}
                            type="button"
                            className={`lp-chip ${i === index ? 'is-on' : ''}`}
                            aria-pressed={i === index}
                            onClick={() => choose(i)}
                        >
                            <Icon size={16} aria-hidden="true" /> {s.chip}
                        </button>
                    )
                })}
                <button
                    type="button"
                    className="lp-chip lp-chip--icon"
                    onClick={togglePause}
                    aria-label={paused ? 'Continuar a animação' : 'Pausar a animação'}
                >
                    {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
                </button>
            </div>

            <div className="lp-demo__stage">
                <div className="lp-phone" aria-hidden="true">
                    <div className="lp-phone__screen">
                        <div className="lp-chat__head">
                            <span className="lp-chat__avatar"><BrandMark size={18} /></span>
                            <span className="lp-chat__who">
                                <strong>EuSempreMEI</strong>
                                <small>{typing ? 'digitando…' : 'assistente'}</small>
                            </span>
                        </div>

                        <div className="lp-chat__body">
                            <span className="lp-day">Hoje</span>
                            {log.map(item => <Bubble key={`${index}-${run}-${item.id}`} item={item} />)}
                            {typing && <div className="lp-msg lp-msg--bot lp-typing"><i /><i /><i /></div>}
                        </div>

                        <div className="lp-chat__input">
                            <span className={`lp-chat__field ${draft ? 'has-text' : ''} ${rec != null ? 'is-rec' : ''}`}>
                                {rec != null
                                    ? <><b className="lp-rec-dot" /> 0:{String(rec).padStart(2, '0')} <span className="lp-wave lp-wave--live">{WAVE}</span></>
                                    : draft || 'Mensagem'}
                                {!draft && rec == null && <Camera size={18} className="lp-chat__cam" />}
                            </span>
                            <span className={`lp-chat__send ${rec != null ? 'is-rec' : ''}`}>
                                {draft ? <SendHorizontal size={18} /> : <Mic size={18} />}
                            </span>
                        </div>
                    </div>
                </div>

                <SitePanel scene={scene} done={done} />
            </div>

            <p className="lp-demo__caption" aria-live="polite">
                <span>{scene.caption}</span>
                {note && <span className="lp-plan-note">{note}</span>}
            </p>
        </div>
    )
}

const WAVE = Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--h': `${30 + ((i * 37) % 70)}%` }} />)

function Bubble({ item }) {
    if (item.from === 'me') {
        return (
            <div className="lp-msg lp-msg--me">
                {item.kind === 'text' && <span>{item.text}</span>}
                {item.kind === 'reply' && <span className="lp-msg__reply">{item.text}</span>}
                {item.kind === 'audio' && (
                    <span className="lp-audio">
                        <Play size={16} className="lp-audio__play" />
                        <span className="lp-wave">{WAVE}</span>
                        <small>0:{String(item.secs).padStart(2, '0')}</small>
                    </span>
                )}
                {item.kind === 'audio' && <em className="lp-msg__transcript">“{item.transcript}”</em>}
                {item.kind === 'photo' && (
                    <span className="lp-photo">
                        <span className="lp-photo__doc">
                            <Receipt size={16} />
                            <span><b>Energia Elétrica</b><i /><i /><i className="is-short" /></span>
                            <span className="lp-photo__code" />
                        </span>
                    </span>
                )}
                <small className="lp-msg__time">{item.time} <CheckCheck size={14} /></small>
            </div>
        )
    }

    const { msg } = item
    return (
        <div className="lp-msg lp-msg--bot">
            <div className="lp-msg__card">
                {msg.done && <p className="lp-msg__done"><CircleCheck size={16} /> {msg.done}</p>}
                {msg.before && <p className="lp-msg__strong">{msg.before}</p>}
                {msg.lines && (
                    <dl className="lp-msg__lines">
                        {msg.lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                    </dl>
                )}
                {msg.bills && (
                    <ul className="lp-msg__bills">
                        {msg.bills.map(b => (
                            <li key={b.label}><i className={`is-${b.dot}`} /> {b.when} {b.label}: <b>{b.value}</b></li>
                        ))}
                    </ul>
                )}
                {msg.groups && msg.groups.map(g => (
                    <div key={g.name} className="lp-msg__group">
                        <p className="lp-msg__strong">{g.name}</p>
                        <dl className="lp-msg__lines">
                            {g.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                        </dl>
                    </div>
                ))}
                {msg.after && <p className="lp-msg__after">{msg.after}</p>}
                <small className="lp-msg__time">{item.time}</small>
            </div>
            {msg.buttons && (
                <div className="lp-msg__buttons">
                    {msg.buttons.map(b => <span key={b} className={item.tapped === b ? 'is-tapped' : ''}>{b}</span>)}
                </div>
            )}
            {msg.list && <div className="lp-msg__buttons"><span><ListChecks size={15} /> {msg.list}</span></div>}
        </div>
    )
}

function WalletTag({ wallet }) {
    const Icon = wallet === 'MEI' ? Building2 : User
    return <span className={`lp-wtag ${wallet === 'MEI' ? 'is-mei' : ''}`}><Icon size={12} aria-hidden="true" /> {wallet}</span>
}

/** O que a pessoa vê no site depois da conversa */
function SitePanel({ scene, done }) {
    const r = scene.result
    if (r.kind === 'extrato') {
        const rows = done ? [{ ...r.row, isNew: true }, ...BASE_ROWS] : BASE_ROWS
        return (
            <div className="lp-panel" aria-hidden="true">
                <p className="lp-panel__title"><FileText size={16} /> Extrato</p>
                <ul className="lp-panel__rows">
                    {rows.map(row => (
                        <li key={row.title} className={row.isNew ? 'is-new' : ''}>
                            <span className="lp-panel__main">
                                <b>{row.title}</b>
                                <small>{row.meta}</small>
                            </span>
                            <span className="lp-panel__side">
                                <b className={row.type === 'in' ? 'is-in' : 'is-out'}>{row.type === 'in' ? '+ ' : '– '}{brl(row.value)}</b>
                                <WalletTag wallet={row.wallet} />
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        )
    }

    if (r.kind === 'contas') {
        const today = todayBR()
        const bills = r.bills.filter(b => done || !b.isNew).map(b => ({ ...b, paid: done && b.paid }))
        return (
            <div className="lp-panel" aria-hidden="true">
                <p className="lp-panel__title"><CalendarClock size={16} /> Contas a pagar</p>
                <ul className="lp-panel__rows">
                    {bills.map(b => {
                        const days = Math.round((b.due - today) / 86400000)
                        return (
                            <li key={b.label} className={`${b.isNew && done ? 'is-new' : ''} ${b.paid ? 'is-paid' : ''}`}>
                                <span className="lp-panel__main">
                                    <b>{b.label}</b>
                                    <small>Vence {ddmm(b.due)}</small>
                                </span>
                                <span className="lp-panel__side">
                                    <b>{brl(b.value)}</b>
                                    {b.paid
                                        ? <span className="lp-tag lp-tag--ok">Paga</span>
                                        : <span className="lp-tag lp-tag--warn">{days === 0 ? 'Vence hoje' : days === 1 ? 'Amanhã' : `Em ${days} dias`}</span>}
                                </span>
                            </li>
                        )
                    })}
                </ul>
                <p className="lp-panel__foot">Lembrete no WhatsApp às 8h do dia do vencimento.</p>
            </div>
        )
    }

    return (
        <div className={`lp-panel ${done ? 'is-lit' : ''}`} aria-hidden="true">
            <p className="lp-panel__title"><ChartColumn size={16} /> Painel de {r.month}</p>
            <div className="lp-panel__stats">
                <span><small>Entrou no MEI</small><b className="is-in">{brl(r.in)}</b></span>
                <span><small>Saiu do MEI</small><b className="is-out">{brl(r.out)}</b></span>
                <span className="is-wide"><small>Resultado do MEI</small><b>{brl(r.in - r.out)}</b><span className="lp-tag lp-tag--ok">Positivo</span></span>
            </div>
            <div className="lp-panel__bars">
                {[38, 52, 44, 61, 57, 72, 66, 80, 74, 88, 92, 70].map((h, i) => {
                    const month = todayBR().getMonth()
                    return <i key={i} style={{ height: i > month ? '6%' : `${h}%` }} className={i === month ? 'is-on' : i > month ? 'is-future' : ''} />
                })}
            </div>
        </div>
    )
}
