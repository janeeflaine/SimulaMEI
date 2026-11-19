import { useEffect, useRef, useState } from 'react'
import { FileText, CircleCheck } from 'lucide-react'
import { brl, monthName, todayBR } from './scenes'

// Fatura de exemplo (valores inventados). Mostra o que a leitura com IA faz de verdade:
// categoria sugerida, parcela reconhecida, IOF separado, estorno em verde e "conferir"
// quando a IA tem pouca certeza.
const ITEMS = [
    { desc: 'SUPERMERCADO BOM PRECO', value: 312.45, cat: 'Mercado' },
    { desc: 'POSTO SAO JORGE', value: 180, cat: 'Combustível' },
    { desc: 'LOJA DE MAQUINAS PARC 03/10', value: 129.9, cat: 'Equipamentos', flag: 'Parcela 3 de 10' },
    { desc: 'EMBALAGENS RIO', value: 246.3, cat: 'Embalagens', check: true },
    { desc: 'IOF COMPRA INTERNACIONAL', value: 4.12, cat: 'Tarifas e juros' },
    { desc: 'ESTORNO LOJA CENTRO', value: -59.9, cat: 'Estorno', refund: true }
]
const TOTAL = ITEMS.reduce((s, i) => s + i.value, 0)

const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function InvoiceDemo() {
    const ref = useRef(null)
    const [shown, setShown] = useState(() => (reducedMotion() ? ITEMS.length : 0))
    const [started, setStarted] = useState(false)

    // Começa quando a fatura aparece na tela, uma vez
    useEffect(() => {
        if (reducedMotion()) return
        const el = ref.current
        if (!el || typeof IntersectionObserver === 'undefined') { setShown(ITEMS.length); return }
        const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { setStarted(true); io.disconnect() }
        }, { threshold: 0.35 })
        io.observe(el)
        return () => io.disconnect()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!started || shown >= ITEMS.length) return
        const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 1400 : 520)
        return () => clearTimeout(t)
    }, [started, shown])

    const reading = started && shown === 0
    const finished = shown >= ITEMS.length

    return (
        <div className="lp-inv" ref={ref}>
            <div className={`lp-inv__file ${reading ? 'is-reading' : ''} ${finished ? 'is-done' : ''}`} aria-hidden="true">
                <span className="lp-inv__icon"><FileText size={22} /></span>
                <span className="lp-inv__name">
                    <b>fatura-{monthName(todayBR())}.pdf</b>
                    <small>{finished ? `${ITEMS.length} compras lidas` : reading || started ? 'Lendo a fatura…' : 'Pronta para enviar'}</small>
                </span>
                <span className="lp-inv__bar"><i style={{ width: `${(shown / ITEMS.length) * 100}%` }} /></span>
            </div>

            <ul className="lp-inv__list" aria-label="Compras lidas da fatura de exemplo">
                {ITEMS.map((item, i) => (
                    <li key={item.desc} className={i < shown ? 'is-in' : ''} aria-hidden={i < shown ? undefined : 'true'}>
                        <span className="lp-inv__desc">
                            <b>{item.desc}</b>
                            {item.flag && <small className="lp-inv__flag">{item.flag}, categoria repetida da parcela anterior</small>}
                        </span>
                        <span className={`lp-inv__cat ${item.check ? 'is-check' : ''} ${item.refund ? 'is-refund' : ''}`}>
                            {item.cat}{item.check ? ', conferir' : ''}
                        </span>
                        <b className={`lp-inv__val ${item.refund ? 'is-refund' : ''}`}>
                            {item.refund ? '+ ' : ''}{brl(Math.abs(item.value))}
                        </b>
                    </li>
                ))}
            </ul>

            <div className={`lp-inv__foot ${finished ? 'is-in' : ''}`}>
                <span><CircleCheck size={16} aria-hidden="true" /> Soma das compras igual ao total da fatura: <b>{brl(TOTAL)}</b></span>
                <span className="lp-inv__confirm" aria-hidden="true">Confirmar {ITEMS.length} compras</span>
            </div>
        </div>
    )
}
