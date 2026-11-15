import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, ChevronDown, ArrowUp } from 'lucide-react'
import './LegalDoc.css'

/**
 * Moldura das páginas legais (Privacidade, Termos, Exclusão de dados).
 * Prefixo .lgl- dentro de .legal-doc.
 *
 * props:
 *  - title, intro, updated (texto da data)
 *  - summary: { title, items: [{ icon: Componente, title, text }], note }
 *  - entity: nó com a identificação de quem responde pelo documento (opcional)
 *  - sections: [{ id, title, content }] — numeradas na ordem
 *  - related: [{ to, icon: Componente, title, text }]
 */

function prefersReducedMotion() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
        return false
    }
}

export default function LegalDoc({ title, intro, updated, summary, entity, sections, related = [] }) {
    const location = useLocation()
    const [active, setActive] = useState(sections[0]?.id)
    const [tocOpen, setTocOpen] = useState(false)
    const headingRefs = useRef({})

    // Ao abrir: vai para a parte do endereço (#...) ou para o topo
    useEffect(() => {
        const id = decodeURIComponent((location.hash || '').slice(1))
        if (!id || !document.getElementById(id)) {
            window.scrollTo(0, 0)
            return
        }
        // Repete depois que a fonte carrega: o texto muda de altura e a parte sai do lugar
        const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' })
        go()
        setActive(id)
        let cancelled = false
        document.fonts?.ready?.then(() => { if (!cancelled) go() })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname])

    // Marca no índice a parte que está na tela
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return undefined
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                if (visible[0]) setActive(visible[0].target.id)
            },
            { rootMargin: '-96px 0px -65% 0px' }
        )
        sections.forEach((s) => {
            const el = document.getElementById(s.id)
            if (el) observer.observe(el)
        })
        return () => observer.disconnect()
    }, [sections])

    const goTo = (e, id) => {
        e.preventDefault()
        const el = document.getElementById(id)
        if (!el) return
        // No celular o índice fica acima do texto: fecha antes de rolar, senão passa do ponto
        if (tocOpen) flushSync(() => setTocOpen(false))
        el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
        try {
            window.history.replaceState(null, '', `#${id}`)
        } catch {
            /* sem histórico: segue */
        }
        setActive(id)
        const h = headingRefs.current[id]
        if (h) h.focus({ preventScroll: true })
    }

    const toTop = () => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
        try {
            window.history.replaceState(null, '', location.pathname)
        } catch {
            /* segue */
        }
    }

    return (
        <div className="legal-doc">
            <div className="lgl-wrap">
                <header className="lgl-head">
                    <h1>{title}</h1>
                    {intro && <p>{intro}</p>}
                    {updated && (
                        <p className="lgl-updated">
                            <CalendarDays size={16} aria-hidden="true" />
                            Atualizada em {updated}
                        </p>
                    )}
                </header>

                {summary && (
                    <section className="lgl-summary" aria-labelledby="lgl-summary-title">
                        <h2 id="lgl-summary-title">{summary.title}</h2>
                        <ul className="lgl-summary__list">
                            {summary.items.map(({ icon: Icon, title: t, text }) => (
                                <li key={String(t)}>
                                    <span className="lgl-summary__icon" aria-hidden="true">
                                        <Icon size={20} />
                                    </span>
                                    <div>
                                        <strong>{t}</strong>
                                        <span>{text}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {summary.note && <p className="lgl-summary__note">{summary.note}</p>}
                    </section>
                )}

                <div className="lgl-body">
                    <nav className={`lgl-toc${tocOpen ? ' is-open' : ''}`} aria-label="Partes deste documento">
                        <button
                            type="button"
                            className="lgl-toc__toggle"
                            aria-expanded={tocOpen}
                            aria-controls="lgl-toc-list"
                            onClick={() => setTocOpen((v) => !v)}
                        >
                            <span>Nesta página</span>
                            <span className="lgl-toc__count">{sections.length} partes</span>
                            <ChevronDown size={18} aria-hidden="true" />
                        </button>
                        <p className="lgl-toc__title" aria-hidden="true">Nesta página</p>
                        <ol id="lgl-toc-list" className="lgl-toc__list">
                            {sections.map((s, i) => (
                                <li key={s.id}>
                                    <a
                                        href={`#${s.id}`}
                                        className={active === s.id ? 'is-active' : undefined}
                                        aria-current={active === s.id ? 'location' : undefined}
                                        onClick={(e) => goTo(e, s.id)}
                                    >
                                        <span className="lgl-toc__num">{i + 1}</span>
                                        <span>{s.title}</span>
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </nav>

                    <article className="lgl-doc">
                        {entity && <div className="lgl-entity">{entity}</div>}

                        {sections.map((s, i) => (
                            <section key={s.id} id={s.id} className="lgl-section" aria-labelledby={`${s.id}-t`}>
                                <h2
                                    id={`${s.id}-t`}
                                    tabIndex={-1}
                                    ref={(el) => { headingRefs.current[s.id] = el }}
                                >
                                    <span className="lgl-num" aria-hidden="true">{i + 1}</span>
                                    <span>{s.title}</span>
                                </h2>
                                <div className="lgl-text">{s.content}</div>
                            </section>
                        ))}

                        <div className="lgl-doc__foot">
                            <button type="button" className="lgl-btn" onClick={toTop}>
                                <ArrowUp size={16} aria-hidden="true" />
                                Voltar ao topo
                            </button>
                        </div>
                    </article>
                </div>

                {related.length > 0 && (
                    <section className="lgl-related" aria-labelledby="lgl-related-title">
                        <h2 id="lgl-related-title">Leia também</h2>
                        <ul>
                            {related.map(({ to, icon: Icon, title: t, text }) => (
                                <li key={to}>
                                    <Link to={to} className="lgl-related__card">
                                        <span className="lgl-related__icon" aria-hidden="true">
                                            <Icon size={20} />
                                        </span>
                                        <span className="lgl-related__body">
                                            <strong>{t}</strong>
                                            <span>{text}</span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    )
}
