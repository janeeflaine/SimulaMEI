/**
 * Legal Info — dados institucionais e canais de contato do EuSempreMEI.
 *
 * Fonte única para rodapé, páginas legais, contato e cadastro.
 * Ao alterar o texto da Política de Privacidade ou dos Termos, atualize
 * LEGAL_LAST_UPDATED e LEGAL_VERSION (a versão é registrada no aceite do cadastro).
 */

export const COMPANY = {
    productName: 'EuSempreMEI',
    // Exatamente como no Comprovante de Inscrição do CNPJ (campo "Nome empresarial").
    // A verificação da Meta compara este nome, o endereço e o telefone com o documento.
    legalName: '33.137.007 JHONNY EFLAINY CAVALCANTE DA SILVA',
    legalNature: 'empresário individual',
    cnpj: '33.137.007/0001-09',
    domain: 'eusempremei.com.br',
    address: 'Rua Laureano Jose Ferreira, 65, Loja 1, Prata, Lajinha - MG, CEP 36.980-000',
    phone: '(33) 99948-8193',
    phoneHref: 'tel:+5533999488193',
}

export const CONTACT_EMAILS = {
    contato: 'contato@eusempremei.com.br',
    suporte: 'suporte@eusempremei.com.br',
    privacidade: 'privacidade@eusempremei.com.br',
}

export const LEGAL_LAST_UPDATED = '11 de novembro de 2026'
export const LEGAL_VERSION = '2026-11-11'
