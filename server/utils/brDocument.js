/**
 * CPF e CNPJ: limpa, confere os dígitos verificadores e devolve com máscara.
 *
 * O CNPJ aceita o formato alfanumérico da Receita (novas inscrições desde
 * 31/07/2026): as 12 primeiras posições podem ter letras, as 2 últimas (DV)
 * seguem números. O DV usa módulo 11 com o valor de cada caractere = código
 * ASCII − 48, regra que vale igual para o CNPJ só com números.
 */

// Tira pontos, traços, barras e espaços; letras em maiúscula
const cleanDocument = (value) => String(value ?? '').replace(/[\s./-]/g, '').toUpperCase()

const isRepeated = (s) => /^(.)\1+$/.test(s)

const mod11Digit = (values, weights) => {
    const sum = values.reduce((acc, v, i) => acc + v * weights[i], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
}

const isValidCpf = (value) => {
    const s = cleanDocument(value)
    if (!/^\d{11}$/.test(s) || isRepeated(s)) return false
    const n = s.split('').map(Number)
    const d1 = mod11Digit(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
    const d2 = mod11Digit([...n.slice(0, 9), d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
    return d1 === n[9] && d2 === n[10]
}

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

const isValidCnpj = (value) => {
    const s = cleanDocument(value)
    if (!/^[0-9A-Z]{12}\d{2}$/.test(s) || isRepeated(s)) return false
    const v = s.split('').map(c => c.charCodeAt(0) - 48)
    const d1 = mod11Digit(v.slice(0, 12), CNPJ_W1)
    const d2 = mod11Digit([...v.slice(0, 12), d1], CNPJ_W2)
    return d1 === v[12] && d2 === v[13]
}

const formatCpf = (value) => cleanDocument(value).replace(/^(.{3})(.{3})(.{3})(.{2})$/, '$1.$2.$3-$4')
const formatCnpj = (value) => cleanDocument(value).replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')

module.exports = { cleanDocument, isValidCpf, isValidCnpj, formatCpf, formatCnpj }
