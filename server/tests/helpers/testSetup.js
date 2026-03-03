/**
 * Test Setup — Mocks for DB, Auth, and Express app
 * Used by all invoice-related test files
 */
const express = require('express')
const jwt = require('jsonwebtoken')

const JWT_SECRET = 'test-secret-key'

// --- Mock User ---
const mockOuroUser = {
    id: 1,
    name: 'Test User',
    email: 'test@test.com',
    role: 'USER',
    plan: 'Ouro',
    planId: 3,
    subscriptionStatus: 'active',
    isInTrial: false,
    trialExpired: false
}

const mockFreeUser = {
    id: 2,
    name: 'Free User',
    email: 'free@test.com',
    role: 'USER',
    plan: 'Gratuito',
    planId: 1,
    subscriptionStatus: 'active',
    isInTrial: false,
    trialExpired: false
}

// --- Mock DB ---
const mockDb = {
    query: jest.fn()
}

const mockPool = {
    query: jest.fn(),
    connect: jest.fn()
}

// --- Token Generator ---
const generateTestToken = (user = mockOuroUser) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: '1h' }
    )
}

// --- Mock Auth Middleware ---
const createMockAuthMiddleware = (user = mockOuroUser) => {
    return (req, res, next) => {
        req.user = { ...user }
        next()
    }
}

// --- Mock Ouro-Only Middleware ---
const createMockOuroOnly = (user = mockOuroUser) => {
    return (req, res, next) => {
        if (req.user.plan !== 'Ouro' && !req.user.isInTrial) {
            return res.status(403).json({ message: 'Recurso exclusivo do plano Ouro' })
        }
        next()
    }
}

// --- Mock Wallet Ownership Middleware ---
const mockWalletOwnership = (req, res, next) => next()

// --- Sample Data ---
const sampleCard = {
    id: 1,
    userId: 1,
    name: 'Nubank PJ',
    lastFour: '4321',
    brand: 'Mastercard',
    closingDay: 5,
    dueDate: 12,
    creditLimit: 5000,
    imageUrl: null
}

const sampleInvoice = {
    id: 1,
    userId: 1,
    cardId: 1,
    referenceMonth: 3,
    referenceYear: 2026,
    totalAmount: 1500.50,
    dueDate: '2026-03-12',
    closingDate: '2026-03-05',
    status: 'PENDING',
    paidAmount: 0,
    paidAt: null
}

const sampleInvoiceItem = {
    id: 1,
    invoiceId: 1,
    userId: 1,
    description: 'UBER *TRIP',
    amount: 25.90,
    transactionDate: '2026-02-28',
    categoryId: null,
    aiCategory: 'Transporte',
    aiConfidence: 0.92,
    isConfirmed: false,
    installment: null
}

module.exports = {
    JWT_SECRET,
    mockOuroUser,
    mockFreeUser,
    mockDb,
    mockPool,
    generateTestToken,
    createMockAuthMiddleware,
    createMockOuroOnly,
    mockWalletOwnership,
    sampleCard,
    sampleInvoice,
    sampleInvoiceItem
}
