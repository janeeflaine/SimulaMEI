/**
 * Unit Tests for calculateBillingDate utility
 * 
 * Tests the Brazilian credit card billing cycle logic:
 * - Purchase before/on closing day → current cycle
 * - Purchase after closing day → next cycle
 * - DueDay < ClosingDay → due date wraps to next month
 * - Year boundary handling
 * - Short month handling (February)
 */

const { calculateBillingDate } = require('../utils/billingDate')

describe('calculateBillingDate', () => {

    // === BASIC SCENARIOS ===

    test('Purchase before closing day → same month due date', () => {
        // Compra 05/12, fecha dia 10, vence dia 20 → billing 20/12
        expect(calculateBillingDate('2025-12-05', 10, 20)).toBe('2025-12-20')
    })

    test('Purchase on closing day → same month due date', () => {
        // Compra 10/12, fecha dia 10, vence dia 20 → billing 20/12
        expect(calculateBillingDate('2025-12-10', 10, 20)).toBe('2025-12-20')
    })

    test('Purchase after closing day → next month due date', () => {
        // Compra 15/12, fecha dia 10, vence dia 20 → billing 20/01 (next month)
        expect(calculateBillingDate('2025-12-15', 10, 20)).toBe('2026-01-20')
    })

    // === YEAR BOUNDARY ===

    test('Purchase on Dec 30 (after closing day 10) → January billing', () => {
        // Compra 30/12, fecha dia 10, vence dia 20 → billing 20/01/2026
        expect(calculateBillingDate('2025-12-30', 10, 20)).toBe('2026-01-20')
    })

    test('Purchase on Dec 05 (before closing day 10) → December billing', () => {
        // Compra 05/12, fecha dia 10, vence dia 20 → billing 20/12/2025
        expect(calculateBillingDate('2025-12-05', 10, 20)).toBe('2025-12-20')
    })

    // === DUE DAY < CLOSING DAY (vencimento no mês seguinte ao fechamento) ===

    test('DueDay < ClosingDay, purchase before closing → due next month', () => {
        // Compra 20/01, fecha dia 25, vence dia 5 → fecha em Jan, vence 05/02
        expect(calculateBillingDate('2025-01-20', 25, 5)).toBe('2025-02-05')
    })

    test('DueDay < ClosingDay, purchase on closing day → due next month', () => {
        // Compra 25/01, fecha dia 25, vence dia 5 → fecha em Jan, vence 05/02
        expect(calculateBillingDate('2025-01-25', 25, 5)).toBe('2025-02-05')
    })

    test('DueDay < ClosingDay, purchase after closing → skips to next cycle', () => {
        // Compra 26/01, fecha dia 25, vence dia 5
        // Compra depois do fechamento → ciclo seguinte: fecha Fev, vence 05/03
        expect(calculateBillingDate('2025-01-26', 25, 5)).toBe('2025-03-05')
    })

    test('DueDay < ClosingDay, purchase at year end after closing', () => {
        // Compra 27/12, fecha dia 25, vence dia 5
        // Compra depois do fechamento → ciclo: fecha Jan/2026, vence 05/02/2026
        expect(calculateBillingDate('2025-12-27', 25, 5)).toBe('2026-02-05')
    })

    // === SHORT MONTHS (FEBRUARY) ===

    test('DueDay 31 in February → caps to Feb 28', () => {
        // Compra 26/01, fecha dia 25, vence dia 31
        // Ciclo: fecha Fev, dueDay >= closingDay so no extra month, vence Feb 28
        expect(calculateBillingDate('2025-01-26', 25, 31)).toBe('2025-02-28')
    })

    test('DueDay 30 in February leap year → caps to Feb 29', () => {
        // 2024 is a leap year
        // Compra 26/01/2024, fecha dia 25, vence dia 30
        expect(calculateBillingDate('2024-01-26', 25, 30)).toBe('2024-02-29')
    })

    // === EDGE CASES ===

    test('String date input works', () => {
        expect(calculateBillingDate('2025-06-15', 10, 20)).toBe('2025-07-20')
    })

    test('Purchase on Jan 1st, closing day 1, due day 15 → same month', () => {
        // Compra no dia 1, fecha dia 1 → antes/no fechamento → mesma fatura
        expect(calculateBillingDate('2025-01-01', 1, 15)).toBe('2025-01-15')
    })

    test('ClosingDay == DueDay → same month (no wrap)', () => {
        // fecha dia 15, vence dia 15
        // Compra dia 10 (antes fechamento) → billing 15/01
        expect(calculateBillingDate('2025-01-10', 15, 15)).toBe('2025-01-15')
    })

    test('ClosingDay == DueDay, purchase after closing → next month', () => {
        // fecha dia 15, vence dia 15
        // Compra dia 20 (depois fechamento) → billing 15/02
        expect(calculateBillingDate('2025-01-20', 15, 15)).toBe('2025-02-15')
    })

    // === REALISTIC BRAZILIAN EXAMPLE ===

    test('Real example: Nubank (fecha 3, vence 10), purchase Feb 28', () => {
        // Compra 28/02, fecha dia 3, vence dia 10
        // 28 > 3, logo ciclo seguinte: fecha Mar, dueDay(10) > closingDay(3) → mesmos mês
        // Vence 10/03
        expect(calculateBillingDate('2025-02-28', 3, 10)).toBe('2025-03-10')
    })

    test('Real example: Nubank (fecha 3, vence 10), purchase Mar 2', () => {
        // Compra 02/03, fecha dia 3, vence dia 10
        // 2 <= 3, logo mesma fatura: fecha Mar, vence 10/03
        expect(calculateBillingDate('2025-03-02', 3, 10)).toBe('2025-03-10')
    })
})
