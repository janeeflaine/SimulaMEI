/**
 * Gemini Vision API Service — Invoice Parser
 * 
 * Isolated module for parsing credit card invoices via Google Gemini.
 * Accepts PDF, CSV, OFX, or image data and returns structured JSON with invoice items.
 * Recommended formats: PDF and CSV.
 * 
 * Environment: GEMINI_API_KEY must be set in .env
 */
const { GoogleGenerativeAI } = require('@google/generative-ai')

// --- Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const MODEL_NAME = 'gemini-2.0-flash'
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
- amount: valor numérico em reais (ex: 25.90, sem "R$")
- transactionDate: data da compra no formato YYYY-MM-DD (se disponível)
- category: categoria sugerida entre: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Vestuário, Assinaturas, Mercado, Restaurante, Combustível, Farmácia, Pets, Serviços, Outros
- confidence: sua confiança na categorização de 0.0 a 1.0
- installment: se for parcela, formato "X/Y" (ex: "3/12"), senão null

Também extraia os metadados da fatura:
- cardLastFour: últimos 4 dígitos do cartão (se visível)
- holderName: nome do titular (se visível)
- totalAmount: valor total da fatura
- dueDate: data de vencimento no formato YYYY-MM-DD
- closingDate: data de fechamento no formato YYYY-MM-DD
- referenceMonth: mês de referência (1-12)
- referenceYear: ano de referência (ex: 2026)

IMPORTANTE sobre valores monetários brasileiros:
- O formato BRL usa ponto para separar milhares e vírgula para decimais: 1.200,50 = mil e duzentos reais e cinquenta centavos
- Converta para formato numérico padrão: 1200.50
- Nunca confunda ponto de milhar com separador decimal

Retorne SOMENTE um JSON válido no seguinte formato, sem markdown, sem texto extra:
{
  "metadata": {
    "cardLastFour": "1234",
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

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: MODEL_NAME })

    // Build prompt with user categories if available
    let prompt = INVOICE_EXTRACTION_PROMPT
    if (userCategories.length > 0) {
        prompt = prompt.replace('{{USER_CATEGORIES}}', userCategories.join(', '))
    } else {
        prompt = prompt.replace('{{USER_CATEGORIES}}', 'Nenhuma categoria customizada fornecida. Use as categorias padrão.')
    }

    // Determine how to send the file to Gemini
    const isTextBased = TEXT_MIME_TYPES.includes(mimeType)

    let contentParts
    if (isTextBased) {
        // For CSV/OFX: send as text content
        const textContent = fileBuffer.toString('utf-8')
        contentParts = [prompt + '\n\nConteúdo do arquivo:\n```\n' + textContent + '\n```']
    } else {
        // For PDF/images: send as inlineData (base64)
        const base64Data = fileBuffer.toString('base64')
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        }
        contentParts = [prompt, imagePart]
    }

    try {
        const result = await model.generateContent(contentParts)
        const response = await result.response
        const text = response.text()

        // Clean up response — remove markdown fences if present
        let cleanText = text.trim()
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
            throw new Error('A IA retornou uma resposta inválida. Tente novamente com uma imagem mais clara.')
        }

        // Validate structure
        if (!parsed.items || !Array.isArray(parsed.items)) {
            throw new Error('Resposta da IA não contém lista de itens válida')
        }

        if (!parsed.metadata) {
            parsed.metadata = {}
        }

        // Sanitize items — ensure amounts are positive numbers
        parsed.items = parsed.items
            .filter(item => item.description && item.amount !== undefined)
            .map(item => ({
                description: String(item.description).trim(),
                amount: Math.abs(parseFloat(item.amount) || 0),
                transactionDate: item.transactionDate || null,
                category: item.category || 'Outros',
                confidence: Math.min(1, Math.max(0, parseFloat(item.confidence) || 0)),
                installment: item.installment || null
            }))

        // Sanitize metadata
        parsed.metadata = {
            cardLastFour: parsed.metadata.cardLastFour || null,
            holderName: parsed.metadata.holderName || null,
            totalAmount: Math.abs(parseFloat(parsed.metadata.totalAmount) || 0),
            dueDate: parsed.metadata.dueDate || null,
            closingDate: parsed.metadata.closingDate || null,
            referenceMonth: parseInt(parsed.metadata.referenceMonth) || null,
            referenceYear: parseInt(parsed.metadata.referenceYear) || null
        }

        return parsed
    } catch (apiErr) {
        if (apiErr.message.includes('IA retornou') || apiErr.message.includes('não contém')) {
            throw apiErr // Re-throw our own validation errors
        }
        console.error('Gemini API Error:', apiErr.message)
        throw new Error('Erro ao processar fatura via IA. Tente novamente mais tarde.')
    }
}

module.exports = {
    parseInvoice,
    validateFile,
    SUPPORTED_MIME_TYPES,
    TEXT_MIME_TYPES,
    MAX_FILE_SIZE
}
