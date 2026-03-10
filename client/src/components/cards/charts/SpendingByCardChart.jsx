import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed', '#4f46e5', '#818cf8', '#5b21b6']

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
            <span className="csp-tooltip-sub">{d.percent}% do total</span>
        </div>
    )
}

export default function SpendingByCardChart({ data }) {
    if (!data || data.length === 0) return null

    return (
        <div className="csp-chart-block">
            <h3 className="csp-section-title">💳 Gasto por Cartão</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#e2e8f0', fontSize: 13 }} width={110} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={28}>
                        {data.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
