/**
 * categoryMatcher.js — Sugere a categoria mais compatível com a despesa/receita
 * baseando-se nas categorias cadastradas do usuário.
 */

// Clusters semânticos de despesas e receitas comuns no Brasil
const SEMANTIC_CLUSTERS = [
    {
        categoryAliases: ['mercado', 'supermercado', 'alimentacao', 'alimentação', 'compras', 'feira', 'hortifruti', 'mercearia'],
        keywords: [
            'verdura', 'verduras', 'legume', 'legumes', 'fruta', 'frutas', 'hortifruti', 'hortifrute',
            'feira', 'feirinha', 'sacolao', 'sacolão', 'mercado', 'supermercado', 'hipermercado',
            'padaria', 'pão', 'pao', 'panificadora', 'acougue', 'açougue', 'carne', 'carnes', 'frango',
            'peixe', 'peixaria', 'frios', 'queijo', 'presunto', 'arroz', 'feijao', 'feijão', 'leite',
            'cafe', 'café', 'oleo', 'óleo', 'açucar', 'acucar', 'mantimento', 'mantimentos', 'compras do mes',
            'carrefour', 'assai', 'assaí', 'atacadao', 'atacadão', 'pao de acucar', 'extra', 'dia', 'bh'
        ]
    },
    {
        categoryAliases: ['gasolina', 'combustivel', 'combustível', 'abastecimento', 'posto'],
        keywords: [
            'gasolina', 'etanol', 'alcool', 'álcool', 'diesel', 'gnv', 'combustivel', 'combustível',
            'posto', 'ipiranga', 'shell', 'petrobras', 'br', 'abastecer', 'abasteci', 'abastecimento',
            'aditivada', 'tanque', 'litros de gasolina'
        ]
    },
    {
        categoryAliases: ['mecanico', 'mecânico', 'oficina', 'auto', 'veiculo', 'veículo', 'carro', 'moto'],
        keywords: [
            'mecanico', 'mecânico', 'oficina', 'troca de oleo', 'troca de óleo', 'oleo', 'óleo do carro',
            'pneu', 'pneus', 'borracharia', 'borracheiro', 'alinhamento', 'balanceamento', 'freio',
            'pastilha', 'suspensao', 'suspensão', 'escapamento', 'revisao', 'revisão', 'auto pecas',
            'autopeças', 'auto peças', 'bateria', 'moura', 'funilaria', 'pintura automotiva', 'lanternagem'
        ]
    },
    {
        categoryAliases: ['lanches', 'lanche', 'restaurante', 'refeicao', 'refeição', 'comida', 'alimentacao', 'alimentação', 'ifood'],
        keywords: [
            'lanche', 'lanches', 'hamburguer', 'hambúrguer', 'burger', 'burguer', 'mcdonalds', 'mc donalds',
            'bk', 'burger king', 'subway', 'pizza', 'pizzaria', 'pastel', 'pastelaria', 'salgado', 'salgados',
            'coxinha', 'acai', 'açaí', 'sorvete', 'sorveteria', 'dogão', 'hot dog', 'hotdog', 'podrao', 'podrão',
            'ifood', 'aiqfome', 'delivery', 'petisco', 'tira gosto', 'churrasquinho', 'porcao', 'porção'
        ]
    },
    {
        categoryAliases: ['marmitas', 'marmita', 'marmitex', 'almoco', 'almoço', 'refeicao', 'refeição'],
        keywords: [
            'marmita', 'marmitas', 'marmitex', 'quentinha', 'pf', 'prato feito', 'almoco', 'almoço',
            'almoco comercial', 'comida caseira', 'self service', 'bandejão'
        ]
    },
    {
        categoryAliases: ['espetinho nordeste', 'espetinho', 'churrasco'],
        keywords: ['espetinho', 'espetinho nordeste', 'churrasquinho', 'espeto', 'carne assada']
    },
    {
        categoryAliases: ['saude', 'saúde', 'farmacia', 'farmácia', 'drogaria', 'medico', 'médico'],
        keywords: [
            'farmacia', 'farmácia', 'drogaria', 'droga raia', 'pague menos', 'drogasil', 'sao paulo',
            'remedio', 'remédio', 'medicamento', 'dipirona', 'paracetamol', 'antibiotico', 'antibiótico',
            'curativo', 'bandaid', 'pomada', 'vitamina', 'xarope', 'receita medica', 'medico', 'médico',
            'consulta', 'exame', 'laboratorio', 'laboratório', 'clinica', 'clínica', 'hospital', 'pronto socorro',
            'terapia', 'psicologo', 'psicólogo', 'fisioterapia', 'dentista', 'oftalmo', 'oculos', 'óculos', 'otica', 'ótica'
        ]
    },
    {
        categoryAliases: ['dentista', 'odonto', 'odontologia'],
        keywords: ['dentista', 'odonto', 'odontologia', 'clareamento', 'aparelho', 'ortodontia', 'carie', 'cárie', 'canal', 'extracao', 'extração']
    },
    {
        categoryAliases: ['beleza', 'estetica', 'estética', 'cuidados', 'salao', 'salão', 'barbearia'],
        keywords: [
            'salao', 'salão', 'cabeleireiro', 'barbearia', 'barbeiro', 'corte de cabelo', 'corte cabelo',
            'manicure', 'pedicure', 'unha', 'unhas', 'esmalte', 'sobrancelha', 'estetica', 'estética',
            'depilacao', 'depilação', 'maquiagem', 'make', 'barba', 'escova', 'progressiva', 'tintura'
        ]
    },
    {
        categoryAliases: ['vestuario', 'vestuário', 'roupas', 'roupa', 'calcados', 'calçados', 'moda'],
        keywords: [
            'roupa', 'roupas', 'camisa', 'camiseta', 'calca', 'calça', 'bermuda', 'short', 'shorts',
            'casaco', 'jaqueta', 'blusa', 'vestido', 'saia', 'sapato', 'tenis', 'tênis', 'sandalia', 'sandália',
            'chinelo', 'havaianas', 'meia', 'meias', 'cueca', 'sutia', 'sutiã', 'lingerie', 'loja de roupas',
            'zara', 'renner', 'riachuelo', 'c&a', 'cea'
        ]
    },
    {
        categoryAliases: ['viagem', 'viagens', 'transporte', 'hospedagem'],
        keywords: [
            'viagem', 'viagens', 'passagem', 'passagem aerea', 'passagem aérea', 'voo', 'aviao', 'avião',
            'hotel', 'pousada', 'resort', 'hospedagem', 'airbnb', 'mala', 'malas', 'pedagio', 'pedágio',
            'tarifa pedagio', 'sem parar', 'conectcar', 'veloe', 'uber', '99', 'taxi', 'táxi', 'corrida'
        ]
    },
    {
        categoryAliases: ['cmig', 'cemig', 'luz', 'energia', 'eletricidade'],
        keywords: ['cmig', 'cemig', 'luz', 'energia', 'conta de luz', 'energia eletrica', 'energia elétrica', 'enel', 'cpfl', 'copel', 'energisa', 'eletropaulo']
    },
    {
        categoryAliases: ['gas', 'gás'],
        keywords: ['gas', 'gás', 'botijao', 'botijão', 'botijao de gas', 'botijão de gás', 'ultragaz', 'liquigas', 'liquigás', 'supergasbras', 'consigaz', 'recarga de gas']
    },
    {
        categoryAliases: ['internet', 'wifi', 'telefonia', 'celular', 'telefone'],
        keywords: ['internet', 'wifi', 'wi-fi', 'fibra', 'banda larga', 'claro', 'vivo', 'tim', 'oi fibra', 'modem', 'recarga celular', 'plano celular']
    },
    {
        categoryAliases: ['aluguel', 'moradia', 'habitacao', 'habitação', 'condominio', 'condomínio'],
        keywords: ['aluguel', 'condominio', 'condomínio', 'taxa condominio', 'locacao', 'locação', 'imobiliaria', 'imobiliária', 'inquilino']
    },
    {
        categoryAliases: ['iptu'],
        keywords: ['iptu', 'imposto predial', 'taxa de lixo', 'prefeitura iptu']
    },
    {
        categoryAliases: ['ipva', 'licenciamento', 'detran'],
        keywords: ['ipva', 'licenciamento', 'detran', 'taxa detran', 'emplacamento', 'dpvat']
    },
    {
        categoryAliases: ['multas', 'multa', 'juros e multas', 'juros'],
        keywords: ['multa', 'multas', 'infracao', 'infração', 'radar', 'velocidade', 'iof', 'juros', 'mora', 'atraso', 'encargos']
    },
    {
        categoryAliases: ['assinaturas', 'streaming', 'servicos online', 'serviços online'],
        keywords: ['netflix', 'spotify', 'amazon prime', 'prime video', 'disney', 'disney+', 'streaming', 'deezer', 'hbo', 'max', 'globoplay', 'assinatura', 'youtube premium']
    },
    {
        categoryAliases: ['iptv'],
        keywords: ['iptv', 'lista iptv', 'tv box', 'canais iptv', 'tv por assinatura']
    },
    {
        categoryAliases: ['escolar', 'educacao', 'educação', 'escola', 'cursos', 'curso'],
        keywords: [
            'escola', 'colegio', 'colégio', 'material escolar', 'mensalidade escolar', 'livro', 'livros',
            'livraria', 'caderno', 'mochila', 'estojo', 'lapis', 'lápis', 'caneta', 'uniforme', 'matricula', 'matrícula'
        ]
    },
    {
        categoryAliases: ['fies', 'faculdade', 'universidade'],
        keywords: ['fies', 'faculdade', 'universidade', 'prouni', 'graduacao', 'graduação', 'pos graduacao', 'pós-graduação', 'mensalidade faculdade']
    },
    {
        categoryAliases: ['honda', 'consorcio honda', 'moto'],
        keywords: ['honda', 'consorcio honda', 'consórcio honda', 'parcela honda', 'moto honda', 'financiamento honda']
    },
    {
        categoryAliases: ['lemon', 'energia solar'],
        keywords: ['lemon', 'lemon energia', 'usina solar', 'assinatura solar']
    },
    {
        categoryAliases: ['festa', 'lazer', 'entretenimento', 'diversao', 'diversão'],
        keywords: ['festa', 'balada', 'show', 'evento', 'ingresso', 'ingressos', 'camarote', 'buffet', 'aniversario', 'aniversário', 'confraternizacao', 'confraternização', 'baladinha', 'churrascada']
    },
    {
        categoryAliases: ['tecnologia ia', 'tecnologia', 'software', 'ti'],
        keywords: ['tecnologia ia', 'chatgpt', 'openai', 'claude', 'anthropic', 'cursor', 'github', 'copilot', 'midjourney', 'aws', 'vercel', 'servidor', 'hospedagem', 'dominio', 'domínio', 'inteligencia artificial', 'inteligência artificial']
    },
    {
        categoryAliases: ['servicos', 'serviços', 'manutencao', 'manutenção'],
        keywords: ['servico', 'serviço', 'servicos', 'serviços', 'diarista', 'faxina', 'limpeza', 'encanador', 'eletricista', 'pedreiro', 'pintor', 'chaveiro', 'frete', 'carreto', 'marceneiro']
    }
]

