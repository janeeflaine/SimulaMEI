import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Gauge, Info, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react'
import BrandMark from '../ui/BrandMark'
import '../../pages/Login.css'

/**
 * Moldura das telas de acesso (Entrar, Criar conta, Esqueci a senha, Nova senha).
 * No computador: quadro azul-marinho com o que o site faz + formulário ao lado.
 * No celular: só o formulário, com a marca em cima.
 */
const POINTS = [
    { icon: Gauge, title: 'Faturamento e limite do ano', text: 'Quanto do limite do MEI você já usou, mês a mês.' },
    { icon: WalletCards, title: 'Extrato, contas e cartões', text: 'O dinheiro do MEI separado do dinheiro da casa.' },
    { icon: ReceiptText, title: 'DAS e declaração anual', text: 'O valor do DAS do ano e os prazos que vêm por aí.' }
]

export default function AuthFrame({ aside, extra, children }) {
    return (
        <div className="acesso">
            <div className="acs-wrap">
                <aside className="acs-aside" aria-label="Sobre o EuSempreMEI">
                    <Link to="/" className="acs-brand acs-brand--light">
                        <BrandMark size={30} /> <span>EuSempreMEI</span>
                    </Link>
                    <h2 className="acs-aside__title">{aside || 'Seu MEI em dia, num lugar só'}</h2>
                    <ul className="acs-points">
                        {POINTS.map(({ icon: Icon, title, text }) => (
                            <li key={title}>
                                <span className="acs-points__icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                                <span><strong>{title}</strong>{text}</span>
                            </li>
                        ))}
                    </ul>
                    {extra}
                    <p className="acs-aside__note">
                        <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" />
                        Seus dados ficam só na sua conta, e você pode excluir tudo quando quiser em Minha conta.
                    </p>
                </aside>
                <section className="acs-card">
                    {children}
                </section>
            </div>
        </div>
    )
}

// Limite do MEI deste ano e do próximo (LC 238/2026), da mesma rota pública da Início
export function LimitFact() {
    const [limits, setLimits] = useState(null)
    useEffect(() => {
        let alive = true
        fetch('/api/simulate/limits').then(r => (r.ok ? r.json() : null)).then(d => { if (alive && d?.current) setLimits(d) }).catch(() => {})
        return () => { alive = false }
    }, [])
    if (!limits) return null
    const mil = (v) => `R$ ${Math.round(Number(v) / 1000)} mil`
    return (
        <div className="acs-fact">
            <p className="acs-fact__title">Limite de faturamento do MEI</p>
            <dl>
                <div><dt>{limits.current.year}</dt><dd>{mil(limits.current.annualLimit)}</dd></div>
                <div><dt>{limits.next.year}</dt><dd>{mil(limits.next.annualLimit)}</dd></div>
            </dl>
            <p className="acs-fact__note">Valores da Lei Complementar 238/2026.</p>
        </div>
    )
}

// Aviso do formulário: erro (vermelho) ou feito (verde); recebe o foco para o leitor de tela
export function AuthAlert({ tone = 'error', children }) {
    const ref = useRef(null)
    useEffect(() => {
        if (children && ref.current) {
            ref.current.focus({ preventScroll: true })
            ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
    }, [children])
    if (!children) return null
    const Icon = tone === 'error' ? AlertCircle : tone === 'info' ? Info : CheckCircle2
    return (
        <div ref={ref} tabIndex={-1} className={`acs-alert is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
            <span>{children}</span>
        </div>
    )
}

// Campo de senha com "mostrar" e aviso de Caps Lock
export function PasswordField({ id, label, value, onChange, autoComplete, placeholder, disabled, describedBy, aside, invalid }) {
    const [show, setShow] = useState(false)
    const [caps, setCaps] = useState(false)
    const checkCaps = (e) => setCaps(!!e.getModifierState && e.getModifierState('CapsLock'))
    return (
        <div className="acs-field">
            <div className="acs-label-row">
                <label htmlFor={id}>{label}</label>
                {aside}
            </div>
            <div className="acs-password">
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={onChange}
                    onKeyUp={checkCaps}
                    onKeyDown={checkCaps}
                    onBlur={() => setCaps(false)}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    disabled={disabled}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                    maxLength={72}
                />
                <button
                    type="button"
                    className="acs-eye"
                    onClick={() => setShow(s => !s)}
                    aria-label={show ? 'Esconder a senha' : 'Mostrar a senha'}
                    aria-pressed={show}
                    disabled={disabled}
                >
                    {show ? <EyeOff size={20} strokeWidth={1.8} /> : <Eye size={20} strokeWidth={1.8} />}
                </button>
            </div>
            {caps && <p className="acs-hint is-warn">O Caps Lock está ligado.</p>}
        </div>
    )
}

// Regras da senha (as mesmas do servidor)
export const passwordProblem = (password) => {
    if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
    if (new TextEncoder().encode(password).length > 72) return 'A senha pode ter no máximo 72 caracteres.'
    return ''
}

export const normalizeEmail = (email) => email.trim().toLowerCase()
export const looksLikeEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// Lê a resposta do servidor mesmo quando não é JSON (ex.: erro da Vercel)
export async function readJson(res) {
    try { return await res.json() } catch { return {} }
}
