/**
 * Colunas novas que as rotas usam. Ficam aqui (e não só no init do db.js) porque
 * na Vercel o init roda sem ninguém esperar: o servidor responde e congela, e a
 * preparação pode não terminar. Em 14/11/2026 a coluna "transferId" não foi
 * criada e salvar, excluir e transferir davam erro 500.
 *
 * ensureSchema (db.js) confere estas colunas uma vez por servidor, antes do primeiro
 * pedido, e roda só o que falta. Tudo idempotente: o init também chama as mesmas funções.
 */

const alertSentKey = async (q) => {
    await q('ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS "lastSentKey" TEXT')
}

// Transferência: os dois lados ligados por "transferId"; as antigas pelo par gravado
// em seguida (saída id N, entrada id N+1, mesma pessoa, data e valor); cada lado com
// o tipo da sua carteira
const transferLinks = async (q) => {
    await q('ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS "transferId" TEXT')
    await q('CREATE INDEX IF NOT EXISTS idx_finance_transactions_transfer ON finance_transactions ("transferId") WHERE "transferId" IS NOT NULL')
    await q(`
        WITH pairs AS (
          SELECT d.id AS out_id, r.id AS in_id
          FROM finance_transactions d
          JOIN finance_transactions r
            ON r.id = d.id + 1 AND r."userId" = d."userId" AND r.amount = d.amount AND r.date = d.date
           AND r.type = 'RECEITA' AND r."paymentMethod" = 'Transferência' AND r."transferId" IS NULL
          WHERE d.type = 'DESPESA' AND d."paymentMethod" = 'Transferência' AND d."transferId" IS NULL
        )
        UPDATE finance_transactions t SET "transferId" = 'old-' || p.out_id
        FROM pairs p WHERE t.id IN (p.out_id, p.in_id)
    `)
    await q(`
        UPDATE finance_transactions t
        SET target = CASE b."account_type" WHEN 'PJ' THEN 'BUSINESS' ELSE 'PERSONAL' END
        FROM business_units b
        WHERE b.id = t."business_unit_id" AND b."ownerId" = t."userId"
          AND t."paymentMethod" = 'Transferência'
          AND t.target IS DISTINCT FROM (CASE b."account_type" WHEN 'PJ' THEN 'BUSINESS' ELSE 'PERSONAL' END)
    `)
}

// Limite do MEI por ano (LC 238/2026); linhas antigas ficam com o ano em que foram gravadas
const meiLimitYear = async (q) => {
    await q('ALTER TABLE mei_limits ADD COLUMN IF NOT EXISTS year INTEGER')
    await q(`UPDATE mei_limits SET year = EXTRACT(YEAR FROM COALESCE("updatedAt", NOW()) AT TIME ZONE 'America/Sao_Paulo')::int WHERE year IS NULL`)
}

// Salário mínimo gravado pelo admin em Regras de Cálculo (vazio: vale o da lei, logic/meiTax.js)
const rulesMinimumWage = async (q) => {
    await q('ALTER TABLE calculation_rules ADD COLUMN IF NOT EXISTS "minimumWage" REAL')
}

const UPGRADES = [
    { table: 'user_alerts', column: 'lastSentKey', run: alertSentKey },
    { table: 'finance_transactions', column: 'transferId', run: transferLinks },
    { table: 'mei_limits', column: 'year', run: meiLimitYear },
    { table: 'calculation_rules', column: 'minimumWage', run: rulesMinimumWage }
]

// Roda só as que faltam (uma consulta rápida quando já está tudo certo)
async function applyMissing(q) {
    const { rows } = await q(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = ANY($1::text[]) AND column_name = ANY($2::text[])`,
        [UPGRADES.map(u => u.table), UPGRADES.map(u => u.column)]
    )
    const have = new Set(rows.map(r => `${r.table_name}.${r.column_name}`))
    const ran = []
    for (const u of UPGRADES) {
        if (have.has(`${u.table}.${u.column}`)) continue
        await u.run(q)
        ran.push(`${u.table}.${u.column}`)
    }
    return ran
}

module.exports = { alertSentKey, transferLinks, meiLimitYear, rulesMinimumWage, applyMissing, UPGRADES }
