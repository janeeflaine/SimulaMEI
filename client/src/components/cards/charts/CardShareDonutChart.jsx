import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

const DONUT_COLORS = ['#6366f1', '#f97316', '#10b981', '#f43f5e', '#eab308', '#06b6d4', '#8b5cf6', '#ec4899']

function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
        <div className="csp-chart-tooltip">
            <strong>{d.name}</strong>
            <span>{formatBRL(d.total)}</span>
            <span className="csp-tooltip-sub">{d.percent}%</span>
        </div>
    )
}

export default function CardShareDonutChart({ data }) {
    if (!data || data.length === 0) return null

    return (
        <div className="csp-chart-block">
            <h3 className="csp-section-title">🎯 Participação por Cartão</h3>
            <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                    <Pie
                        data={data}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        strokeWidth={0}
                    >
                        {data.map((_, i) => (
                            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    )
}
