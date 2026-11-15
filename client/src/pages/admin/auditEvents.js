import {
    UserPlus, UserCheck, KeyRound, Timer, Lock, LockOpen, ShieldAlert, MonitorSmartphone, Mail,
    UserX, AlertTriangle, Gem, Calculator, Gauge, Settings, MessageCircle, UserCog, FileText
} from 'lucide-react'

// Eventos dos registros de auditoria, em português (Painel e Logs de auditoria).
// - text: o que aconteceu, depois do nome de quem fez ("Ana Souza" + "entrou na conta")
// - onTarget: quando quem fez foi o admin e o registro aponta para uma conta
//   ("Ana Souza" + "bloqueou a conta de" + "João")
// - anon: quem aparece quando não há conta no registro
// - label: nome curto para o filtro
export const EVENTS = {
    USER_LOGIN_SUCCESS: { group: 'access', label: 'Entrou na conta', icon: UserCheck, text: 'entrou na conta' },
    USER_LOGIN_FAILED: { group: 'access', label: 'Errou a senha', icon: KeyRound, text: 'errou a senha ao entrar', anon: 'Alguém' },
    USER_LOGIN_THROTTLED: { group: 'access', label: 'Travado por tentativas', icon: Timer, text: 'foi travado por muitas tentativas de entrar', anon: 'Alguém' },
    USER_LOGIN_BLOCKED: { group: 'access', label: 'Conta bloqueada tentou entrar', icon: Lock, text: 'tentou entrar com a conta bloqueada' },
    ADMIN_LOGIN_DENIED: { group: 'access', label: 'Tentou entrar no admin', icon: ShieldAlert, text: 'tentou entrar no painel do administrador sem permissão' },
    CONCURRENT_LOGIN_PREVENTED: { group: 'access', label: 'Entrou em outro aparelho', icon: MonitorSmartphone, text: 'entrou em outro aparelho e saiu deste (um aparelho por vez)' },
    PASSWORD_RESET_REQUESTED: { group: 'access', label: 'Pediu link de senha', icon: Mail, text: 'pediu um link para criar senha nova', anon: 'Alguém' },
    PASSWORD_RESET_COMPLETED: { group: 'access', label: 'Criou senha nova', icon: KeyRound, text: 'criou uma senha nova' },

    USER_REGISTER: { group: 'accounts', label: 'Conta criada', icon: UserPlus, text: 'criou uma conta' },
    USER_UPDATED: { group: 'accounts', label: 'Dados da conta alterados', icon: UserCog, text: 'alterou os dados de uma conta', onTarget: 'alterou os dados de' },
    USER_PLAN_CHANGED: { group: 'accounts', label: 'Plano trocado pelo admin', icon: Gem, text: 'trocou o plano de uma conta', onTarget: 'trocou o plano de' },
    USER_ROLE_CHANGED: { group: 'accounts', label: 'Acesso de admin alterado', icon: ShieldAlert, text: 'mudou o acesso de administrador de uma conta', onTarget: 'mudou o acesso de administrador de' },
    USER_BLOCKED: { group: 'accounts', label: 'Conta bloqueada', icon: Lock, text: 'bloqueou uma conta', onTarget: 'bloqueou a conta de' },
    USER_UNBLOCKED: { group: 'accounts', label: 'Conta desbloqueada', icon: LockOpen, text: 'desbloqueou uma conta', onTarget: 'desbloqueou a conta de' },
    ADMIN_PASSWORD_RESET_LINK: { group: 'accounts', label: 'Link de senha mandado pelo admin', icon: Mail, text: 'mandou um link de senha nova para uma conta', onTarget: 'mandou um link de senha nova para' },
    USER_SELF_DELETED: { group: 'accounts', label: 'Conta excluída pela pessoa', icon: UserX, text: 'excluiu a própria conta', anon: 'Uma pessoa' },
    USER_DELETED_PERMANENTLY: { group: 'accounts', label: 'Conta excluída pelo admin', icon: UserX, text: 'excluiu uma conta', anon: 'O administrador' },
    ACCOUNT_DELETE_FAILED: { group: 'accounts', label: 'Exclusão de conta falhou', icon: AlertTriangle, text: 'não conseguiu excluir a conta' },

    PLAN_CREATED: { group: 'rules', label: 'Plano criado', icon: Gem, text: 'criou um plano' },
    PLAN_UPDATED: { group: 'rules', label: 'Plano alterado', icon: Gem, text: 'alterou um plano' },
    RULES_UPDATED: { group: 'rules', label: 'Regras de cálculo alteradas', icon: Calculator, text: 'alterou as regras de cálculo' },
    LIMITS_UPDATED: { group: 'rules', label: 'Limites do MEI alterados', icon: Gauge, text: 'alterou os limites do MEI' },

    SETTINGS_UPDATED: { group: 'system', label: 'Configuração alterada', icon: Settings, text: 'alterou uma configuração' },
    WHATSAPP_REMINDERS_RUN: { group: 'system', label: 'Lembretes do WhatsApp', icon: MessageCircle, text: 'enviou os lembretes do WhatsApp' },
}

export const EVENT_GROUPS = [
    { key: 'access', name: 'Entrar e senha' },
    { key: 'accounts', name: 'Contas' },
    { key: 'rules', name: 'Planos e regras' },
    { key: 'system', name: 'Sistema' },
]

const UNKNOWN = { icon: FileText, text: 'registrou um evento do sistema' }

// Frase do evento: quem fez, o que fez e (se houver) com qual conta
export function describeEvent(evt) {
    const info = EVENTS[evt.event_type] || UNKNOWN
    const who = evt.user_name || info.anon || (evt.user_id ? 'Uma conta excluída' : 'O sistema')
    const target = info.onTarget && evt.target_name ? evt.target_name : null
    return { icon: info.icon, who, text: target ? info.onTarget : info.text, target }
}

export const eventLabel = (type) => EVENTS[type]?.label || type

// Data e hora no horário de Brasília: "hoje às 13:10", "ontem às 09:02", "12/11 às 18:40"
export const TZ = 'America/Sao_Paulo'
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
export function when(value) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d)
    const today = new Date()
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    if (dayKey(d) === dayKey(today)) return `hoje às ${hour}`
    if (dayKey(d) === dayKey(yesterday)) return `ontem às ${hour}`
    const sameYear = dayKey(d).slice(0, 4) === dayKey(today).slice(0, 4)
    const date = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', ...(sameYear ? {} : { year: 'numeric' }) }).format(d)
    return `${date} às ${hour}`
}
// Dia de hoje (AAAA-MM-DD) em Brasília
export const todayBR = () => dayKey(new Date())
