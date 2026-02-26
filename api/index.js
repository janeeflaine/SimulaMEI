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
const paymentRoutes = require('../server/routes/payments.routes')
const settingsRoutes = require('../server/routes/settings.routes')
const alertRoutes = require('../server/routes/alert.routes')
const financeRoutes = require('../server/routes/finance.routes')

const app = express()

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

// Routes
app.use('/api/settings', settingsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/simulate', simulationRoutes)
app.use('/api/simulations', simulationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api/finance', financeRoutes)

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

module.exports = app
