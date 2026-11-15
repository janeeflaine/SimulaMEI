/**
 * planFeatures.js — recursos que um plano pode liberar (as chaves que o servidor
 * confere com featureGuard/hasFeature). O painel do admin só aceita estas chaves.
 * Ao criar um recurso novo no site, acrescente aqui e em client/src/components/plans/planFeatures.js.
 */
const FEATURE_KEYS = [
    'comparativo', 'alertas', 'categorias', 'cartoes', 'historico', 'pdf',
    'contas_pagar', 'transferencias', 'multi_carteiras', 'upload_faturas',
    'whatsapp', 'whatsapp_midia',
]

module.exports = { FEATURE_KEYS }
