import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'

const STACK_COLORS = ['#6366f1', '#f97316', '#10b981', '#f43f5e', '#eab308', '#06b6d4', '#8b5cf6', '#ec4899']

function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="csp-chart-tooltip">
            <strong>{label}</strong>
            {payload.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                    <span>{p.name}: {formatBRL(p.value)}</span>
                </div>
            ))}
        </div>
    )
}

export default function MonthlyCardStackChart({ data, cardNames }) {
    if (!data || data.length === 0 || !cardNames?.length) return null

    return (
        <div className="csp-chart-block">
            <h3 className="csp-section-title">📊 Distribuição Mensal por Cartão</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} />
                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#475569' }} />
                    {cardNames.map((name, i) => (
                        <Bar key={name} dataKey={name} stackId="cards" fill={STACK_COLORS[i % STACK_COLORS.length]} radius={i === cardNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
