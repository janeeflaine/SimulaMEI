const express = require('express')
const cors = require('cors')
require('dotenv').config()

const { init } = require('../server/db')

// Initialize DB
init()

const authRoutes = require('../server/routes/auth.routes')
const simulationRoutes = require('../server/routes/simulation.routes')
const adminRoutes = require('../server/routes/admin.routes')
const planRoutes = require('../server/routes/plan.routes')
const settingsRoutes = require('../server/routes/settings.routes')
const alertRoutes = require('../server/routes/alert.routes')
const financeRoutes = require('../server/routes/finance.routes')
const invoiceRoutes = require('../server/routes/invoice.routes')
const stripeRoutes = require('../server/routes/stripe.routes')

const app = express()

// Middleware
app.use(cors())

// STRIPE WEBHOOK: Must be placed BEFORE express.json() to preserve the raw body for signature verification!
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeRoutes.webhookHandler)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

// Routes
app.use('/api/settings', settingsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/simulate', simulationRoutes)
app.use('/api/simulations', simulationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api/finance', financeRoutes)
app.use('/api/finance/invoices', invoiceRoutes)
app.use('/api/stripe', stripeRoutes.router)

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handler
app.use((err, req, res, next) => {
    console.error('Express Error:', err.stack)
    res.status(500).json({ message: 'Erro interno do servidor na Vercel', error: err.message })
})

// Startup diagnostic log
console.log('Serverless Function Booting...')
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL)
console.log('NODE_ENV:', process.env.NODE_ENV)

module.exports = app
