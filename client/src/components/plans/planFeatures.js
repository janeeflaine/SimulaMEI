// Nome que o cliente entende para cada recurso do plano (as chaves vêm do painel admin).
// A ordem é a da comparação: do que mais pesa na escolha para o básico.
// Recursos fora desta lista não aparecem para o cliente.
export const FEATURE_LABELS = [
    ['whatsapp', 'Assistente no WhatsApp'],
    ['whatsapp_midia', 'Áudio, foto e PDF no WhatsApp'],
    ['contas_pagar', 'Contas a pagar com lembrete'],
    ['upload_faturas', 'Leitura de faturas com IA'],
    ['multi_carteiras', 'Várias carteiras (PF e MEI)'],
    ['transferencias', 'Transferência entre carteiras'],
    ['pdf', 'Relatórios em PDF'],
    ['historico', 'Histórico de simulações'],
    ['cartoes', 'Cartões de crédito'],
    ['categorias', 'Categorias personalizadas'],
    ['alertas', 'Alerta do limite anual do MEI'],
    ['comparativo', 'Comparativo MEI x ME']
]

/** "ouro", "prata" ou "gratuito", para a cor do cartão. */
export const tierOf = (planName) => {
    const name = String(planName || '').toLowerCase()
    if (name.includes('ouro')) return 'ouro'
    if (name.includes('prata')) return 'prata'
    return 'gratuito'
}

export const formatBRL = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)

/** Planos ativos do mais barato para o mais caro. */
export const sortPlans = (plans) =>
    [...plans].filter(p => p.isActive).sort((a, b) => Number(a.price) - Number(b.price))
