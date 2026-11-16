/**
 * Installment Category Memory Use Case
 *
 * Caso de uso para compras parceladas em faturas de cartão de crédito:
 * Quando o usuário classifica a categoria de uma compra parcelada, o sistema decora
 * qual a categoria aquela compra foi marcada na fatura anterior (ou na primeira fatura).
 * Sempre que o cliente enviar faturas novas contendo as parcelas seguintes, aquela
 * qualificação de categoria se repete automaticamente, sem precisar remarcar ou reclassificar.
 */

/**
 * Normaliza string removendo acentos e pontuações e convertendo para minúsculas.
 */
function normalizeString(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
}

/**
 * Tenta extrair detalhes de parcelamento (parcela atual e total de parcelas).
 * Suporta formatos:
 * - "2/10", "02/10", "2 / 10", "2 de 10"
 * - Na descrição: "MAGALU 02/10", "PARC 02/10", "PARCELA 02 DE 10", "(02/10)"
 *
 * @param {string} installmentStr
 * @param {string} descriptionStr
 * @returns {{ current: number, total: number, raw: string } | null}
 */
function parseInstallmentDetails(installmentStr, descriptionStr) {
    // 1. Campo installment direto
    if (typeof installmentStr === 'string' && installmentStr.trim()) {
        const m = installmentStr.trim().match(/^(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})$/i)
        if (m) {
            const current = parseInt(m[1], 10)
            const total = parseInt(m[2], 10)
            if (total > 1 && total <= 96 && current >= 1 && current <= total) {
                return { current, total, raw: `${current}/${total}` }
            }
        }
    }

    // 2. Extrai da descrição
    if (typeof descriptionStr === 'string' && descriptionStr.trim()) {
        const regexes = [
            /\(?\bparc(?:ela)?\.?\s*(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\b\)?/i,
            /\((\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\)/i,
            /\b(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\b/i
        ]

        for (const re of regexes) {
            const m = descriptionStr.match(re)
            if (m) {
                const current = parseInt(m[1], 10)
                const total = parseInt(m[2], 10)
                if (total > 1 && total <= 96 && current >= 1 && current <= total) {
                    return { current, total, raw: `${current}/${total}` }
                }
            }
        }
    }

    return null
}

/**
 * Limpa a descrição da compra removendo marcadores de parcelamento (ex: "02/10", "parc 2 de 10")
 * para obter o identificador base do estabelecimento / compra.
 *
 * @param {string} description
 * @returns {string}
 */
function cleanBaseDescription(description) {
    if (!description || typeof description !== 'string') return ''

    return description
        // Remove parcelamento com palavras como parc/parcela
        .replace(/\(?\bparc(?:ela)?\.?\s*\d{1,3}\s*(?:\/|de)\s*\d{1,3}\b\)?/gi, ' ')
        // Remove parênteses com (X/Y) ou (X de Y)
        .replace(/\(\d{1,3}\s*(?:\/|de)\s*\d{1,3}\)/gi, ' ')
        // Remove números no formato X/Y ou X de Y
        .replace(/\b\d{1,3}\s*(?:\/|de)\s*\d{1,3}\b/gi, ' ')
        // Remove marcadores soltos de parcela (ex: "PARC 02")
        .replace(/\bparc(?:ela)?\.?\s*\d{1,3}\b/gi, ' ')
        // Normaliza texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

/**
 * Confere se duas descrições base representam o mesmo estabelecimento / compra.
 */
function isDescriptionMatch(descA, descB) {
    if (!descA || !descB) return false
    if (descA === descB) return true

    // Prefixo compartilhado
    if (descA.startsWith(descB) || descB.startsWith(descA)) return true

    // Compara palavras-chave principais
    const wordsA = descA.split(' ').filter(Boolean)
    const wordsB = descB.split(' ').filter(Boolean)

    if (wordsA.length >= 2 && wordsB.length >= 2) {
        if (wordsA[0] === wordsB[0] && wordsA[1] === wordsB[1]) {
            return true
        }
    }

    if (wordsA.length >= 1 && wordsB.length >= 1 && wordsA[0] === wordsB[0]) {
        // Se a primeira palavra for um nome forte de loja (ex: magalu, mercadolivre, casasbahia)
        if (wordsA[0].length >= 4) return true
    }

    return false
}

/**
 * Busca na lista de compras anteriores uma parcela correspondente da mesma compra.
 *
 * @param {object} params
 * @param {object} params.item - Item novo da fatura
 * @param {Array<object>} params.candidates - Itens anteriores classificados
 * @param {string} [params.targetCategoryType] - Tipo de categoria esperado (DESPESA_MEI / DESPESA_PESSOAL)
 * @returns {object | null}
 */
function findMatchingInstallmentCategory({ item, candidates, targetCategoryType }) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null

    const inst = parseInstallmentDetails(item.installment, item.description)
    if (!inst) return null

    const baseDesc = cleanBaseDescription(item.description)
    if (!baseDesc) return null

    const itemAmount = Math.abs(Number(item.amount))
    if (!Number.isFinite(itemAmount) || itemAmount === 0) return null

    for (const candidate of candidates) {
        if (!candidate.categoryId) continue

        // Se especificado tipo da categoria, confere compatibilidade
        if (targetCategoryType && candidate.categoryType && candidate.categoryType !== targetCategoryType) {
            continue
        }

        const candInst = parseInstallmentDetails(candidate.installment, candidate.description)
        if (!candInst) continue

        // 1. Mesmo total de parcelas (ex: ambas em 10x ou 12x)
        if (candInst.total !== inst.total) continue

        // 2. Mesma descrição base do estabelecimento
        const candBase = cleanBaseDescription(candidate.description)
        if (!isDescriptionMatch(baseDesc, candBase)) continue

        // 3. Valor da parcela compatível (permite variação de até R$ 1,00 para arredondamentos)
        const candAmount = Math.abs(Number(candidate.amount))
        if (Math.abs(candAmount - itemAmount) > 1.00) continue

        // Encontrou a parcela anterior classificada!
        return {
            categoryId: candidate.categoryId,
            categoryName: candidate.categoryName,
            categoryType: candidate.categoryType,
            matchedItemId: candidate.id,
            previousInstallment: candInst.raw,
            currentInstallment: inst.raw
        }
    }

    return null
}

/**
 * Aplica o caso de uso de memória de parcelas na lista de itens da fatura recebida.
 *
 * @param {object} params
 * @param {Array<object>} params.items - Lista de itens da fatura
 * @param {number} params.userId - ID do usuário
 * @param {number} params.cardId - ID do cartão
 * @param {string} params.categoryType - 'DESPESA_MEI' ou 'DESPESA_PESSOAL'
 * @param {object} params.client - Conexão ativa com o banco PostgreSQL
 * @param {number} [params.currentInvoiceId] - ID da fatura atual (para ignorar os próprios itens)
 * @returns {Promise<{ items: Array<object>, memorizedCount: number }>}
 */
async function applyInstallmentCategoryMemory({ items, userId, cardId, categoryType, client, currentInvoiceId = null }) {
    if (!Array.isArray(items) || items.length === 0) {
        return { items: items || [], memorizedCount: 0 }
    }

    // Normaliza campo installment se presente na descrição
    for (const item of items) {
        const inst = parseInstallmentDetails(item.installment, item.description)
        if (inst && !item.installment) {
            item.installment = inst.raw
        }
    }

    const installmentItems = items.filter(item => !!parseInstallmentDetails(item.installment, item.description))
    if (installmentItems.length === 0) {
        return { items, memorizedCount: 0 }
    }

    // Busca compras anteriores deste usuário que já possuam categoria classificada
    // Prioriza o mesmo cartão, ordenadas das mais recentes para as mais antigas
    const { rows: candidates } = await client.query(
        `SELECT ii.id, ii.description, ii.amount, ii.installment, ii."categoryId",
                ii."transactionDate", ci."cardId", fc.name as "categoryName", fc.type as "categoryType"
         FROM invoice_items ii
         JOIN card_invoices ci ON ci.id = ii."invoiceId"
         JOIN finance_categories fc ON fc.id = ii."categoryId"
         WHERE ii."userId" = $1
           AND ci."cardId" = $2
           AND ii."categoryId" IS NOT NULL
           AND ($3::int IS NULL OR ii."invoiceId" != $3)
         ORDER BY ii."transactionDate" DESC NULLS LAST, ii.id DESC`,
        [userId, cardId, currentInvoiceId]
    )

    let memorizedCount = 0
    const workingCandidates = [...candidates]

    for (const item of items) {
        // Se já tiver categoria definida (ex: por regra de palavras-chave IOF/Multa/Juros), preserva
        if (item.categoryId) continue

        const match = findMatchingInstallmentCategory({
            item,
            candidates: workingCandidates,
            targetCategoryType: categoryType
        })

        if (match) {
            item.categoryId = match.categoryId
            item.category = match.categoryName
            item.aiCategory = match.categoryName
            item.categoryName = match.categoryName
            item.confidence = 1.0
            item.memorizedFromInstallment = true

            memorizedCount++

            // Adiciona este item aos workingCandidates para que outras parcelas do mesmo lote também herdem
            workingCandidates.unshift({
                id: item.id || null,
                description: item.description,
                amount: item.amount,
                installment: item.installment,
                categoryId: match.categoryId,
                categoryName: match.categoryName,
                categoryType: match.categoryType
            })
        }
    }

    return { items, memorizedCount }
}

module.exports = {
    parseInstallmentDetails,
    cleanBaseDescription,
    isDescriptionMatch,
    findMatchingInstallmentCategory,
    applyInstallmentCategoryMemory
}
