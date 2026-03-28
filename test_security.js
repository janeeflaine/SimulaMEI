require('dotenv').config()
const { Pool } = require('pg')

async function testConnection() {
    const isProduction = process.env.NODE_ENV === 'production'
    const connectionString = process.env.DATABASE_URL

    const pool = new Pool({
        connectionString,
        ssl: isProduction ? { rejectUnauthorized: false } : false
    })

    try {
        console.log('Testando conexão com o Supabase a partir do Node.js backend...')
        
        // Testa se o RLS está bloqueando a leitura aqui ou se o Node de fato tem acesso direto
        const result = await pool.query('SELECT * FROM public.user_permissions LIMIT 1')
        console.log('✅ SUCESSO! O backend conseguiu consultar a tabela user_permissions sem ser bloqueado pelo RLS.')
        console.log(`Linhas retornadas (vazias ou não): ${result.rows.length}`)

        // Verifica o RLS no banco
        console.log('\nAuditando tabelas com RLS desligado...')
        const rlsCheck = await pool.query(`
            SELECT relname
            FROM pg_class
            WHERE relkind = 'r'
            AND relname NOT LIKE 'pg_%'
            AND relname NOT LIKE 'sql_%'
            AND NOT relrowsecurity
            AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
        `)
        
        if (rlsCheck.rows.length > 0) {
            console.log('⚠️ As seguintes tabelas AINDA ESTÃO com o RLS desligado (públicas e vulneráveis):')
            rlsCheck.rows.forEach(row => console.log(`- ${row.relname}`))
        } else {
            console.log('🔒 ÓTIMO! TODAS as tabelas do esquema public estão protegidas com RLS ativado.')
        }

    } catch (e) {
        if (e.message.includes('relation "public.user_permissions" does not exist')) {
            console.log('Aviso: A tabela user_permissions não existe neste banco de dados.')
        } else {
            console.error('❌ ERRO:', e.message)
        }
    } finally {
        await pool.end()
    }
}

testConnection()
