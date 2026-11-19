// Conversas de exemplo da página /comecar. Os textos seguem as mensagens que o
// assistente do WhatsApp manda de verdade (server/utils/whatsappBot.js), um pouco
// encurtadas. Nomes de carteiras e valores são inventados.

const TZ = 'America/Sao_Paulo'

export const todayBR = () => {
    const iso = new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
}
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
export const ddmm = (date) => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
export const ddmmyyyy = (date) => `${ddmm(date)}/${date.getFullYear()}`
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const monthName = (date) => MONTHS[date.getMonth()]

export const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Próximo dia 20 (vencimento do DAS) a partir de hoje */
function nextDasDue(today) {
    const due = new Date(today.getFullYear(), today.getMonth(), 20)
    return today.getDate() <= 20 ? due : new Date(today.getFullYear(), today.getMonth() + 1, 20)
}

/**
 * Monta as cenas com as datas de hoje (horário de Brasília) e o DAS do ano.
 * Cada passo: type (digita no campo), send, record (áudio), photo, typing (o
 * assistente digitando), bot, tap (toca num botão da última mensagem), result.
 */
export function buildScenes({ dasValue = 82.05 } = {}) {
    const today = todayBR()
    const das = nextDasDue(today)
    const dasRef = new Date(das.getFullYear(), das.getMonth() - 1, 1)
    const rent = addDays(today, 3)
    const light = addDays(today, 6)
    const bills = [
        { due: das, label: `DAS de ${monthName(dasRef)}`, value: dasValue },
        { due: rent, label: 'Aluguel da loja', value: 650 },
        { due: light, label: 'Conta de luz', value: 182.4 }
    ].sort((a, b) => a.due - b.due)
    const billsTotal = bills.reduce((s, b) => s + b.value, 0)
    const dot = (due) => (due.getTime() === today.getTime() ? 'today' : 'future')

    return [
        {
            id: 'texto',
            chip: 'Texto',
            feature: 'whatsapp',
            caption: 'Escreva do seu jeito. O assistente entende valor, forma de pagamento e se é do MEI ou da casa.',
            steps: [
                { t: 'type', text: 'vendi 120 de marmita no pix' },
                { t: 'send' },
                { t: 'typing', ms: 1100 },
                {
                    t: 'bot',
                    msg: {
                        lines: [
                            ['Receita', 'Venda de marmitas'],
                            ['Valor', brl(120)],
                            ['Carteira', 'Marmitas da Bia'],
                            ['Pagamento', 'PIX']
                        ],
                        after: 'Sugestão de categoria: Vendas',
                        buttons: ['Usar Vendas', 'Escolher outra', 'Criar nova']
                    }
                },
                { t: 'tap', label: 'Usar Vendas' },
                { t: 'typing', ms: 800 },
                {
                    t: 'bot',
                    msg: {
                        before: 'Confere?',
                        lines: [
                            ['Receita', 'Venda de marmitas'],
                            ['Valor', brl(120)],
                            ['Data', ddmmyyyy(today)],
                            ['Categoria', 'Vendas']
                        ],
                        buttons: ['Confirmar', 'Cancelar']
                    }
                },
                { t: 'tap', label: 'Confirmar' },
                { t: 'typing', ms: 700 },
                { t: 'bot', msg: { done: 'Registrado! Já aparece no seu Extrato.' } },
                { t: 'result' }
            ],
            result: {
                kind: 'extrato',
                row: { title: 'Venda de marmitas', meta: 'Hoje, PIX, Vendas', wallet: 'MEI', value: 120, type: 'in' }
            }
        },
        {
            id: 'audio',
            chip: 'Áudio',
            feature: 'whatsapp_midia',
            caption: 'Está com as mãos ocupadas? Mande um áudio. A IA ouve e monta o lançamento.',
            steps: [
                { t: 'record', secs: 5, transcript: 'paguei oitenta e cinco de gás no débito, é da casa' },
                { t: 'typing', ms: 1300 },
                {
                    t: 'bot',
                    msg: {
                        before: 'Confere?',
                        lines: [
                            ['Despesa', 'Gás de cozinha'],
                            ['Valor', brl(85)],
                            ['Carteira', 'Casa'],
                            ['Pagamento', 'Cartão de Débito']
                        ],
                        buttons: ['Confirmar', 'Cancelar']
                    }
                },
                { t: 'tap', label: 'Confirmar' },
                { t: 'typing', ms: 700 },
                { t: 'bot', msg: { done: 'Registrado! Já aparece no seu Extrato.' } },
                { t: 'result' }
            ],
            result: {
                kind: 'extrato',
                row: { title: 'Gás de cozinha', meta: 'Hoje, Cartão de Débito', wallet: 'Pessoal', value: 85, type: 'out' }
            }
        },
        {
            id: 'boleto',
            chip: 'Boleto',
            feature: 'whatsapp_midia',
            caption: 'Tire foto do boleto. Valor e vencimento vão para Contas a pagar, com lembrete no dia.',
            steps: [
                { t: 'photo' },
                { t: 'typing', ms: 1500 },
                {
                    t: 'bot',
                    msg: {
                        before: 'Confere?',
                        lines: [
                            ['Conta a pagar', 'Conta de luz'],
                            ['Valor', brl(182.4)],
                            ['Vencimento', ddmmyyyy(light)],
                            ['Carteira', 'Marmitas da Bia']
                        ],
                        buttons: ['Confirmar', 'Cancelar']
                    }
                },
                { t: 'tap', label: 'Confirmar' },
                { t: 'typing', ms: 700 },
                { t: 'bot', msg: { done: 'Registrado! Vou te lembrar no dia do vencimento.' } },
                { t: 'result' }
            ],
            result: {
                kind: 'contas',
                bills: bills.map(b => ({ ...b, isNew: b.label === 'Conta de luz' }))
            }
        },
        {
            id: 'contas',
            chip: 'Contas',
            feature: 'contas_pagar',
            caption: 'Pergunte o que vence. A lista vem com o total, e dá para marcar como paga ali mesmo.',
            steps: [
                { t: 'type', text: 'contas da semana' },
                { t: 'send' },
                { t: 'typing', ms: 900 },
                {
                    t: 'bot',
                    msg: {
                        before: `${bills.length} contas nos próximos 7 dias, total ${brl(billsTotal)}`,
                        bills: bills.map(b => ({ when: ddmm(b.due), label: b.label, value: brl(b.value), dot: dot(b.due) })),
                        list: 'Marcar como paga'
                    }
                },
                { t: 'type', text: 'paguei o aluguel' },
                { t: 'send' },
                { t: 'typing', ms: 900 },
                { t: 'bot', msg: { done: 'Pronto: Aluguel da loja marcado como pago.' } },
                { t: 'result' }
            ],
            result: {
                kind: 'contas',
                bills: bills.map(b => ({ ...b, paid: b.label === 'Aluguel da loja' }))
            }
        },
        {
            id: 'resumo',
            chip: 'Resumo',
            feature: 'whatsapp',
            caption: 'Peça o resumo e veja quanto entrou e saiu no MEI e na casa, separados.',
            steps: [
                { t: 'type', text: 'resumo do mês' },
                { t: 'send' },
                { t: 'typing', ms: 1000 },
                {
                    t: 'bot',
                    msg: {
                        before: `Resumo de ${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`,
                        groups: [
                            { name: 'MEI', rows: [['Receitas', brl(6840)], ['Despesas', brl(2315.5)], ['Saldo', brl(4524.5)]] },
                            { name: 'Pessoal', rows: [['Receitas', brl(3000)], ['Despesas', brl(2410.9)], ['Saldo', brl(589.1)]] }
                        ]
                    }
                },
                { t: 'result' }
            ],
            result: { kind: 'resumo', month: monthName(today), in: 6840, out: 2315.5 }
        }
    ]
}
