/**
 * Invoice Keywords Classifier Use Case
 *
 * Regra de negócio para classificação automática de itens de fatura por palavras-chave:
 * Sempre que na fatura vierem as palavras: IOF, Multa, Juros:
 * 1. Se o usuário já possuir uma categoria de "Multas", "Multa" ou "Juros", classifica em uma delas.
 * 2. Se o usuário já possuir "Juros e Multas", classifica nela.
 * 3. Se a conta ainda não possuir nenhuma dessas categorias, cria a categoria "Juros e Multas"
 *    na carteira correspondente (DESPESA_MEI para cartões PJ ou DESPESA_PESSOAL para cartões PF)
 *    e classifica o item nela.
 */

// Palavras-chave: IOF, Multa, Multas, Juros (com limites de palavras)
const FEE_KEYWORDS_REGEX = /\b(iof|multas?|juros)\b/i

const normalizeString = (str) =>
    String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()

/**
 * Verifica se a descrição do item contém as palavras-chave financeiras (IOF, Multa, Juros).
 * @param {string} description
 * @returns {boolean}
 */
function hasFeeKeyword(description) {
    if (!description || typeof description !== 'string') return false
    const clean = normalizeString(description)
    return FEE_KEYWORDS_REGEX.test(clean)
}

/**
 * Confere se o nome da categoria corresponde a "Juros e Multas" (ou variações como "Juros/Multas").
 */
function isJurosEMultasCategory(name) {
    const clean = normalizeString(name)
    return clean === 'juros e multas' || /^juros\s*(&|e|\/)\s*multas?$/i.test(clean)
}

/**
 * Confere se o nome da categoria é "Juros".
 */
function isJurosCategory(name) {
    const clean = normalizeString(name)
    return clean === 'juros'
}

/**
 * Confere se o nome da categoria é "Multa" ou "Multas".
 */
function isMultasCategory(name) {
    const clean = normalizeString(name)
    return clean === 'multa' || clean === 'multas'
}

/**
 * Resolve qual categoria existente deve ser usada para o item com base nas regras:
 * - Se já tiver "Juros e Multas", usa ela.
 * - Se tiver uma das três ("Multas", "Multa", "Juros"), classifica em uma delas.
 * - Se não tiver nenhuma, retorna null (indicando necessidade de criar "Juros e Multas").
 *
 * @param {Array<{id: number, name: string, type: string}>} categories
 * @param {string} description
 * @returns {{id: number, name: string, type: string} | null}
 */
function resolveCategoryForFeeItem(categories, description) {
    if (!Array.isArray(categories) || categories.length === 0) return null

    // 1. Se já tem "Juros e Multas", usa direto
    const jurosEMultas = categories.find(c => isJurosEMultasCategory(c.name))
    if (jurosEMultas) return jurosEMultas

    // 2. Se tiver "Multas", "Multa" ou "Juros", classifica em uma delas
    const juros = categories.find(c => isJurosCategory(c.name))
    const multas = categories.find(c => isMultasCategory(c.name))

    if (juros || multas) {
        const descClean = normalizeString(description)
        const hasMultaWord = /\bmultas?\b/i.test(descClean)
        const hasJurosWord = /\bjuros\b/i.test(descClean)

        if (hasMultaWord && !hasJurosWord && multas) return multas
        if (hasJurosWord && !hasMultaWord && juros) return juros
        // Se for IOF ou ambos presentes, prioriza Juros se existir, senão Multas
        return juros || multas
    }

    return null
}

/**
 * Aplica o caso de uso de palavras-chave sobre a lista de itens da fatura.
 * Cria a categoria "Juros e Multas" caso o usuário ainda não a possua nem possua Juros/Multa.
 *
 * @param {object} params
 * @param {Array<object>} params.items - Itens extraídos da fatura
 * @param {number} params.userId - ID do usuário
 * @param {string} params.categoryType - 'DESPESA_MEI' ou 'DESPESA_PESSOAL'
 * @param {object} params.client - Cliente de conexão PostgreSQL (transação aberta)
 * @returns {Promise<{ items: Array<object>, createdCategories: Array<object> }>}
 */
async function applyInvoiceKeywordRules({ items, userId, categoryType, client }) {
    if (!Array.isArray(items) || items.length === 0) {
        return { items: items || [], createdCategories: [] }
    }

    const feeItems = items.filter(item => hasFeeKeyword(item.description))
    if (feeItems.length === 0) {
        return { items, createdCategories: [] }
    }

    // Busca categorias existentes do usuário para a carteira correspondente
    const { rows: existingCats } = await client.query(
        'SELECT id, name, type FROM finance_categories WHERE "userId" = $1 AND type = $2',
        [userId, categoryType]
    )

    const categories = [...existingCats]
    const createdCategories = []

    for (const item of items) {
        if (!hasFeeKeyword(item.description)) continue

        let targetCategory = resolveCategoryForFeeItem(categories, item.description)

        if (!targetCategory) {
            // Conta ainda não possui categoria compatível: cria "Juros e Multas"
            // Verifica antes para evitar duplicação em caso de concorrência
            const check = await client.query(
                'SELECT id, name, type FROM finance_categories WHERE "userId" = $1 AND type = $2 AND LOWER(TRIM(name)) = LOWER($3) LIMIT 1',
                [userId, categoryType, 'Juros e Multas']
            )

            if (check.rows.length > 0) {
                targetCategory = check.rows[0]
            } else {
                const { rows: [newCat] } = await client.query(
                    `INSERT INTO finance_categories ("userId", name, type)
                     VALUES ($1, 'Juros e Multas', $2)
                     RETURNING id, name, type`,
                    [userId, categoryType]
                )
                targetCategory = newCat
                createdCategories.push(newCat)
            }

            categories.push(targetCategory)
        }

        // Atribui categoria ao item
        item.categoryId = targetCategory.id
        item.category = targetCategory.name
        item.aiCategory = targetCategory.name
        item.categoryName = targetCategory.name
        item.confidence = 1.0
    }

    return { items, createdCategories }
}

module.exports = {
    FEE_KEYWORDS_REGEX,
    hasFeeKeyword,
    isJurosEMultasCategory,
    isJurosCategory,
    isMultasCategory,
    resolveCategoryForFeeItem,
    applyInvoiceKeywordRules
}
