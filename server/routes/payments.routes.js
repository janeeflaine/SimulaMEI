// server/routes/payments.routes.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');
const { authMiddleware } = require('../middleware/auth');

// Apply authMiddleware to all routes in this file
router.use(authMiddleware);

// Simple CPF validation regex
const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

router.post('/pix', async (req, res) => {
    const { amount, payer_name, payer_cpf, planId } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Valor inválido' });
    }
    if (!payer_name || payer_name.trim() === '') {
        return res.status(400).json({ message: 'Nome completo é obrigatório' });
    }
    if (!payer_cpf || !cpfRegex.test(payer_cpf)) {
        return res.status(400).json({ message: 'CPF inválido' });
    }
    try {
        // encrypt CPF before storing
        const encryptedCpf = encrypt(payer_cpf);
        const result = await db.query(
            `INSERT INTO payments ("userId", amount, "planId", payer_name, payer_cpf, status, "qrCode", "qrCodeBase64")
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7) RETURNING id, "qrCodeBase64"`,
            [req.user.id, amount, planId || null, payer_name, encryptedCpf, null, null]
        );
        // TODO: generate real PIX QR code – placeholder for now
        const payment = result.rows[0];
        res.status(201).json({ paymentId: payment.id, qrCodeBase64: payment.qrCodeBase64 });
    } catch (err) {
        console.error('PIX payment error', err);
        res.status(500).json({ message: 'Erro interno ao criar pagamento' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Pagamento não encontrado' });
        const payment = result.rows[0];
        // decrypt CPF for display (masked)
        const decryptedCpf = decrypt(payment.payer_cpf);
        payment.payer_cpf = decryptedCpf.replace(/\d{9}(\d{2})$/, '******$1');
        res.json(payment);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao buscar pagamento' });
    }
});

module.exports = router;
