import { useState, useRef, useEffect, useCallback } from 'react'
import './ConfirmDialog.css'

/**
 * Janela de confirmação/aviso no padrão do site, no lugar de window.confirm/alert.
 *
 * const { confirm, notify, dialog } = useConfirmDialog()
 * if (await confirm({ title, message, details, confirmLabel })) { ... }
 * await notify({ title, message, tone: 'success' })
 * ...e renderize {dialog} na página.
 *
 * details: [{ label, value, strong }] — linhas de valor (cobrança, crédito, datas)
 * tone: 'default' | 'danger' | 'success' | 'error'
 */
export function useConfirmDialog() {
    const [state, setState] = useState(null)
    const resolver = useRef(null)

    const open = useCallback((opts, mode) => new Promise(resolve => {
        resolver.current = resolve
        setState({ ...opts, mode })
    }), [])

    const close = useCallback((result) => {
        setState(null)
        const resolve = resolver.current
        resolver.current = null
        if (resolve) resolve(result)
    }, [])

    const confirm = useCallback((opts) => open(opts, 'confirm'), [open])
    const notify = useCallback((opts) => open(opts, 'notify'), [open])

    const dialog = state ? <ConfirmDialog {...state} onClose={close} /> : null
    return { confirm, notify, dialog }
}

function ConfirmDialog({ mode, title, message, details = [], confirmLabel, cancelLabel = 'Voltar', tone = 'default', onClose }) {
    const primaryRef = useRef(null)
    const cancelRef = useRef(null)
    const boxRef = useRef(null)
    const isConfirm = mode === 'confirm'

    useEffect(() => {
        const previouslyFocused = document.activeElement
        // Ação destrutiva começa com o foco em "Voltar", para Enter não cancelar sem querer
        const first = isConfirm && tone === 'danger' ? cancelRef.current : primaryRef.current
        first?.focus()
        const { overflow } = document.body.style
        document.body.style.overflow = 'hidden'

        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onClose(false)
            }
            if (e.key === 'Tab') {
                // Mantém o foco dentro da janela
                const focusables = boxRef.current?.querySelectorAll('button') || []
                if (!focusables.length) return
                const firstEl = focusables[0]
                const lastEl = focusables[focusables.length - 1]
                if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
                else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
            }
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = overflow
            if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus()
        }
    }, [isConfirm, tone, onClose])

    return (
        <div className="cd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false) }}>
            <div
                ref={boxRef}
                className={`cd-box cd-box--${tone}`}
                role={isConfirm ? 'alertdialog' : 'dialog'}
                aria-modal="true"
                aria-labelledby="cd-title"
                aria-describedby={message ? 'cd-message' : undefined}
            >
                {(tone === 'success' || tone === 'error') && (
                    <span className={`cd-icon cd-icon--${tone}`} aria-hidden="true">
                        {tone === 'success' ? (
                            <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>
                        ) : (
                            <svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01" /></svg>
                        )}
                    </span>
                )}
                <h2 id="cd-title" className="cd-title">{title}</h2>
                {message && <p id="cd-message" className="cd-message">{message}</p>}

                {details.length > 0 && (
                    <dl className="cd-details">
                        {details.map(d => (
                            <div key={d.label} className={d.strong ? 'is-strong' : ''}>
                                <dt>{d.label}</dt>
                                <dd>{d.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}

                <div className="cd-actions">
                    {isConfirm && (
                        <button ref={cancelRef} type="button" className="cd-btn" onClick={() => onClose(false)}>
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        ref={primaryRef}
                        type="button"
                        className={`cd-btn cd-btn--primary ${tone === 'danger' ? 'cd-btn--danger' : ''}`}
                        onClick={() => onClose(true)}
                    >
                        {confirmLabel || (isConfirm ? 'Confirmar' : 'Entendi')}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmDialog
