const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const { init } = require('./db')

// Initialize DB
init()
const authRoutes = require('./routes/auth.routes')
const simulationRoutes = require('./routes/simulation.routes')
const adminRoutes = require('./routes/admin.routes')
const planRoutes = require('./routes/plan.routes')
const paymentRoutes = require('./routes/payment.routes')
const settingsRoutes = require('./routes/settings.routes')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/settings', settingsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/simulate', simulationRoutes)
app.use('/api/simulations', simulationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/payments', paymentRoutes)


// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Root message moved or removed to allow frontend serving
// app.get('/', (req, res) => {
//     res.json({ message: '🚀 SimulaMEI API is running!' })
// })

// Serve static files (Production handling)
const clientBuildPath = path.join(__dirname, '../client/dist')
console.log('Checking for static files at:', clientBuildPath)

app.use(express.static(clientBuildPath))

// Catch-all for SPA (must be last route)
// Express 5 requires Regex or specific syntax for wildcard
app.get(/.*/, (req, res) => {
    // Avoid serving index.html for API 404s
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: 'API Route not found' })
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'))
})

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({ message: 'Erro interno do servidor' })
})

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
})
