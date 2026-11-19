/**
 * Script de diagnóstico e teste de conexão SSL com o PostgreSQL (Supabase).
 *
 * Execução:
 *   node server/scripts/test_db_ssl.js
 */
require('dotenv').config()
const { Client } = require('pg')
const { getSslConfig } = require('../db')

async function run() {
  console.log('==================================================')
  console.log('🧪 Diagnóstico de Conexão SSL com o PostgreSQL')
  console.log('==================================================\n')

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('❌ Erro: DATABASE_URL não configurada no ambiente.')
    process.exit(1)
  }

  let parsedUrl
  try {
    parsedUrl = new URL(connectionString)
  } catch (err) {
    console.error('❌ Erro: Formato inválido em DATABASE_URL.')
    process.exit(1)
  }

  console.log(`📌 Host: ${parsedUrl.hostname}:${parsedUrl.port || 5432}`)
  console.log(`📌 Usuário: ${decodeURIComponent(parsedUrl.username)}`)
  console.log(`📌 Banco: ${parsedUrl.pathname.slice(1)}`)

  const sslConfig = getSslConfig()

  if (sslConfig && sslConfig.ca) {
    console.log('🔒 Certificado CA detectado: Sim')
    console.log('🔒 Modo de validação: Estrito (rejectUnauthorized: true)')
  } else if (sslConfig) {
    console.log('⚠️ Certificado CA detectado: Não')
    console.log('⚠️ Modo de validação: Criptografado sem validação de CA (rejectUnauthorized: false)')
    console.log('💡 Dica: Para validar estritamente, defina SUPABASE_CA_CERT ou salve server/certs/prod-ca-2021.crt')
  } else {
    console.log('🔓 SSL: Desativado')
  }

  console.log('\n🔄 Tentando conectar ao banco de dados...')

  const client = new Client({
    connectionString,
    ssl: sslConfig
  })

  try {
    const startTime = Date.now()
    await client.connect()
    const elapsed = Date.now() - startTime

    const res = await client.query(`
      SELECT 
        NOW() as current_time, 
        current_database() as database_name, 
        current_user as user_name,
        version() as pg_version
    `)
    const row = res.rows[0]

    console.log(`\n✅ CONEXÃO ESTABELECIDA COM SUCESSO! (${elapsed}ms)`)
    console.log('--------------------------------------------------')
    console.log(`🕒 Horário no banco: ${row.current_time}`)
    console.log(`🗄️ Banco ativo: ${row.database_name}`)
    console.log(`👤 Usuário autenticado: ${row.user_name}`)
    console.log(`📦 Versão: ${row.pg_version.split(',')[0]}`)

    if (sslConfig && sslConfig.ca) {
      console.log('\n🛡️ O certificado da Supabase foi verificado com SUCESSO! A conexão é autenticada e protegida contra ataques MITM.')
    }

    await client.end()
    process.exit(0)
  } catch (err) {
    console.error('\n❌ FALHA NA CONEXÃO:')
    console.error(`   Código: ${err.code || 'N/A'}`)
    console.error(`   Mensagem: ${err.message}`)

    if (err.message && err.message.includes('self-signed certificate')) {
      console.error('\n💡 Causa: O certificado apresentado pelo servidor não é confiável para a CA do sistema.')
      console.error('👉 Solução: Baixe o prod-ca-2021.crt do painel Supabase e defina SUPABASE_CA_CERT.')
    } else if (err.code === '28P01' || (err.message && err.message.includes('password authentication failed'))) {
      console.error('\n💡 Causa: A senha do usuário no DATABASE_URL está incorreta ou foi redefinida.')
      console.error('👉 Solução: Verifique a senha da sua conta/projeto no painel da Supabase e atualize o .env.')
    } else if (err.code === 'ENOTFOUND') {
      console.error('\n💡 Causa: O hostname do banco não foi encontrado pelo DNS.')
      console.error('👉 Solução: Verifique se o endereço do pooler da Supabase está correto.')
    }

    if (client) {
      try { await client.end() } catch (_) {}
    }
    process.exit(1)
  }
}

run()
