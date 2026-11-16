const { matchCategory } = require('../utils/categoryMatcher')

describe('categoryMatcher - correspondência de categorias por similaridade', () => {
    const userCategories = [
        { id: 1, name: 'Aluguel', type: 'DESPESA_PESSOAL' },
        { id: 2, name: 'Assinaturas', type: 'DESPESA_PESSOAL' },
        { id: 3, name: 'Beleza', type: 'DESPESA_PESSOAL' },
        { id: 4, name: 'Cmig', type: 'DESPESA_PESSOAL' },
        { id: 5, name: 'Dentista', type: 'DESPESA_PESSOAL' },
        { id: 6, name: 'Escolar', type: 'DESPESA_PESSOAL' },
        { id: 7, name: 'Espetinho Nordeste', type: 'DESPESA_PESSOAL' },
        { id: 8, name: 'Festa', type: 'DESPESA_PESSOAL' },
        { id: 9, name: 'FIES', type: 'DESPESA_PESSOAL' },
        { id: 10, name: 'Gás', type: 'DESPESA_PESSOAL' },
        { id: 11, name: 'Gasolina', type: 'DESPESA_PESSOAL' },
        { id: 12, name: 'Honda', type: 'DESPESA_PESSOAL' },
        { id: 13, name: 'Internet', type: 'DESPESA_PESSOAL' },
        { id: 14, name: 'IPTU', type: 'DESPESA_PESSOAL' },
        { id: 15, name: 'IPTV', type: 'DESPESA_PESSOAL' },
        { id: 16, name: 'IPVA', type: 'DESPESA_PESSOAL' },
        { id: 17, name: 'Lanches', type: 'DESPESA_PESSOAL' },
        { id: 18, name: 'Lemon', type: 'DESPESA_PESSOAL' },
        { id: 19, name: 'Marmitas', type: 'DESPESA_PESSOAL' },
        { id: 20, name: 'Mecanico', type: 'DESPESA_PESSOAL' },
        { id: 21, name: 'Mercado', type: 'DESPESA_PESSOAL' },
        { id: 22, name: 'Multas', type: 'DESPESA_PESSOAL' },
        { id: 23, name: 'Outros', type: 'DESPESA_PESSOAL' },
        { id: 24, name: 'Saúde', type: 'DESPESA_PESSOAL' },
        { id: 25, name: 'Serviços', type: 'DESPESA_PESSOAL' },
        { id: 26, name: 'Tecnologia IA', type: 'DESPESA_PESSOAL' },
        { id: 27, name: 'Vestuário', type: 'DESPESA_PESSOAL' },
        { id: 28, name: 'Viagem', type: 'DESPESA_PESSOAL' }
    ]

    test('Verduras na feira deve classificar como Mercado', () => {
        const match = matchCategory('Verduras na feira', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Mercado')
    })

    test('Compras de legumes e frutas deve classificar como Mercado', () => {
        const match = matchCategory('Legumes e frutas no sacolão', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Mercado')
    })

    test('Abasteci o carro no posto deve classificar como Gasolina', () => {
        const match = matchCategory('Abasteci 50 reais no posto', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Gasolina')
    })

    test('Troca de oleo e pastilha deve classificar como Mecanico', () => {
        const match = matchCategory('Troca de óleo do carro', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Mecanico')
    })

    test('Remedio na farmacia deve classificar como Saúde', () => {
        const match = matchCategory('Dipirona e curativo na farmácia', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Saúde')
    })

    test('Hamburguer e batata frita deve classificar como Lanches', () => {
        const match = matchCategory('Hamburguer e batata frita', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Lanches')
    })

    test('Conta de luz da cemig deve classificar como Cmig', () => {
        const match = matchCategory('Conta de luz', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Cmig')
    })

    test('Mensalidade netflix deve classificar como Assinaturas', () => {
        const match = matchCategory('Netflix do mês', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Assinaturas')
    })

    test('Botijao de gas deve classificar como Gás', () => {
        const match = matchCategory('Botijão de gás', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Gás')
    })

    test('Corte de cabelo e barba deve classificar como Beleza', () => {
        const match = matchCategory('Corte de cabelo na barbearia', userCategories)
        expect(match).not.toBeNull()
        expect(match.name).toBe('Beleza')
    })

    test('Texto aleatório sem correspondência retorna null', () => {
        const match = matchCategory('xyz abc 123456', userCategories)
        expect(match).toBeNull()
    })
})
