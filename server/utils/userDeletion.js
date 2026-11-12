/**
 * userDeletion.js — Exclusão definitiva de usuário e de todos os seus dados.
 *
 * Usado pela exclusão feita pelo admin (DELETE /api/admin/users/:id) e pela
 * exclusão feita pelo próprio titular (DELETE /api/auth/me), para que as duas
 * apaguem exatamente o mesmo conjunto de dados.
 */

// Ordem filho -> pai para respeitar as foreign keys
const USER_DATA_STATEMENTS = [
    'DELETE FROM finance_transactions WHERE "userId" = $1',
    'DELETE FROM invoice_items WHERE "userId" = $1',
    'DELETE FROM card_invoices WHERE "userId" = $1',
    'DELETE FROM invoice_uploads WHERE "userId" = $1',
    'DELETE FROM credit_cards WHERE "userId" = $1',
    'DELETE FROM finance_categories WHERE "userId" = $1',
    'DELETE FROM business_units WHERE "ownerId" = $1',
    'DELETE FROM user_alerts WHERE "userId" = $1',
    'DELETE FROM payments WHERE "userId" = $1',
    'DELETE FROM simulations WHERE "userId" = $1',
    'DELETE FROM user_sessions WHERE user_id = $1',
    'DELETE FROM admin_logs WHERE "userId" = $1',
    // WhatsApp: ids de mensagens do número, códigos e o vínculo
    'DELETE FROM whatsapp_events WHERE phone IN (SELECT phone FROM whatsapp_links WHERE "userId" = $1)',
    'DELETE FROM whatsapp_link_codes WHERE "userId" = $1',
    'DELETE FROM whatsapp_links WHERE "userId" = $1',
    // Desvincula referências que não pertencem ao usuário
    'UPDATE calculation_rules SET "updatedBy" = NULL WHERE "updatedBy" = $1',
    'UPDATE mei_limits SET "updatedBy" = NULL WHERE "updatedBy" = $1',
    // Registros de segurança são mantidos (Marco Civil, art. 15), sem vínculo com a conta
    'UPDATE audit_logs SET user_id = NULL WHERE user_id = $1',
    'DELETE FROM users WHERE id = $1'
]

/**
 * Apaga todos os dados do usuário. Deve ser chamado dentro de uma transação
 * (BEGIN/COMMIT) controlada por quem chama.
 * @param {object} client - client do pool já conectado
 * @param {number} userId
 */
async function deleteUserData(client, userId) {
    for (const statement of USER_DATA_STATEMENTS) {
        await client.query(statement, [userId])
    }
}

/**
 * Cancela a assinatura do Stripe, se ainda estiver ativa.
 * Lança erro se não for possível garantir o cancelamento, para que a conta
 * não seja apagada com uma cobrança recorrente ainda em andamento.
 * @param {string|null} subscriptionId
 * @returns {Promise<{ canceled: boolean, reason?: string }>}
 */
async function cancelStripeSubscriptionIfActive(subscriptionId) {
    if (!subscriptionId) return { canceled: false, reason: 'no_subscription' }

    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY não configurada; não é possível cancelar a assinatura.')
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

    let subscription
    try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId)
    } catch (err) {
        if (err && err.code === 'resource_missing') return { canceled: false, reason: 'not_found' }
        throw err
    }

    if (['canceled', 'incomplete_expired'].includes(subscription.status)) {
        return { canceled: false, reason: 'already_canceled' }
    }

    await stripe.subscriptions.cancel(subscriptionId)
    return { canceled: true }
}

module.exports = { deleteUserData, cancelStripeSubscriptionIfActive, USER_DATA_STATEMENTS }
