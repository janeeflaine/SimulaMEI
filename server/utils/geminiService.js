/**
 * Gemini Vision API Service — Invoice Parser
 *
 * Isolated module for parsing credit card invoices via Google Gemini.
 * Accepts PDF, CSV, OFX, or image data and returns structured JSON with invoice items.
 * Recommended formats: PDF and CSV.
 *
 * Environment: GEMINI_API_KEY must be set in .env
 * Supports both legacy AIza... keys and new AQ.Ab8R... auth keys via @google/genai SDK.
 */
const { GoogleGenAI } = require('@google/genai')

// --- Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'text/csv',
    'application/vnd.ms-excel',      // CSV fallback
    'application/x-ofx',             // OFX
    'application/ofx',               // OFX alternative
    'text/ofx',                      // OFX text
    'text/plain'                     // CSV/OFX fallback
]

// Text-based MIME types that should be sent as text, not inlineData
const TEXT_MIME_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/x-ofx',
    'application/ofx',
    'text/ofx',
    'text/plain'
]

// --- Prompt template for invoice extraction ---
const INVOICE_EXTRACTION_PROMPT = `
Você é um especialista em análise de faturas de cartão de crédito brasileiras.

Analise a fatura de cartão de crédito enviada e extraia TODOS os itens de cobrança.

Para CADA item extraído, retorne:
- description: texto exato da descrição do gasto (como aparece na fatura)
- amount: valor numérico em reais (ex: 25.90, sem "R$"). Compras, tarifas, juros e IOF são positivos. Estornos, créditos e devoluções são NEGATIVOS (ex: -45.00).
- transactionDate: data da compra no formato YYYY-MM-DD (se disponível)
- category: categoria sugerida entre: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Vestuário, Assinaturas, Mercado, Restaurante, Combustível, Farmácia, Pets, Serviços, Outros
- confidence: sua confiança na categorização de 0.0 a 1.0
- installment: se for parcela, formato "X/Y" (ex: "3/12"), senão null

NÃO inclua como item: o pagamento da fatura anterior ("PAGAMENTO EFETUADO", "PAGTO", "PAGAMENTO RECEBIDO"), o saldo anterior nem linhas de total ou subtotal.

Também extraia os metadados da fatura:
- cardLastFour: últimos 4 dígitos do cartão titular (se visível)
- cardsLastFour: lista com os últimos 4 dígitos de TODOS os cartões que aparecem na fatura (titular e adicionais), ex: ["6741", "4518"]
- holderName: nome do titular (se visível)
- totalAmount: valor total da fatura (o valor total a pagar no mês da fatura)
- dueDate: data de vencimento no formato YYYY-MM-DD (ex: 2026-04-10)
- closingDate: data de fechamento / corte no formato YYYY-MM-DD (se visível)
- referenceMonth: mês da fatura (1 a 12). REGRA OBRIGATÓRIA NO BRASIL: O mês da fatura é SEMPRE o mês da DATA DE VENCIMENTO (dueDate). Por exemplo, se o vencimento for 10/04/2026, a fatura é de ABRIL (referenceMonth = 4), mesmo que todas as compras listadas nela tenham sido realizadas no mês anterior (março). NUNCA utilize o mês em que as compras foram feitas como referenceMonth.
- referenceYear: ano da fatura (ex: 2026), correspondente ao ano do vencimento (dueDate).

IMPORTANTE sobre valores monetários brasileiros:
- O formato BRL usa ponto para separar milhares e vírgula para decimais: 1.200,50 = mil e duzentos reais e cinquenta centavos
- Converta para formato numérico padrão: 1200.50
- Nunca confunda ponto de milhar com separador decimal

Retorne SOMENTE um JSON válido no seguinte formato, sem markdown, sem texto extra:
{
  "metadata": {
    "cardLastFour": "1234",
    "cardsLastFour": ["1234"],
    "holderName": "NOME TITULAR",
    "totalAmount": 1500.50,
    "dueDate": "2026-03-12",
    "closingDate": "2026-03-05",
    "referenceMonth": 3,
    "referenceYear": 2026
  },
  "items": [
    {
      "description": "UBER *TRIP",
      "amount": 25.90,
      "transactionDate": "2026-02-15",
      "category": "Transporte",
      "confidence": 0.95,
      "installment": null
    }
  ]
}

CATEGORIAS_DO_USUARIO:
{{USER_CATEGORIES}}
Se as categorias do usuário forem fornecidas acima, priorize-as em vez das categorias padrão.
`

