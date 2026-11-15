import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    Wallet, Users, Hourglass, ShieldAlert, Ban, Calculator, Activity, RotateCw, AlertTriangle,
    UserPlus, UserX, Lock, LockOpen, Gem, Gauge, Settings, KeyRound, Mail, MessageCircle,
    MonitorSmartphone, Timer, FileText, UserCheck
} from 'lucide-react'
import { Stat, Block } from '../../components/cards/CardsSummaryPanel'
import { showToast } from '../../utils/toast'
// AdminDashboard.css continua importado: .page-header, .plan-bars e .dashboard-grid
// são usados pelas outras páginas do admin que ainda não foram redesenhadas.
import './AdminDashboard.css'
import './AdminPanel.css'

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const num = (v) => new Intl.NumberFormat('pt-BR').format(Number(v) || 0)
const plural = (n, um, varios) => `${num(n)} ${Number(n) === 1 ? um : varios}`

// O que cada evento quer dizer, em português. "quem" vem do nome da conta.
const EVENTS = {
    USER_REGISTER: { icon: UserPlus, text: 'criou uma conta' },
    USER_LOGIN_SUCCESS: { icon: UserCheck, text: 'entrou na conta' },
    USER_LOGIN_FAILED: { icon: KeyRound, text: 'errou a senha ao entrar', anon: 'Alguém' },
    USER_LOGIN_THROTTLED: { icon: Timer, text: 'foi travado por muitas tentativas de entrar', anon: 'Alguém' },
    USER_LOGIN_BLOCKED: { icon: Lock, text: 'tentou entrar com a conta bloqueada' },
    ADMIN_LOGIN_DENIED: { icon: ShieldAlert, text: 'tentou entrar no painel do administrador sem permissão' },
    CONCURRENT_LOGIN_PREVENTED: { icon: MonitorSmartphone, text: 'entrou em outro aparelho e saiu deste (um aparelho por vez)' },
    PASSWORD_RESET_REQUESTED: { icon: Mail, text: 'pediu um link para criar senha nova', anon: 'Alguém' },
    PASSWORD_RESET_COMPLETED: { icon: KeyRound, text: 'criou uma senha nova' },
    USER_BLOCKED: { icon: Lock, text: 'teve a conta bloqueada' },
    USER_UNBLOCKED: { icon: LockOpen, text: 'teve a conta desbloqueada' },
    USER_SELF_DELETED: { icon: UserX, text: 'excluiu a própria conta', anon: 'Uma pessoa' },
    USER_DELETED_PERMANENTLY: { icon: UserX, text: 'teve a conta excluída pelo administrador', anon: 'Uma conta' },
    ACCOUNT_DELETE_FAILED: { icon: AlertTriangle, text: 'não conseguiu excluir a conta' },
    PLAN_CREATED: { icon: Gem, text: 'criou um plano' },
    PLAN_UPDATED: { icon: Gem, text: 'alterou um plano' },
    RULES_UPDATED: { icon: Calculator, text: 'alterou as regras de cálculo' },
    LIMITS_UPDATED: { icon: Gauge, text: 'alterou os limites do MEI' },
    SETTINGS_UPDATED: { icon: Settings, text: 'alterou uma configuração' },
    WHATSAPP_REMINDERS_RUN: { icon: MessageCircle, text: 'enviou os lembretes do WhatsApp' },
}

// Data e hora no horário de Brasília: "hoje às 13:10", "ontem às 09:02", "12/11 às 18:40"
const TZ = 'America/Sao_Paulo'
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
function when(value) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d)
    const today = new Date()
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    if (dayKey(d) === dayKey(today)) return `hoje às ${hour}`
    if (dayKey(d) === dayKey(yesterday)) return `ontem às ${hour}`
    const date = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d)
    return `${date} às ${hour}`
}
const clock = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

// Confere o formato da resposta antes de usar: dado fora do esperado vira erro na tela,
// não página quebrada
function isValidStats(d) {
    return d && typeof d === 'object'
        && d.users && typeof d.users.total === 'number'
        && d.subscriptions && typeof d.subscriptions.monthlyRevenue === 'number'
        && Array.isArray(d.usersByPlan)
        && Array.isArray(d.recentActivity)
}

function ActivityItem({ evt }) {
    const info = EVENTS[evt.event_type] || { icon: FileText, text: 'registrou um evento do sistema' }
    const Icon = info.icon
    const warn = ['WARN', 'ERROR', 'CRITICAL'].includes(evt.level)
    const who = evt.user_name || info.anon || 'O sistema'
    return (
        <li className={`apn-event${warn ? ' is-warn' : ''}`}>
            <span className="apn-event__icon" aria-hidden="true"><Icon size={16} /></span>
            <span className="apn-event__body">
                <span className="apn-event__text"><strong>{who}</strong> {info.text}</span>
                <span className="apn-event__time">
                    {when(evt.timestamp)}
                    {warn && <span className="apn-flag">Atenção</span>}
                </span>
            </span>
        </li>
    )
}

