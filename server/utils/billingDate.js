/**
 * Calcula a data de cobrança (billing_date) de uma compra no cartão de crédito.
 *
 * Regra (padrão brasileiro):
 * - Se dia da compra <= closingDay → fatura fecha neste mês, compra cai nesta fatura.
 * - Se dia da compra > closingDay  → fatura já virou, compra cai na fatura do mês seguinte.
 * 
 * A data de vencimento (billing_date) é então calculada considerando:
 * - Se dueDay >= closingDay → vencimento no mesmo mês do fechamento.
 * - Se dueDay <  closingDay → vencimento no mês seguinte ao fechamento.
 *
 * @param {string|Date} purchaseDate - Data da compra (YYYY-MM-DD)
 * @param {number} closingDay - Dia de fechamento da fatura (1-31)
 * @param {number} dueDay - Dia de vencimento da fatura (1-31)
 * @returns {string} billing_date no formato YYYY-MM-DD
 */
function calculateBillingDate(purchaseDate, closingDay, dueDay) {
    // Normalizar inputs
    closingDay = parseInt(closingDay, 10)
    dueDay = parseInt(dueDay, 10)

    const dateStr = typeof purchaseDate === 'string' ? purchaseDate.substring(0, 10) : purchaseDate.toISOString().substring(0, 10)
    const purchase = new Date(dateStr + 'T12:00:00') // meio-dia para evitar timezone shift

    const purchaseDayOfMonth = purchase.getDate()
    let billingMonth = purchase.getMonth()  // 0-indexed
    let billingYear = purchase.getFullYear()

    // Passo 1: Determinar em qual ciclo de fatura a compra cai
    if (purchaseDayOfMonth > closingDay) {
        // Compra DEPOIS do fechamento → cai na fatura do mês seguinte
        billingMonth += 1
        if (billingMonth > 11) {
            billingMonth = 0   // Janeiro
            billingYear += 1   // Próximo ano
        }
    }
    // Se purchaseDayOfMonth <= closingDay, fica no mês atual

    // Passo 2: Se o dia de vencimento é MENOR que o dia de fechamento,
    // o vencimento real ocorre no mês SEGUINTE ao do fechamento.
    // Ex: fecha dia 25, vence dia 5 → vencimento é no mês seguinte.
    // Nota: quando closingDay == dueDay, o vencimento é no MESMO mês.
    if (dueDay < closingDay) {
        billingMonth += 1
        if (billingMonth > 11) {
            billingMonth = 0
            billingYear += 1
        }
    }

    // Passo 3: Ajustar para meses com menos dias (ex: fev 28/29)
    const maxDay = new Date(billingYear, billingMonth + 1, 0).getDate()
    const finalDay = Math.min(dueDay, maxDay)

    const mm = String(billingMonth + 1).padStart(2, '0')
    const dd = String(finalDay).padStart(2, '0')
    return `${billingYear}-${mm}-${dd}`
}

module.exports = { calculateBillingDate }
