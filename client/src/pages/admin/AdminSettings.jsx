import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, RotateCw, Info, ExternalLink } from 'lucide-react'
// AdminPages.css segue importado: as outras páginas do admin ainda usam as classes dele
import './AdminPages.css'
import './AdminSettings.css'

const STATES = {
    ok: { label: 'Configurado', icon: CheckCircle2 },
    missing: { label: 'Faltando', icon: XCircle },
    warn: { label: 'Atenção', icon: AlertTriangle },
    off: { label: 'Não usado', icon: MinusCircle },
}
const ENVS = {
    production: { label: 'Site no ar', note: 'Estes são os valores do site que os clientes usam.' },
    preview: { label: 'Prévia', note: 'Esta é uma prévia da Vercel, não o site no ar.' },
    development: { label: 'Computador local', note: 'Este é o site rodando no computador, não o site no ar.' },
}
const isValid = (d) => d && Array.isArray(d.groups) && d.groups.every((g) => Array.isArray(g.items))

export default function AdminSettings() {
    const [data, setData] = useState(null)
    const [status, setStatus] = useState('loading')

    const load = useCallback(async () => {
        setStatus((s) => (s === 'ready' ? 'refreshing' : 'loading'))
        try {
            const res = await fetch('/api/admin/system-status', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
            const body = await res.json().catch(() => null)
            if (!res.ok || !isValid(body)) throw new Error('resposta inesperada')
            setData(body)
            setStatus('ready')
        } catch (err) {
            console.error('Configurações:', err)
            setStatus((s) => (s === 'refreshing' ? 'ready' : 'error'))
        }
    }, [])
    useEffect(() => { load() }, [load])

    const head = (
        <header className="ast-head">
            <div>
                <h1>Configurações</h1>
                <p>Os serviços que o site usa e se cada um está pronto.</p>
            </div>
            {data && (
                <button type="button" className="ast-btn" onClick={load} disabled={status !== 'ready'}>
                    <RotateCw size={16} aria-hidden="true" className={status === 'refreshing' ? 'ast-spin' : ''} />Conferir de novo
                </button>
            )}
        </header>
    )

    if (status === 'loading' || (status === 'error' && !data)) {
        return (
            <div className="ast adm-light">
                {head}
                {status === 'loading' ? (
                    <div className="ast-state" role="status"><span className="ast-spinner" aria-hidden="true" />Conferindo os serviços…</div>
                ) : (
                    <div className="ast-state ast-state--error" role="alert">
                        <span className="ast-state__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                        <h2>Não deu para conferir os serviços</h2>
                        <p>O servidor não respondeu direito. Tente de novo em alguns segundos.</p>
                        <button type="button" className="ast-btn ast-btn--primary" onClick={load}><RotateCw size={16} aria-hidden="true" />Tentar de novo</button>
                    </div>
                )}
            </div>
        )
    }

    const items = data.groups.flatMap((g) => g.items)
    const count = (st) => items.filter((i) => i.state === st).length
    const missing = count('missing')
    const warn = count('warn')
    const env = ENVS[data.environment] || ENVS.development

    return (
        <div className="ast adm-light" aria-busy={status === 'refreshing'}>
            {head}

            <section className={`ast-summary${missing ? ' is-bad' : warn ? ' is-warn' : ''}`} aria-live="polite">
                <span className="ast-env">{env.label}</span>
                <p className="ast-summary__title">
                    {missing === 0 && warn === 0 && 'Tudo configurado.'}
                    {missing > 0 && `${missing} ${missing === 1 ? 'serviço faltando' : 'serviços faltando'}`}
                    {missing > 0 && warn > 0 && ' e '}
                    {warn > 0 && `${warn} ${warn === 1 ? 'ponto' : 'pontos'} de atenção`}
                    {(missing > 0 || warn > 0) && '.'}
                </p>
                <p className="ast-summary__note">{env.note} {count('ok')} de {items.length} itens configurados.</p>
            </section>

            <div className="ast-groups">
                {data.groups.map((g) => (
                    <section key={g.key} className="ast-card" aria-labelledby={`ast-g-${g.key}`}>
                        <h2 id={`ast-g-${g.key}`}>{g.name}</h2>
                        <ul className="ast-items">
                            {g.items.map((it) => {
                                const st = STATES[it.state] || STATES.off
                                return (
                                    <li key={it.key} className={`ast-item ast-item--${it.state}`}>
                                        <span className="ast-item__icon" aria-hidden="true"><st.icon size={20} /></span>
                                        <div className="ast-item__body">
                                            <div className="ast-item__top">
                                                <h3>{it.name}</h3>
                                                <span className="ast-tag">{st.label}</span>
                                            </div>
                                            {it.note && <p>{it.note}</p>}
                                            {Array.isArray(it.vars) && it.vars.length > 0 && (
                                                <p className="ast-vars"><span className="ast-sr">Variáveis: </span>{it.vars.map((v) => <code key={v}>{v}</code>)}</p>
                                            )}
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                ))}
            </div>

            <aside className="ast-help">
                <Info size={18} aria-hidden="true" />
                <div>
                    <p>
                        Os valores ficam nas variáveis da Vercel (Settings, Environment Variables) e nunca aparecem aqui nem nos registros.
                        Depois de mudar uma variável, faça um novo deploy para valer.
                    </p>
                    <p>
                        Limites dos planos, e-mail e lembretes do WhatsApp ficam em <Link to="/admin/funcionalidades">Funcionalidades</Link>.
                        {' '}<a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Abrir a Vercel<ExternalLink size={14} aria-hidden="true" /></a>
                    </p>
                </div>
            </aside>
        </div>
    )
}
