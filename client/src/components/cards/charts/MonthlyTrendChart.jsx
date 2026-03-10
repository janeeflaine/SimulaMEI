import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts'

const BAR_COLOR = '#10b981' // --color-primary (emerald)

function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="csp-chart-tooltip">
            <strong>{label}</strong>
            <span>{formatBRL(payload[0].value)}</span>
        </div>
    )
}

export default function MonthlyTrendChart({ data }) {
    if (!data || data.length === 0) return null

    return (
        <div className="csp-chart-block">
            <h3 className="csp-section-title">📈 Evolução Mensal</h3>
            <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="total" fill={BAR_COLOR} radius={[6, 6, 0, 0]} barSize={32} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
