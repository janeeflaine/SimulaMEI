/**
 * planLimits.js — limites de uso por plano, guardados em system_settings
 * como "<chave>_<id do plano>". Fonte única dos padrões e da conferência
 * (antes cada tela gravava qualquer texto, e "abc" virava "sem limite").
 * 0 = sem limite nos números.
 */
const WHATSAPP_NUMBERS_DEFAULT = { 1: 1, 2: 3, 3: 4 }

const LIMITS = [
    { key: 'transaction_limit', label: 'Lançamentos por mês', type: 'int', max: 100000, def: () => 0 },
    { key: 'wallet_limit', label: 'Carteiras no total', type: 'int', max: 1000, def: () => 2 },
    { key: 'wallet_pf_limit', label: 'Carteiras pessoais', type: 'int', max: 1000, def: () => 1 },
    { key: 'wallet_pj_limit', label: 'Carteiras do MEI', type: 'int', max: 1000, def: () => 1 },
    { key: 'whatsapp_numbers', label: 'Números de WhatsApp', type: 'int', max: 50, def: (planId) => WHATSAPP_NUMBERS_DEFAULT[planId] ?? 1 },
    { key: 'invoice_upload_limit', label: 'Leituras de fatura com IA por dia', type: 'int', max: 1000, def: () => 20 },
    { key: 'single_device', label: 'Um aparelho por vez', type: 'bool', def: () => false },
]
const BY_KEY = Object.fromEntries(LIMITS.map(l => [l.key, l]))

/** "wallet_pf_limit_3" -> { def, planId: 3 } ; null se não for chave de limite */
function parseLimitKey(settingKey) {
    const m = /^([a-z_]+)_(\d{1,9})$/.exec(String(settingKey || ''))
    if (!m || !BY_KEY[m[1]]) return null
    return { def: BY_KEY[m[1]], planId: Number(m[2]) }
}

/** Valor conferido em texto para gravar, ou null se inválido */
function cleanLimitValue(def, value) {
    if (def.type === 'bool') {
        if (value === true || value === 'true') return 'true'
        if (value === false || value === 'false') return 'false'
        return null
    }
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > def.max) return null
    return String(n)
}

/** Valor efetivo (o gravado, se válido; senão o padrão) */
function readLimitValue(def, raw, planId) {
    if (raw === undefined || raw === null) return def.def(planId)
    const clean = cleanLimitValue(def, raw)
    if (clean === null) return def.def(planId)
    return def.type === 'bool' ? clean === 'true' : Number(clean)
}

module.exports = { LIMITS, parseLimitKey, cleanLimitValue, readLimitValue, WHATSAPP_NUMBERS_DEFAULT }
