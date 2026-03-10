import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

const COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#a3a3a3']

function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
        <div className="csp-chart-tooltip">
            <strong>{d.category}</strong>
            <span>{formatBRL(d.total)}</span>
            <span className="csp-tooltip-sub">{d.count} transações</span>
        </div>
    )
}

export default function SpendingByCategoryChart({ data }) {
    if (!data || data.length === 0) return null

    return (
        <div className="csp-chart-block">
            <h3 className="csp-section-title">🏷️ Gasto por Categoria</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, data.length * 44)}>
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                    <YAxis type="category" dataKey="category" tick={{ fill: '#e2e8f0', fontSize: 12 }} width={130} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={24}>
                        {data.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
