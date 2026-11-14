/**
 * Leitura da fatura pela IA (geminiService): estorno continua negativo,
 * pagamento da fatura anterior não vira compra e as mensagens de erro que
 * vão para a tela não falam de chave de API.
 */
let mockResponse
jest.mock('@google/genai', () => ({
    GoogleGenAI: class {
        constructor() {
            this.models = { generateContent: async () => mockResponse() }
        }
    }
}))

process.env.GEMINI_API_KEY = 'chave-de-teste'
const { parseInvoice, PAYMENT_LINE } = require('../utils/geminiService')

const PDF = Buffer.from('%PDF-1.7 teste')

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

test('estorno fica negativo; pagamento da fatura anterior e valor zero ficam de fora', async () => {
    mockResponse = () => ({
        text: JSON.stringify({
            metadata: { dueDate: '2026-11-10', totalAmount: 120 },
            items: [
                { description: 'Mercado', amount: 150, category: 'Mercado', confidence: 0.9 },
                { description: 'Estorno Loja X', amount: -30, category: 'Outros', confidence: 0.8 },
                { description: 'PAGAMENTO EFETUADO', amount: -1500 },
                { description: 'Pagto fatura anterior', amount: -900 },
                { description: 'Taxa zerada', amount: 0 }
            ]
        })
    })
    const result = await parseInvoice(PDF, 'application/pdf', [])
    expect(result.items.map(i => [i.description, i.amount])).toEqual([['Mercado', 150], ['Estorno Loja X', -30]])
    expect(result.metadata.referenceMonth).toBe(11)
})

test('linha de pagamento é reconhecida, compra com a palavra "pagamento" não', () => {
    expect(PAYMENT_LINE.test('PAGAMENTO EFETUADO')).toBe(true)
    expect(PAYMENT_LINE.test('Pagamento recebido - obrigado')).toBe(true)
    expect(PAYMENT_LINE.test('PGTO FATURA')).toBe(true)
    expect(PAYMENT_LINE.test('PagSeguro *Loja')).toBe(false)
})

test('resposta que não é JSON vira mensagem para a pessoa', async () => {
    mockResponse = () => ({ text: 'não sei ler isso' })
    await expect(parseInvoice(PDF, 'application/pdf', [])).rejects.toMatchObject({ userMessage: expect.stringContaining('não conseguiu ler') })
})

test('PDF protegido vira mensagem para a pessoa; chave inválida não', async () => {
    mockResponse = () => { throw new Error('The document has no pages') }
    await expect(parseInvoice(PDF, 'application/pdf', [])).rejects.toMatchObject({ userMessage: expect.stringContaining('proteção') })
    mockResponse = () => { throw new Error('API key not valid') }
    const err = await parseInvoice(PDF, 'application/pdf', []).catch(e => e)
    expect(err.userMessage).toBeUndefined()
})
