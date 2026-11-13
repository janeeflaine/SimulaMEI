import { useState, useRef, useEffect, useLayoutEffect, useId, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import './Select.css'

/**
 * Lista de escolha no padrão do site, no lugar do <select> do navegador
 * (que abre quadrado, com a seleção azul do sistema).
 *
 * <Select value={v} onChange={setV} ariaLabel="Carteira" variant="pill" options={[
 *   { value: 'ALL', label: 'Todas as carteiras' },
 *   { group: 'MEI', options: [{ value: 1, label: 'Ateliê' }] },
 * ]} />
 *
 * variant: 'pill' (filtros, pílula), 'field' (campo de formulário), 'compact' (dentro de linhas)
 * active: marca o botão quando o filtro está em uso
 * O menu abre numa camada própria (portal), então não é cortado por janelas com rolagem.
 */
export default function Select({
    value,
    onChange,
    options = [],
    ariaLabel,
    id,
    placeholder = 'Selecione',
    variant = 'field',
    active = false,
    disabled = false,
    defaultOpen = false,
    onClose,
    className = ''
}) {
    const autoId = useId()
    const baseId = id || `sel-${autoId.replace(/[:]/g, '')}`
    const listId = `${baseId}-list`
    const triggerRef = useRef(null)
    const menuRef = useRef(null)
    const typed = useRef({ text: '', at: 0 })
    const [open, setOpen] = useState(false)
    const [highlight, setHighlight] = useState(-1)
    const [position, setPosition] = useState(null)

    // Lista plana das opções que dá para escolher, com o grupo de cada uma
    const items = useMemo(() => {
        const flat = []
        options.forEach(entry => {
            if (entry && Array.isArray(entry.options)) {
                entry.options.forEach(opt => flat.push({ ...opt, groupLabel: entry.group }))
            } else if (entry) {
                flat.push(entry)
            }
        })
        return flat
    }, [options])

    const selectedIndex = items.findIndex(item => String(item.value) === String(value ?? ''))
    const selected = selectedIndex >= 0 ? items[selectedIndex] : null

    const place = useCallback(() => {
        const trigger = triggerRef.current
        if (!trigger) return
        const rect = trigger.getBoundingClientRect()
        const viewportW = document.documentElement.clientWidth
        const viewportH = window.innerHeight
        const width = Math.min(Math.max(rect.width, 220), viewportW - 16)
        const left = Math.min(Math.max(8, rect.left), viewportW - width - 8)
        const spaceBelow = viewportH - rect.bottom - 12
        const spaceAbove = rect.top - 12
        const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
        const maxHeight = Math.max(160, Math.min(340, openUp ? spaceAbove - 8 : spaceBelow - 8))
        setPosition({
            left,
            width,
            maxHeight,
            ...(openUp ? { bottom: viewportH - rect.top + 8 } : { top: rect.bottom + 8 })
        })
    }, [])

    const openMenu = useCallback(() => {
        if (disabled) return
        place()
        setHighlight(selectedIndex >= 0 ? selectedIndex : items.findIndex(item => !item.disabled))
        setOpen(true)
    }, [disabled, place, selectedIndex, items])

    const closeMenu = useCallback((focusTrigger = true) => {
        setOpen(false)
        if (focusTrigger) triggerRef.current?.focus()
        if (onClose) onClose()
    }, [onClose])

    useEffect(() => {
        if (defaultOpen) openMenu()
        // só ao montar
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Foco no menu ao abrir e a opção marcada à vista
    useLayoutEffect(() => {
        if (!open) return
        menuRef.current?.focus({ preventScroll: true })
    }, [open])

    useEffect(() => {
        if (!open || highlight < 0) return
        const el = menuRef.current?.querySelector(`[data-index="${highlight}"]`)
        el?.scrollIntoView({ block: 'nearest' })
    }, [open, highlight])

    // Fecha ao tocar fora; acompanha a tela ao rolar ou girar
    useEffect(() => {
        if (!open) return undefined
        const onDown = (e) => {
            if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
            closeMenu(false)
        }
        const onScroll = (e) => {
            if (menuRef.current?.contains(e.target)) return
            place()
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('touchstart', onDown)
        window.addEventListener('resize', place)
        window.addEventListener('scroll', onScroll, true)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('touchstart', onDown)
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', onScroll, true)
        }
    }, [open, closeMenu, place])

    const choose = (index) => {
        const item = items[index]
        if (!item || item.disabled) return
        if (String(item.value) !== String(value ?? '')) onChange(item.value)
        closeMenu(true)
    }

    const move = (from, step) => {
        if (!items.length) return from
        let next = from
        for (let i = 0; i < items.length; i++) {
            next = (next + step + items.length) % items.length
            if (!items[next].disabled) return next
        }
        return from
    }

    const onTriggerKeyDown = (e) => {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault()
            openMenu()
        }
    }

    const onMenuKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closeMenu(true)
            return
        }
        if (e.key === 'Tab') {
            closeMenu(false)
            return
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight(h => move(h < 0 ? -1 : h, e.key === 'ArrowDown' ? 1 : -1))
            return
        }
        if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault()
            setHighlight(e.key === 'Home' ? move(-1, 1) : move(items.length, -1))
            return
        }
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            choose(highlight)
            return
        }
        // Digitar as primeiras letras pula para a opção
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const now = Date.now()
            typed.current.text = (now - typed.current.at > 700 ? '' : typed.current.text) + e.key.toLowerCase()
            typed.current.at = now
            const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            const target = norm(typed.current.text)
            const found = items.findIndex(item => !item.disabled && norm(item.label).startsWith(target))
            if (found >= 0) setHighlight(found)
        }
    }

    let lastGroup
    const menu = open && position ? createPortal(
        <div
            ref={menuRef}
            id={listId}
            className={`sel-menu ${position.bottom !== undefined ? 'is-up' : ''}`}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            aria-activedescendant={highlight >= 0 ? `${baseId}-opt-${highlight}` : undefined}
            onKeyDown={onMenuKeyDown}
            style={{
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
                top: position.top,
                bottom: position.bottom
            }}
        >
            {items.map((item, index) => {
                const showGroup = item.groupLabel && item.groupLabel !== lastGroup
                lastGroup = item.groupLabel
                const isSelected = index === selectedIndex
                return (
                    <div key={`${item.groupLabel || ''}-${item.value}`} role="presentation">
                        {showGroup && <div className="sel-group" role="presentation">{item.groupLabel}</div>}
                        <div
                            id={`${baseId}-opt-${index}`}
                            data-index={index}
                            role="option"
                            aria-selected={isSelected}
                            aria-disabled={item.disabled || undefined}
                            className={[
                                'sel-option',
                                item.groupLabel ? 'is-grouped' : '',
                                isSelected ? 'is-selected' : '',
                                index === highlight ? 'is-highlight' : '',
                                item.disabled ? 'is-disabled' : ''
                            ].join(' ')}
                            onMouseMove={() => { if (highlight !== index) setHighlight(index) }}
                            onClick={() => choose(index)}
                        >
                            <span className="sel-option__label">{item.label}</span>
                            {isSelected && <Check size={16} aria-hidden="true" />}
                        </div>
                    </div>
                )
            })}
        </div>,
        document.body
    ) : null

    return (
        <>
            <button
                ref={triggerRef}
                id={baseId}
                type="button"
                className={`sel-trigger sel-trigger--${variant} ${active ? 'is-on' : ''} ${open ? 'is-open' : ''} ${className}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-label={ariaLabel ? `${ariaLabel}: ${selected ? selected.label : placeholder}` : undefined}
                disabled={disabled}
                onClick={() => (open ? closeMenu(false) : openMenu())}
                onKeyDown={onTriggerKeyDown}
            >
                <span className={`sel-trigger__label ${selected ? '' : 'is-placeholder'}`}>
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown size={16} aria-hidden="true" className="sel-trigger__chevron" />
            </button>
            {menu}
        </>
    )
}
