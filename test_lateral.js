const { db } = require('./server/db');

async function test() {
    try {
        const query = `
            SELECT 
                c.id, 
                c.name, 
                COALESCE(act."totalAmount", 0) as "currentMonthTotal",
                nx."totalAmount" as next_total
            FROM credit_cards c
            LEFT JOIN LATERAL (
                SELECT "totalAmount", status, "referenceMonth", "referenceYear"
                FROM card_invoices
                WHERE "cardId" = c.id AND status != 'CANCELLED'
                ORDER BY 
                    CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END ASC,
                    CASE WHEN status = 'PENDING' THEN "referenceYear" END ASC, 
                    CASE WHEN status = 'PENDING' THEN "referenceMonth" END ASC,
                    "referenceYear" DESC,
                    "referenceMonth" DESC
                LIMIT 1
            ) act ON true
            LEFT JOIN LATERAL (
                SELECT "totalAmount"
                FROM card_invoices
                WHERE "cardId" = c.id AND status != 'CANCELLED'
                  AND ("referenceYear" > act."referenceYear" OR ("referenceYear" = act."referenceYear" AND "referenceMonth" > act."referenceMonth"))
                ORDER BY "referenceYear" ASC, "referenceMonth" ASC
                LIMIT 1
            ) nx ON true
            WHERE c."userId" = 1
        `;
        const { rows } = await db.query(query);
        console.log(rows);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
test();