/**
 * Erro com uma mensagem que pode ir para a tela (as outras ficam só no log,
 * porque falam de chave de API, modelo etc.)
 */
const userError = (message) => Object.assign(new Error(message), { userMessage: message })

// Linha de pagamento da fatura anterior (não é compra)
const PAYMENT_LINE = /\b(pagamento|pagto|pgto)\b.*\b(efetuado|recebido|fatura|obrigado)\b|^pagamento$/i

/**
 * Validates file before sending to Gemini
 * @param {Buffer} fileBuffer - The file data
 * @param {string} mimeType - File MIME type
 * @returns {{ valid: boolean, error?: string }}
 */
const validateFile = (fileBuffer, mimeType) => {
    if (!fileBuffer || fileBuffer.length === 0) {
        return { valid: false, error: 'Arquivo vazio ou não fornecido' }
    }

    if (fileBuffer.length > MAX_FILE_SIZE) {
        return { valid: false, error: `Arquivo excede o limite de ${MAX_FILE_SIZE / 1024 / 1024}MB` }
    }

    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
        return { valid: false, error: `Formato não suportado: ${mimeType}. Use PDF, CSV, OFX, PNG ou JPG.` }
    }

    return { valid: true }
}

/**
 * Parses a credit card invoice using Gemini Vision API
 * @param {Buffer} fileBuffer - The file data (PDF or image)
 * @param {string} mimeType - File MIME type
 * @param {string[]} userCategories - User's custom category names (optional)
 * @returns {Promise<{ metadata: object, items: object[] }>}
 */
