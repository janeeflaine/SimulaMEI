const {
    parseInstallmentDetails,
    cleanBaseDescription,
    isDescriptionMatch,
    findMatchingInstallmentCategory,
    applyInstallmentCategoryMemory
} = require('../utils/installmentMemory')

describe('Installment Category Memory', () => {
    describe('parseInstallmentDetails', () => {
        test('extrai do campo installment direto', () => {
            expect(parseInstallmentDetails('2/10', '')).toEqual({ current: 2, total: 10, raw: '2/10' })
            expect(parseInstallmentDetails('01/12', '')).toEqual({ current: 1, total: 12, raw: '1/12' })
            expect(parseInstallmentDetails('3 de 5', '')).toEqual({ current: 3, total: 5, raw: '3/5' })
        })

        test('extrai da descrição quando o campo installment está vazio', () => {
            expect(parseInstallmentDetails(null, 'MAGALU 02/10')).toEqual({ current: 2, total: 10, raw: '2/10' })
            expect(parseInstallmentDetails(null, 'CASAS BAHIA PARCELA 03 DE 06')).toEqual({ current: 3, total: 6, raw: '3/6' })
            expect(parseInstallmentDetails(null, 'KABUM (04/05)')).toEqual({ current: 4, total: 5, raw: '4/5' })
            expect(parseInstallmentDetails(null, 'FAST SHOP PARC 01/12')).toEqual({ current: 1, total: 12, raw: '1/12' })
        })

        test('retorna null para compras à vista ou valores inválidos', () => {
            expect(parseInstallmentDetails('1/1', '')).toBeNull()
            expect(parseInstallmentDetails(null, 'SUPERMERCADO DIA')).toBeNull()
            expect(parseInstallmentDetails(null, 'POSTO IPIRANGA R$ 100')).toBeNull()
            expect(parseInstallmentDetails(null, '')).toBeNull()
        })
    })

    describe('cleanBaseDescription', () => {
        test('remove marcadores de parcelas e preserva o nome base da loja', () => {
            expect(cleanBaseDescription('MAGAZINE LUIZA 01/10')).toBe('magazine luiza')
            expect(cleanBaseDescription('MAGAZINE LUIZA 02/10')).toBe('magazine luiza')
            expect(cleanBaseDescription('CASAS BAHIA PARCELA 03 DE 06')).toBe('casas bahia')
            expect(cleanBaseDescription('KABUM - PARC 1/5')).toBe('kabum')
            expect(cleanBaseDescription('APPLE.COM/BILL (02/12)')).toBe('apple com bill')
        })
    })

    describe('isDescriptionMatch', () => {
        test('identifica lojas com mesma raiz', () => {
            expect(isDescriptionMatch('magazine luiza', 'magazine luiza')).toBe(true)
            expect(isDescriptionMatch('magalu compras', 'magalu')).toBe(true)
            expect(isDescriptionMatch('mercadolivre sao paulo', 'mercadolivre osasco')).toBe(true)
            expect(isDescriptionMatch('posto ipiranga', 'restaurante central')).toBe(false)
        })
    })

    describe('findMatchingInstallmentCategory', () => {
        const previousCandidates = [
            {
                id: 101,
                description: 'MAGAZINE LUIZA 01/10',
                amount: 149.90,
                installment: '1/10',
                categoryId: 15,
                categoryName: 'Eletrônicos',
                categoryType: 'DESPESA_MEI'
            },
            {
                id: 102,
                description: 'KABUM - PARC 01/03',
                amount: 80.00,
                installment: '1/3',
                categoryId: 20,
                categoryName: 'Informática',
                categoryType: 'DESPESA_MEI'
            }
        ]

        test('encontra correspondência da parcela seguinte de uma compra anterior', () => {
            const newItem = {
                description: 'MAGAZINE LUIZA 02/10',
                amount: 149.90,
                installment: '2/10'
            }

            const match = findMatchingInstallmentCategory({
                item: newItem,
                candidates: previousCandidates,
                targetCategoryType: 'DESPESA_MEI'
            })

            expect(match).not.toBeNull()
            expect(match.categoryId).toBe(15)
            expect(match.categoryName).toBe('Eletrônicos')
            expect(match.previousInstallment).toBe('1/10')
            expect(match.currentInstallment).toBe('2/10')
        })

        test('tolera pequenas variações de arredondamento de centavos no valor', () => {
            const newItem = {
                description: 'MAGAZINE LUIZA 02/10',
                amount: 149.95, // 5 centavos de diferença
                installment: '2/10'
            }

            const match = findMatchingInstallmentCategory({
                item: newItem,
                candidates: previousCandidates,
                targetCategoryType: 'DESPESA_MEI'
            })

            expect(match).not.toBeNull()
            expect(match.categoryId).toBe(15)
        })

        test('não associa se o total de parcelas for diferente', () => {
            const newItem = {
                description: 'MAGAZINE LUIZA 02/05', // 5x e não 10x
                amount: 149.90,
                installment: '2/5'
            }

            const match = findMatchingInstallmentCategory({
                item: newItem,
                candidates: previousCandidates,
                targetCategoryType: 'DESPESA_MEI'
            })

            expect(match).toBeNull()
        })

        test('não associa se o valor for completamente diferente', () => {
            const newItem = {
                description: 'MAGAZINE LUIZA 02/10',
                amount: 500.00, // valor diferente
                installment: '2/10'
            }

            const match = findMatchingInstallmentCategory({
                item: newItem,
                candidates: previousCandidates,
                targetCategoryType: 'DESPESA_MEI'
            })

            expect(match).toBeNull()
        })
    })

    describe('applyInstallmentCategoryMemory', () => {
        let mockClient

        beforeEach(() => {
            mockClient = {
                query: jest.fn(async (sql, params = []) => {
                    if (sql.includes('FROM invoice_items ii') && sql.includes('JOIN card_invoices ci')) {
                        return {
                            rows: [
                                {
                                    id: 201,
                                    description: 'MAGALU 01/10',
                                    amount: 199.90,
                                    installment: '1/10',
                                    categoryId: 40,
                                    transactionDate: '2026-10-15',
                                    cardId: params[1],
                                    categoryName: 'Equipamentos',
                                    categoryType: 'DESPESA_MEI'
                                }
                            ]
                        }
                    }
                    return { rows: [] }
                })
            }
        })

        test('classifica automaticamente parcela 2/10 com base na parcela 1/10 da fatura anterior', async () => {
            const items = [
                {
                    description: 'COMPRA AVULSA',
                    amount: 50.0,
                    installment: null,
                    category: 'Outros'
                },
                {
                    description: 'MAGALU 02/10',
                    amount: 199.90,
                    installment: '2/10',
                    category: 'Outros'
                }
            ]

            const result = await applyInstallmentCategoryMemory({
                items,
                userId: 1,
                cardId: 5,
                categoryType: 'DESPESA_MEI',
                client: mockClient
            })

            expect(result.memorizedCount).toBe(1)

            // Item avulso permanece intacto
            expect(items[0].categoryId).toBeUndefined()
            expect(items[0].category).toBe('Outros')

            // Item parcelado foi classificado com a categoria da fatura anterior
            expect(items[1].categoryId).toBe(40)
            expect(items[1].category).toBe('Equipamentos')
            expect(items[1].aiCategory).toBe('Equipamentos')
            expect(items[1].categoryName).toBe('Equipamentos')
            expect(items[1].confidence).toBe(1.0)
            expect(items[1].memorizedFromInstallment).toBe(true)
        })

        test('não sobrescreve item que já tem categoria (ex.: por palavras-chave)', async () => {
            const items = [
                {
                    description: 'JUROS PARCELA 02/03',
                    amount: 199.90,
                    installment: '2/3',
                    categoryId: 99, // já categorizado como Juros e Multas
                    category: 'Juros e Multas'
                }
            ]

            const result = await applyInstallmentCategoryMemory({
                items,
                userId: 1,
                cardId: 5,
                categoryType: 'DESPESA_MEI',
                client: mockClient
            })

            expect(result.memorizedCount).toBe(0)
            expect(items[0].categoryId).toBe(99)
            expect(items[0].category).toBe('Juros e Multas')
        })
    })
})
