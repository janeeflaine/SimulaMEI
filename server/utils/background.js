/**
 * background.js — Continua um trabalho depois que a resposta HTTP já foi enviada.
 *
 * Na Vercel usa waitUntil (@vercel/functions), que mantém a função viva até a
 * promessa terminar (respeitando o maxDuration). Fora da Vercel (servidor local,
 * testes) a promessa simplesmente segue rodando no processo.
 */
let vercelWaitUntil = null
try {
    ({ waitUntil: vercelWaitUntil } = require('@vercel/functions'))
} catch (_) {
    vercelWaitUntil = null
}

function runInBackground(promise, label = 'background') {
    const safe = Promise.resolve(promise).catch(err => {
        console.error(`[${label}] erro:`, err && err.message ? err.message : err)
    })
    if (vercelWaitUntil) {
        try { vercelWaitUntil(safe) } catch (_) { /* fora do contexto de request da Vercel */ }
    }
    return safe
}

module.exports = { runInBackground }
