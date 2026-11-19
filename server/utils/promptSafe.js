/**
 * promptSafe.js — textos da própria pessoa que entram no pedido a uma IA
 * (nomes de categoria e de carteira, o nome dela).
 *
 * Esses textos vão como DADOS. Um texto com quebra de linha, aspas, crase, chaves,
 * sinais de maior/menor ou barra invertida, ou comprido demais, fica de fora em vez
 * de ser alterado: um nome alterado não casaria mais com o que está salvo. Antes os
 * nomes entravam crus e dava para escrever ordens para a IA dentro deles
 * (leitura de fatura e agente do WhatsApp).
 */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029`{}<>"\\]/

/** Um nome seguro (sem espaços nas pontas) ou '' se não puder entrar */
function safePromptName(value, maxLength = 40) {
    if (typeof value !== 'string') return ''
    const name = value.trim()
    if (!name || name.length > maxLength || UNSAFE_CHARS.test(name)) return ''
    return name
}

/** Lista de nomes seguros, sem repetidos (maiúsculas/minúsculas), no máximo `max` */
function safePromptNames(names, { max = 60, maxLength = 40 } = {}) {
    const seen = new Set()
    const out = []
    for (const raw of Array.isArray(names) ? names : []) {
        const name = safePromptName(raw, maxLength)
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(name)
        if (out.length >= max) break
    }
    return out
}

module.exports = { safePromptName, safePromptNames, UNSAFE_CHARS }