const parseInvoice = async (fileBuffer, mimeType, userCategories = []) => {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY não configurada. Adicione ao arquivo .env')
    }

    // Validate file
    const validation = validateFile(fileBuffer, mimeType)
    if (!validation.valid) {
        throw new Error(validation.error)
    }

    // Initialize new unified SDK (supports both AIza... and AQ.Ab8R... key formats)
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })

    // Build prompt with user categories if available
    let prompt = INVOICE_EXTRACTION_PROMPT
    if (userCategories.length > 0) {
        prompt = prompt.replace('{{USER_CATEGORIES}}', userCategories.join(', '))
    } else {
        prompt = prompt.replace('{{USER_CATEGORIES}}', 'Nenhuma categoria customizada fornecida. Use as categorias padrão.')
    }

    // Determine how to send the file to Gemini
    const isTextBased = TEXT_MIME_TYPES.includes(mimeType)

    let contents
    if (isTextBased) {
        // For CSV/OFX: send as plain text
        const textContent = fileBuffer.toString('utf-8')
        contents = prompt + '\n\nConteúdo do arquivo:\n```\n' + textContent + '\n```'
    } else {
        // For PDF/images: send as inlineData (base64) alongside the prompt
        const base64Data = fileBuffer.toString('base64')
        contents = [
            { text: prompt },
            { inlineData: { data: base64Data, mimeType: mimeType } }
        ]
    }

    // Model fallback chain — try in order until one succeeds
    const CANDIDATE_MODELS = [
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro'
    ]

    let rawText
    let lastError
    for (const modelName of CANDIDATE_MODELS) {
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: contents
            })
            rawText = response.text
            console.log(`Sucesso no processamento com o modelo Gemini: ${modelName}`)
            break
        } catch (err) {
            lastError = err
            const msg = err.message || ''

            if (msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND')) {
                console.warn(`Modelo ${modelName} não encontrado, tentando próximo...`)
                continue
            }
            if (msg.includes('The document has no pages')) {
                throw userError('O PDF tem proteção do banco ou páginas que a IA não consegue ler. Abra o PDF e use "Imprimir" > "Salvar como PDF" para gerar uma cópia sem proteção, ou envie em CSV ou numa foto (PNG/JPG).')
            }
            if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID') || msg.includes('UNAUTHENTICATED')) {
                throw new Error('Chave de API do Gemini inválida ou sem permissão. Acesse https://aistudio.google.com/apikey, crie uma nova chave e atualize a variável GEMINI_API_KEY.')
            }
            throw err
        }
    }

    if (rawText === undefined) {
        throw lastError || new Error('Nenhum modelo Gemini suportado foi encontrado.')
    }

    // Clean up response — remove markdown fences if present
    let cleanText = rawText.trim()
    if (cleanText.startsWith('```json')) {
        cleanText = cleanText.slice(7)
    } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.slice(3)
    }
    if (cleanText.endsWith('```')) {
        cleanText = cleanText.slice(0, -3)
    }
    cleanText = cleanText.trim()

    // Parse JSON
    let parsed
    try {
        parsed = JSON.parse(cleanText)
    } catch (parseErr) {
        console.error('Gemini returned invalid JSON:', cleanText.substring(0, 200))
        throw userError('A IA não conseguiu ler a fatura. Tente de novo, de preferência com o PDF ou o CSV do banco.')
    }

    // Validate structure
    if (!parsed.items || !Array.isArray(parsed.items)) {
        throw userError('A IA não encontrou compras nesse arquivo. Confira se é a fatura do cartão.')
    }

    if (!parsed.metadata) {
        parsed.metadata = {}
    }

    // Itens: estorno fica negativo (antes virava compra positiva); pagamento da
    // fatura anterior e valores zerados ficam de fora
    parsed.items = parsed.items
        .filter(item => item && item.description && item.amount !== undefined)
        .map(item => ({
            description: String(item.description).trim(),
            amount: Number.parseFloat(item.amount) || 0,
            transactionDate: item.transactionDate || null,
            category: item.category || 'Outros',
            confidence: Math.min(1, Math.max(0, parseFloat(item.confidence) || 0)),
            installment: item.installment || null
        }))
        .filter(item => item.amount !== 0 && !(item.amount < 0 && PAYMENT_LINE.test(item.description)))

    // Sanitize metadata
    let refMonth = parseInt(parsed.metadata.referenceMonth) || null
    let refYear = parseInt(parsed.metadata.referenceYear) || null

    // Fallback/Correction: In Brazilian credit cards, invoice cycle and month are always tied to the due date (dueDate).
    if (parsed.metadata.dueDate && typeof parsed.metadata.dueDate === 'string') {
        const parts = parsed.metadata.dueDate.split('-')
        if (parts.length === 3) {
            const dueYear = parseInt(parts[0], 10)
            const dueMonth = parseInt(parts[1], 10)
            if (!isNaN(dueYear) && !isNaN(dueMonth) && dueMonth >= 1 && dueMonth <= 12) {
                refMonth = dueMonth
                refYear = dueYear
            }
        }
    }

    parsed.metadata = {
        cardLastFour: parsed.metadata.cardLastFour || null,
        cardsLastFour: Array.isArray(parsed.metadata.cardsLastFour) ? parsed.metadata.cardsLastFour : [],
        holderName: parsed.metadata.holderName || null,
        totalAmount: Math.abs(parseFloat(parsed.metadata.totalAmount) || 0),
        dueDate: parsed.metadata.dueDate || null,
        closingDate: parsed.metadata.closingDate || null,
        referenceMonth: refMonth,
        referenceYear: refYear
    }

    return parsed
}

module.exports = {
    parseInvoice,
    validateFile,
    SUPPORTED_MIME_TYPES,
    TEXT_MIME_TYPES,
    MAX_FILE_SIZE,
    PAYMENT_LINE
}
