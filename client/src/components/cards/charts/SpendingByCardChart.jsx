import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts'

const UNIFIED_PALETTE = ['#10b981', '#6366f1', '#f97316', '#f43f5e', '#06b6d4', '#eab308', '#8b5cf6', '#94a3b8']

function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatBarLabel(entry) {
    return `${formatBRL(entry.total)}  (${entry.percent}%)`
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
            <ResponsiveContainer width="100%" height={Math.max(180, data.length * 56)}>
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 140, left: 10, bottom: 5 }}>
                    <XAxis type="number" tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#1e293b', fontSize: 13, fontWeight: 500 }} width={140} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={28}>
                        {data.map((_, i) => (
                            <Cell key={i} fill={UNIFIED_PALETTE[i % UNIFIED_PALETTE.length]} />
                        ))}
                        <LabelList
                            content={({ x, y, width, height, value, index }) => {
                                const entry = data[index]
                                if (!entry) return null
                                return (
                                    <text
                                        x={x + width + 8}
                                        y={y + height / 2}
                                        fill="#334155"
                                        fontSize={12}
                                        fontWeight={600}
                                        dominantBaseline="central"
                                    >
                                        {formatBRL(entry.total)}  ({entry.percent}%)
                                    </text>
                                )
                            }}
                        />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
