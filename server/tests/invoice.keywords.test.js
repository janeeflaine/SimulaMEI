const {
    hasFeeKeyword,
    isJurosEMultasCategory,
    isJurosCategory,
    isMultasCategory,
    resolveCategoryForFeeItem,
    applyInvoiceKeywordRules
} = require('../utils/invoiceKeywords')

describe('Invoice Keywords Classifier', () => {
    describe('hasFeeKeyword', () => {
        test('identifica variações de IOF', () => {
            expect(hasFeeKeyword('IOF')).toBe(true)
            expect(hasFeeKeyword('iof')).toBe(true)
            expect(hasFeeKeyword('IOF DIARIO')).toBe(true)
            expect(hasFeeKeyword('IOF ROTATIVO')).toBe(true)
            expect(hasFeeKeyword('IOF-PARCELAMENTO')).toBe(true)
            expect(hasFeeKeyword('IOF COMPRA EXTERIOR')).toBe(true)
        })

        test('identifica variações de Multa e Multas', () => {
            expect(hasFeeKeyword('Multa')).toBe(true)
            expect(hasFeeKeyword('MULTA')).toBe(true)
            expect(hasFeeKeyword('multa')).toBe(true)
            expect(hasFeeKeyword('Multas')).toBe(true)
            expect(hasFeeKeyword('MULTAS')).toBe(true)
            expect(hasFeeKeyword('MULTA POR ATRASO')).toBe(true)
            expect(hasFeeKeyword('MULTA CONTRATUAL')).toBe(true)
            expect(hasFeeKeyword('MULTA/ENCARGOS')).toBe(true)
        })

        test('identifica variações de Juros', () => {
            expect(hasFeeKeyword('Juros')).toBe(true)
            expect(hasFeeKeyword('JUROS')).toBe(true)
            expect(hasFeeKeyword('juros')).toBe(true)
            expect(hasFeeKeyword('Júros')).toBe(true)
            expect(hasFeeKeyword('JUROS DE MORA')).toBe(true)
            expect(hasFeeKeyword('JUROS ROTATIVO')).toBe(true)
            expect(hasFeeKeyword('JUROS/MULTA')).toBe(true)
            expect(hasFeeKeyword('ENCARGOS JUROS')).toBe(true)
        })

        test('não confunde palavras normais que contêm partes das letras', () => {
            expect(hasFeeKeyword('BIOFARMACIA')).toBe(false)
            expect(hasFeeKeyword('CURSO SIMULTANEO')).toBe(false)
            expect(hasFeeKeyword('QUEIJOS FINOS')).toBe(false)
            expect(hasFeeKeyword('MERCADO LIVRE')).toBe(false)
            expect(hasFeeKeyword('UBER *TRIP')).toBe(false)
            expect(hasFeeKeyword('')).toBe(false)
            expect(hasFeeKeyword(null)).toBe(false)
            expect(hasFeeKeyword(undefined)).toBe(false)
        })
    })

    describe('resolveCategoryForFeeItem', () => {
        test('retorna Juros e Multas se o usuário já possui', () => {
            const categories = [
                { id: 1, name: 'Alimentação', type: 'DESPESA_PESSOAL' },
                { id: 2, name: 'Juros e Multas', type: 'DESPESA_PESSOAL' }
            ]
            const resolved = resolveCategoryForFeeItem(categories, 'IOF DIARIO')
            expect(resolved).toEqual({ id: 2, name: 'Juros e Multas', type: 'DESPESA_PESSOAL' })
        })

        test('se possui apenas Juros, classifica em Juros sem criar nova categoria', () => {
            const categories = [
                { id: 1, name: 'Alimentação', type: 'DESPESA_MEI' },
                { id: 5, name: 'Juros', type: 'DESPESA_MEI' }
            ]
            expect(resolveCategoryForFeeItem(categories, 'IOF DIARIO')).toEqual(categories[1])
            expect(resolveCategoryForFeeItem(categories, 'MULTA ATRASO')).toEqual(categories[1])
            expect(resolveCategoryForFeeItem(categories, 'JUROS DE MORA')).toEqual(categories[1])
        })

        test('se possui apenas Multas ou Multa, classifica nela sem criar nova categoria', () => {
            const categoriesMultas = [
                { id: 1, name: 'Transporte', type: 'DESPESA_PESSOAL' },
                { id: 8, name: 'Multas', type: 'DESPESA_PESSOAL' }
            ]
            expect(resolveCategoryForFeeItem(categoriesMultas, 'IOF')).toEqual(categoriesMultas[1])
            expect(resolveCategoryForFeeItem(categoriesMultas, 'JUROS MORA')).toEqual(categoriesMultas[1])

            const categoriesMulta = [
                { id: 9, name: 'Multa', type: 'DESPESA_PESSOAL' }
            ]
            expect(resolveCategoryForFeeItem(categoriesMulta, 'MULTA POR ATRASO')).toEqual(categoriesMulta[0])
        })

        test('se possui tanto Juros quanto Multas, direciona conforme a palavra ou escolhe uma delas', () => {
            const categories = [
                { id: 10, name: 'Juros', type: 'DESPESA_MEI' },
                { id: 11, name: 'Multas', type: 'DESPESA_MEI' }
            ]
            expect(resolveCategoryForFeeItem(categories, 'MULTA POR ATRASO')).toEqual(categories[1])
            expect(resolveCategoryForFeeItem(categories, 'JUROS DE MORA')).toEqual(categories[0])
            // IOF direciona para uma delas existente
            expect(['Juros', 'Multas']).toContain(resolveCategoryForFeeItem(categories, 'IOF').name)
        })

        test('retorna null se a conta não possui nenhuma categoria correspondente', () => {
            const categories = [
                { id: 1, name: 'Alimentação', type: 'DESPESA_MEI' },
                { id: 2, name: 'Combustível', type: 'DESPESA_MEI' }
            ]
            expect(resolveCategoryForFeeItem(categories, 'IOF')).toBeNull()
            expect(resolveCategoryForFeeItem(categories, 'MULTA')).toBeNull()
            expect(resolveCategoryForFeeItem(categories, 'JUROS')).toBeNull()
        })
    })

    describe('applyInvoiceKeywordRules', () => {
        let mockClient
        let queries

        beforeEach(() => {
            queries = []
            mockClient = {
                query: jest.fn(async (sql, params = []) => {
                    queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
                    if (sql.includes('SELECT id, name, type FROM finance_categories WHERE "userId" = $1 AND type = $2 AND LOWER')) {
                        return { rows: [] }
                    }
                    if (sql.startsWith('INSERT INTO finance_categories')) {
                        return { rows: [{ id: 99, name: params[1], type: params[2] }] }
                    }
                    return { rows: [] }
                })
            }
        })

        test('não altera itens comuns e não consulta banco se não houver palavras-chave', async () => {
            const items = [
                { description: 'MERCADO CENTRAL', amount: 50, category: 'Alimentação' },
                { description: 'POSTO IPIRANGA', amount: 100, category: 'Transporte' }
            ]

            const result = await applyInvoiceKeywordRules({
                items,
                userId: 1,
                categoryType: 'DESPESA_MEI',
                client: mockClient
            })

            expect(result.createdCategories).toHaveLength(0)
            expect(mockClient.query).not.toHaveBeenCalled()
            expect(result.items[0].categoryId).toBeUndefined()
        })

        test('cria categoria "Juros e Multas" e classifica quando usuário não possui', async () => {
            // Mock: usuário só tem "Alimentação"
            mockClient.query.mockImplementation(async (sql, params = []) => {
                queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
                if (sql.includes('SELECT id, name, type FROM finance_categories WHERE "userId" = $1 AND type = $2 AND LOWER')) {
                    return { rows: [] }
                }
                if (sql.includes('SELECT id, name, type FROM finance_categories WHERE "userId" = $1 AND type = $2')) {
                    return { rows: [{ id: 1, name: 'Alimentação', type: 'DESPESA_MEI' }] }
                }
                if (sql.startsWith('INSERT INTO finance_categories')) {
                    return { rows: [{ id: 77, name: 'Juros e Multas', type: 'DESPESA_MEI' }] }
                }
                return { rows: [] }
            })

            const items = [
                { description: 'COMPRA LOJA', amount: 120, category: 'Outros' },
                { description: 'IOF DIARIO', amount: 4.5, category: 'Outros' },
                { description: 'MULTA POR ATRASO', amount: 15.0, category: 'Outros' },
                { description: 'JUROS DE MORA', amount: 8.2, category: 'Outros' }
            ]

            const result = await applyInvoiceKeywordRules({
                items,
                userId: 1,
                categoryType: 'DESPESA_MEI',
                client: mockClient
            })

            expect(result.createdCategories).toHaveLength(1)
            expect(result.createdCategories[0]).toEqual({ id: 77, name: 'Juros e Multas', type: 'DESPESA_MEI' })

            // A categoria só deve ter sido criada UMA vez para os três itens de taxas
            const insertCalls = queries.filter(q => q.sql.startsWith('INSERT INTO finance_categories'))
            expect(insertCalls).toHaveLength(1)

            // Item comum permaneceu intacto
            expect(items[0].categoryId).toBeUndefined()
            expect(items[0].category).toBe('Outros')

            // Todos os itens de taxas foram classificados como Juros e Multas
            expect(items[1].categoryId).toBe(77)
            expect(items[1].category).toBe('Juros e Multas')
            expect(items[1].aiCategory).toBe('Juros e Multas')
            expect(items[1].confidence).toBe(1.0)

            expect(items[2].categoryId).toBe(77)
            expect(items[2].category).toBe('Juros e Multas')

            expect(items[3].categoryId).toBe(77)
            expect(items[3].category).toBe('Juros e Multas')
        })

        test('não cria categoria se usuário já tem "Juros"', async () => {
            mockClient.query.mockImplementation(async (sql, params = []) => {
                queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
                if (sql.includes('SELECT id, name, type FROM finance_categories WHERE "userId" = $1 AND type = $2')) {
                    return { rows: [{ id: 33, name: 'Juros', type: 'DESPESA_PESSOAL' }] }
                }
                return { rows: [] }
            })

            const items = [
                { description: 'IOF COMPRA INTERNACIONAL', amount: 12.5, category: 'Outros' },
                { description: 'MULTA DE MORA', amount: 6.0, category: 'Outros' }
            ]

            const result = await applyInvoiceKeywordRules({
                items,
                userId: 2,
                categoryType: 'DESPESA_PESSOAL',
                client: mockClient
            })

            expect(result.createdCategories).toHaveLength(0)
            const insertCalls = queries.filter(q => q.sql.startsWith('INSERT INTO finance_categories'))
            expect(insertCalls).toHaveLength(0)

            expect(items[0].categoryId).toBe(33)
            expect(items[0].category).toBe('Juros')
            expect(items[1].categoryId).toBe(33)
            expect(items[1].category).toBe('Juros')
        })

        test('não cria categoria se usuário já tem "Multas"', async () => {
            mockClient.query.mockImplementation(async (sql, params = []) => {
                queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
                if (sql.includes('SELECT id, name, type FROM finance_categories WHERE "userId" = $1 AND type = $2')) {
                    return { rows: [{ id: 44, name: 'Multas', type: 'DESPESA_PESSOAL' }] }
                }
                return { rows: [] }
            })

            const items = [
                { description: 'JUROS DO ROTATIVO', amount: 22.0, category: 'Outros' }
            ]

            const result = await applyInvoiceKeywordRules({
                items,
                userId: 2,
                categoryType: 'DESPESA_PESSOAL',
                client: mockClient
            })

            expect(result.createdCategories).toHaveLength(0)
            expect(items[0].categoryId).toBe(44)
            expect(items[0].category).toBe('Multas')
        })

        test('não cria categoria se usuário já tem "Juros e Multas"', async () => {
            mockClient.query.mockImplementation(async (sql, params = []) => {
                queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
                if (sql.includes('SELECT id, name, type FROM finance_categories WHERE "userId" = $1 AND type = $2')) {
                    return { rows: [{ id: 55, name: 'Juros e Multas', type: 'DESPESA_MEI' }] }
                }
                return { rows: [] }
            })

            const items = [
                { description: 'IOF DIARIO', amount: 3.5, category: 'Outros' },
                { description: 'MULTA POR ATRASO', amount: 10.0, category: 'Outros' }
            ]

            const result = await applyInvoiceKeywordRules({
                items,
                userId: 1,
                categoryType: 'DESPESA_MEI',
                client: mockClient
            })

            expect(result.createdCategories).toHaveLength(0)
            expect(items[0].categoryId).toBe(55)
            expect(items[0].category).toBe('Juros e Multas')
            expect(items[1].categoryId).toBe(55)
            expect(items[1].category).toBe('Juros e Multas')
        })
    })
})
