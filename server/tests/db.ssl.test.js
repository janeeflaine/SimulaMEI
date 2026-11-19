/**
 * Testes da configuração de SSL do banco de dados (server/db.js)
 */
const { getSslConfig } = require('../db')

describe('Database SSL Configuration', () => {
  const origEnv = process.env

  beforeEach(() => {
    process.env = { ...origEnv }
    delete process.env.SUPABASE_CA_CERT
    delete process.env.DATABASE_CA_CERT
  })

  afterAll(() => {
    process.env = origEnv
  })

  test('ativa verificação estrita quando SUPABASE_CA_CERT contém certificado PEM', () => {
    const fakeCert = '-----BEGIN CERTIFICATE-----\nMIIDFakeCert...\n-----END CERTIFICATE-----'
    process.env.SUPABASE_CA_CERT = fakeCert

    const ssl = getSslConfig()
    expect(ssl).toEqual({
      rejectUnauthorized: true,
      ca: fakeCert
    })
  })

  test('suporta quebras de linha escapadas "\\n" em variável de ambiente', () => {
    const escapedCert = '-----BEGIN CERTIFICATE-----\\nMIIDFakeCert...\\n-----END CERTIFICATE-----'
    process.env.SUPABASE_CA_CERT = escapedCert

    const ssl = getSslConfig()
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(ssl.ca).toContain('\n')
    expect(ssl.ca).not.toContain('\\n')
  })

  test('suporta certificado em Base64', () => {
    const raw = '-----BEGIN CERTIFICATE-----\nMIIBase64...\n-----END CERTIFICATE-----'
    process.env.DATABASE_CA_CERT = Buffer.from(raw).toString('base64')

    const ssl = getSslConfig()
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(ssl.ca).toBe(raw)
  })

  test('mantém fallback criptografado rejectUnauthorized: false em produção sem CA', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.SUPABASE_CA_CERT
    delete process.env.DATABASE_CA_CERT

    const ssl = getSslConfig()
    expect(ssl).toEqual({
      rejectUnauthorized: false
    })
  })

  test('mantém fallback criptografado quando DATABASE_URL aponta para supabase.com', () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL = 'postgresql://user:pass@aws-0.pooler.supabase.com:6543/postgres'

    const ssl = getSslConfig()
    expect(ssl).toEqual({
      rejectUnauthorized: false
    })
  })
})
