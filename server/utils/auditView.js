/**
 * Leitura dos registros de auditoria para a tela do admin (Logs de auditoria).
 *
 * Os registros antigos podem ter valores que não deveriam aparecer: até 15/11/2026
 * a rota de Configurações gravava o valor de qualquer chave (inclusive tokens) e a
 * edição de conta gravava nome e e-mail. Aqui esses valores são escondidos na hora
 * de mostrar; o banco não é alterado.
 */
const SECRET_KEY = /token|secret|senha|password|passwd|apikey|api_key|private|webhook|credential|_key$|^key$/i
const SECRET_VALUE = /^(sk|rk|pk)_(live|test)_|^whsec_|^EAA[A-Za-z0-9]{20,}|^APP_USR-|^TEST-[0-9a-f-]{20,}|^re_[A-Za-z0-9]{16,}|^AIza[0-9A-Za-z_-]{20,}|^Bearer\s/
const PERSONAL_KEYS = new Set(['name', 'email', 'nome', 'cpf', 'phone', 'telefone'])

function parse(text) {
    if (text === null || text === undefined || text === '') return null
    try { return JSON.parse(text) } catch (_) { return String(text) }
}

// Esconde segredos (pelo nome da chave ou pela cara do valor) e, nas mudanças,
// os dados pessoais
function mask(value, { personal = false, depth = 0 } = {}) {
    if (depth > 6) return '(…)'
    if (typeof value === 'string') return SECRET_VALUE.test(value.trim()) ? '(secreto)' : value
    if (Array.isArray(value)) return value.map((v) => mask(v, { personal, depth: depth + 1 }))
    if (value && typeof value === 'object') {
        const out = {}
        for (const [k, v] of Object.entries(value)) {
            if (SECRET_KEY.test(k)) out[k] = '(secreto)'
            else if (personal && PERSONAL_KEYS.has(k.toLowerCase()) && v !== '(alterado)') out[k] = '(alterado)'
            else out[k] = mask(v, { personal, depth: depth + 1 })
        }
        return out
    }
    return value
}

function detailOf(row) {
    // Configuração com nome de segredo: nenhum valor aparece (registro antigo guardava o valor)
    const secretSetting = row.event_type === 'SETTINGS_UPDATED' && SECRET_KEY.test(String(row.resource_id || ''))
    const change = (text) => (secretSetting ? (text == null ? null : '(secreto)') : mask(parse(text), { personal: true }))
    return {
        id: row.id,
        timestamp: row.timestamp,
        level: row.level,
        event_type: row.event_type,
        user_id: row.user_id,
        user_role: row.user_role,
        user_name: row.user_name || null,
        user_email: row.user_email || null,
        ip_address: row.ip_address || null,
        user_agent: row.user_agent || null,
        device_fingerprint: row.device_fingerprint || null,
        resource_type: row.resource_type || null,
        resource_id: row.resource_id || null,
        target_name: row.target_name || null,
        old_value: change(row.old_value),
        new_value: change(row.new_value),
        metadata: mask(parse(row.metadata)),
    }
}

module.exports = { mask, detailOf, SECRET_KEY }
