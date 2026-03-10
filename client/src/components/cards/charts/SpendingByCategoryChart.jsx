import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

const UNIFIED_PALETTE = ['#10b981', '#6366f1', '#f97316', '#f43f5e', '#06b6d4', '#eab308', '#8b5cf6', '#94a3b8']
const OUTROS_COLOR = '#94a3b8' // slate for "Outros"

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
            <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <XAxis type="number" tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="category" tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 500 }} width={140} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={24}>
                        {data.map((entry, i) => (
                            <Cell
                                key={i}
                                fill={entry.category === 'Outros' ? OUTROS_COLOR : UNIFIED_PALETTE[i % (UNIFIED_PALETTE.length - 1)]}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
