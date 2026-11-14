// CPF e CNPJ nas telas: máscara enquanto digita e conferência antes de enviar.
// O CNPJ aceita letras nas 12 primeiras posições (formato da Receita para
// inscrições novas desde 31/07/2026); as 2 últimas (dígitos verificadores)
// seguem números. O servidor confere de novo (server/utils/brDocument.js).

const mod11Digit = (values, weights) => {
    const rest = values.reduce((sum, v, i) => sum + v * weights[i], 0) % 11
    return rest < 2 ? 0 : 11 - rest
}

const isRepeated = (s) => /^(.)\1+$/.test(s)

export const cleanDocument = (value) => String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')

export const isValidCpf = (value) => {
    const s = cleanDocument(value)
    if (!/^\d{11}$/.test(s) || isRepeated(s)) return false
    const n = s.split('').map(Number)
    const d1 = mod11Digit(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
    const d2 = mod11Digit([...n.slice(0, 9), d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
    return d1 === n[9] && d2 === n[10]
}

export const isValidCnpj = (value) => {
    const s = cleanDocument(value)
    if (!/^[0-9A-Z]{12}\d{2}$/.test(s) || isRepeated(s)) return false
    const v = s.split('').map(c => c.charCodeAt(0) - 48)
    const d1 = mod11Digit(v.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    const d2 = mod11Digit([...v.slice(0, 12), d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return d1 === v[12] && d2 === v[13]
}

// Máscara enquanto digita. PF: 000.000.000-00. PJ: AA.AAA.AAA/AAAA-00
export const maskDocument = (value, accountType) => {
    if (accountType === 'PJ') {
        let s = ''
        for (const c of cleanDocument(value)) {
            if (s.length >= 14) break
            if (s.length < 12 || /\d/.test(c)) s += c
        }
        return s
            .replace(/^(.{2})(.)/, '$1.$2')
            .replace(/^(.{2}\..{3})(.)/, '$1.$2')
            .replace(/^(.{2}\..{3}\..{3})(.)/, '$1/$2')
            .replace(/^(.{2}\..{3}\..{3}\/.{4})(.)/, '$1-$2')
    }
    return cleanDocument(value).replace(/\D/g, '').slice(0, 11)
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2')
}

// Mensagem de erro do documento, ou '' quando está certo ou em branco (é opcional)
export const documentError = (value, accountType) => {
    const s = cleanDocument(value)
    if (!s) return ''
    if (accountType === 'PJ') {
        if (s.length !== 14) return 'O CNPJ tem 14 caracteres. Confira ou deixe em branco.'
        return isValidCnpj(s) ? '' : 'Esse CNPJ não é válido. Confira os números e letras ou deixe em branco.'
    }
    if (s.length !== 11) return 'O CPF tem 11 números. Confira ou deixe em branco.'
    return isValidCpf(s) ? '' : 'Esse CPF não é válido. Confira os números ou deixe em branco.'
}
