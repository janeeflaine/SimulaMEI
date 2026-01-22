const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const { init } = require('./db')

init()

const authRoutes = require('./routes/auth.routes')
const simulationRoutes = require('./routes/simulation.routes')
const adminRoutes = require('./routes/admin.routes')
const planRoutes = require('./routes/plan.routes')
const paymentRoutes = require('./routes/payments.routes')
const settingsRoutes = require('./routes/settings.routes')
const alertRoutes = require('./routes/alert.routes')
const financeRoutes = require('./routes/finance.routes')
const familyRoutes = require('./routes/family.routes')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

app.use('/api/auth', authRoutes)
app.use('/api/simulate', simulationRoutes)
app.use('/api/simulations', simulationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api/finance', financeRoutes)
app.use('/api/family', familyRoutes)

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const clientBuildPath = path.join(__dirname, '../client/dist')
app.use(express.static(clientBuildPath))

app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: 'API Route not found' })
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'))
})

app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({ message: 'Erro interno do servidor' })
})

app.listen(PORT, () => {
    console.log('🚀 Servidor rodando com sucesso na porta ' + PORT)
})
