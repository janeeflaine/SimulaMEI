/**
 * userFields.js — conferência de nome e e-mail de conta, igual à do cadastro
 * (auth.routes). Usada pelo admin ao editar uma conta.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// E-mail sempre minúsculo e sem espaços, até 254 caracteres
const cleanEmail = (v) => {
    if (typeof v !== 'string') return null
    const e = v.trim().toLowerCase()
    return e.length <= 254 && EMAIL_RE.test(e) ? e : null
}

// Nome de 2 a 80 letras, sem caracteres de controle
const cleanName = (v) => {
    if (typeof v !== 'string') return null
    // eslint-disable-next-line no-control-regex
    const n = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    return n.length >= 2 && n.length <= 80 ? n : null
}

// Id de conta na URL: inteiro positivo escrito só com números ("12abc" não vale)
const toUserId = (v) => (/^[1-9][0-9]{0,9}$/.test(String(v)) ? Number(v) : null)

module.exports = { cleanEmail, cleanName, toUserId }