/** Normaliza texto removendo acentos e pontuação. */
function normalize(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * Encontra a categoria mais compatível com a descrição entre as categorias do usuário.
 *
 * @param {string} description Descrição do lançamento (ex: "Verduras na feira")
 * @param {Array<{id:number, name:string, type:string}>} categories Categorias do usuário
 * @returns {{id:number, name:string, score:number}|null}
 */
function matchCategory(description, categories = []) {
    if (!description || !categories.length) return null

    const normDesc = normalize(description)
    if (!normDesc) return null

    const descWords = normDesc.split(' ').filter(w => w.length >= 2)
    if (!descWords.length) return null

    let bestMatch = null
    let highestScore = 0

    for (const cat of categories) {
        const normCatName = normalize(cat.name)
        const catWords = normCatName.split(' ').filter(w => w.length >= 2)
        let score = 0

        // 1. Coincidência direta exata de nome na descrição ou vice-versa
        if (normDesc === normCatName) {
            score = 100
        } else if (normDesc.includes(normCatName)) {
            score = 90
        } else if (normCatName.includes(normDesc)) {
            score = 80
        } else {
            // 2. Palavras do nome da categoria contidas na descrição
            for (const cw of catWords) {
                if (descWords.includes(cw)) {
                    score += 40
                }
            }
        }

        // 3. Verificação por clusters semânticos
        for (const cluster of SEMANTIC_CLUSTERS) {
            const aliasMatches = cluster.categoryAliases.some(alias => {
                const normAlias = normalize(alias)
                return normCatName === normAlias ||
                    catWords.includes(normAlias) ||
                    (normAlias.includes(' ') && normCatName.includes(normAlias))
            })

            if (aliasMatches) {
                // Checa quantas palavras da descrição batem com keywords do cluster
                let clusterHits = 0
                for (const kw of cluster.keywords) {
                    const normKw = normalize(kw)
                    if (normKw.includes(' ')) {
                        if (normDesc.includes(normKw)) clusterHits += 2
                    } else if (descWords.includes(normKw)) {
                        clusterHits += 1
                    }
                }

                if (clusterHits > 0) {
                    score = Math.max(score, 50 + Math.min(clusterHits * 15, 45))
                }
            }
        }

        if (score > highestScore) {
            highestScore = score
            bestMatch = { id: cat.id, name: cat.name, score }
        }
    }

    // Limiar mínimo para considerar uma sugestão válida
    if (highestScore >= 40) {
        return bestMatch
    }

    return null
}

module.exports = {
    matchCategory,
    normalize,
    SEMANTIC_CLUSTERS
}