export default function AdminDashboard() {
    const [stats, setStats] = useState(null)
    const [status, setStatus] = useState('loading') // loading | ready | error
    const [refreshing, setRefreshing] = useState(false)

    const load = useCallback(async ({ silent = false } = {}) => {
        if (silent) setRefreshing(true)
        else setStatus('loading')
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
            const data = await res.json().catch(() => null)
            if (!res.ok || !isValidStats(data)) throw new Error('resposta inesperada')
            setStats(data)
            setStatus('ready')
        } catch (err) {
            console.error('Painel do admin:', err)
            // Na atualização, mantém os números que já estavam na tela e avisa
            if (silent) showToast('Não deu para atualizar agora. Os números são os de antes.', 'error')
            else setStatus('error')
        } finally {
            setRefreshing(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    if (status === 'loading') {
        return (
            <div className="apn adm-light">
                <div className="apn-state" role="status">
                    <span className="apn-spinner" aria-hidden="true" />
                    Carregando o painel…
                </div>
            </div>
        )
    }

    if (status === 'error') {
        return (
            <div className="apn adm-light">
                <div className="apn-state apn-state--error" role="alert">
                    <span className="apn-state__icon" aria-hidden="true"><AlertTriangle size={22} /></span>
                    <h1>Não deu para carregar o painel</h1>
                    <p>O servidor não respondeu direito. Tente de novo em alguns segundos.</p>
                    <button type="button" className="apn-btn apn-btn--primary" onClick={() => load()}>
                        <RotateCw size={16} aria-hidden="true" />
                        Tentar de novo
                    </button>
                </div>
            </div>
        )
    }

    const { users, subscriptions, simulations = { total: 0, last30: 0 }, usersByPlan, recentActivity, suspiciousCount = 0 } = stats
    const totalByPlan = usersByPlan.reduce((n, p) => n + (Number(p.count) || 0), 0)

    return (
        <div className="apn adm-light">
            <header className="apn-head">
                <div>
                    <h1>Painel</h1>
                    <p>Contas, assinaturas e segurança do EuSempreMEI.</p>
                </div>
                <div className="apn-head__side">
                    {stats.generatedAt && <span className="apn-updated">Atualizado às {clock(stats.generatedAt)}</span>}
                    <button type="button" className="apn-btn" onClick={() => load({ silent: true })} disabled={refreshing}>
                        <RotateCw size={16} aria-hidden="true" className={refreshing ? 'apn-spin' : undefined} />
                        {refreshing ? 'Atualizando…' : 'Atualizar'}
                    </button>
                </div>
            </header>

            <div className="csp csp--flat">
                <dl className="csp-stats apn-stats">
                    <Stat
                        main
                        icon={Wallet}
                        label="Receita mensal das assinaturas"
                        value={brl(subscriptions.monthlyRevenue)}
                        note={subscriptions.paying > 0
                            ? `${plural(subscriptions.paying, 'assinatura pagando', 'assinaturas pagando')}${subscriptions.canceling > 0 ? `, ${plural(subscriptions.canceling, 'cancela', 'cancelam')} no fim do mês` : ''}`
                            : 'Nenhuma assinatura pagando agora'}
                    />
                    <Stat
                        icon={Users}
                        label="Contas"
                        value={num(users.total)}
                        note={`${num(users.new30)} novas nos últimos 30 dias`}
                    />
                    <Stat
                        icon={Hourglass}
                        tone={users.pendingPayment > 0 ? 'warn' : ''}
                        label="Esperando pagamento"
                        value={num(users.pendingPayment)}
                        note="Escolheram um plano pago e ainda não pagaram"
                    />
                    <Stat
                        icon={ShieldAlert}
                        tone={suspiciousCount > 0 ? 'warn' : ''}
                        label="Avisos de segurança (24 horas)"
                        value={num(suspiciousCount)}
                        note={suspiciousCount > 0 ? <Link to="/admin/logs" className="apn-link">Ver nos logs</Link> : 'Nada fora do comum'}
                    />
                    <Stat
                        icon={Ban}
                        label="Contas bloqueadas"
                        value={num(users.blocked)}
                        note={<Link to="/admin/usuarios" className="apn-link">Ver usuários</Link>}
                    />
                    <Stat
                        icon={Calculator}
                        label="Simulações salvas"
                        value={num(simulations.total)}
                        note={`${num(simulations.last30)} nos últimos 30 dias`}
                    />
                </dl>

                <div className="apn-grid">
                    <Block icon={Users} title="Contas por plano">
                        {usersByPlan.length === 0 ? (
                            <p className="apn-empty">Nenhuma conta ainda.</p>
                        ) : (
                            <ul className="apn-plans">
                                {usersByPlan.map((p) => {
                                    const count = Number(p.count) || 0
                                    const pct = totalByPlan > 0 ? Math.round((count / totalByPlan) * 100) : 0
                                    return (
                                        <li key={p.id ?? p.name}>
                                            <div className="apn-plans__line">
                                                <span className="apn-plans__name">
                                                    {p.name}
                                                    <span className="apn-plans__price">{p.price > 0 ? `${brl(p.price)}/mês` : 'grátis'}</span>
                                                </span>
                                                <span className="apn-plans__count">{num(count)} <small>({pct}%)</small></span>
                                            </div>
                                            <div className="apn-plans__track" aria-hidden="true">
                                                <span style={{ width: `${count > 0 ? Math.max(2, pct) : 0}%` }} />
                                            </div>
                                            {p.price > 0 && (
                                                <span className="apn-plans__note">
                                                    {p.paying > 0 ? `${num(p.paying)} pagando` : 'Ninguém pagando'}
                                                    {count - p.paying > 0 ? `; ${num(count - p.paying)} sem cobrança (esperando pagamento ou liberado pelo admin)` : ''}
                                                </span>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </Block>

                    <Block
                        icon={Activity}
                        title="Atividade recente"
                        aside={<Link to="/admin/logs" className="apn-link">Ver todos os logs</Link>}
                    >
                        {recentActivity.length === 0 ? (
                            <p className="apn-empty">Nenhuma atividade registrada ainda.</p>
                        ) : (
                            <ul className="apn-events">
                                {recentActivity.map((evt) => <ActivityItem key={evt.id} evt={evt} />)}
                            </ul>
                        )}
                    </Block>
                </div>
            </div>
        </div>
    )
}
