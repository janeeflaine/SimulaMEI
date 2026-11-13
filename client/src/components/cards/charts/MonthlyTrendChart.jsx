import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const BAR_COLOR = '#12284a' // azul-marinho: o que saiu nos cartões
const BAR_SOFT = '#a9b8cc' // os outros meses, quando um mês está escolhido

const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
// Abaixo de mil, mostra os centavos quando a marca tem (R$ 2,5), em vez de arredondar e repetir valores
const short = (v) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`)

/** Marcas redondas no eixo (0, 1 mil, 2 mil...) em vez das que o gráfico calcula sozinho */
const niceTicks = (data) => {
    const max = Math.max(0, ...data.map(d => d.total || 0))
    if (max <= 0) return [0]
    const raw = max / 4
    const power = 10 ** Math.floor(Math.log10(raw))
    const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw)
    const ticks = []
    for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(t)
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
    return ticks
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="csp-tooltip">
            <strong>{label}</strong>
            <span>{brl(payload[0].value)}</span>
        </div>
    )
}

/**
 * Barras mês a mês. Opcional: activeMonth destaca um mês e onSelect(mês)
 * deixa clicar na barra (o Painel do cartão usa para abrir as compras do mês).
 */
export default function MonthlyTrendChart({ data, activeMonth = null, onSelect }) {
    if (!data || data.length === 0) return null
    const ticks = niceTicks(data)

    return (
        <div className="csp-chart">
            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e3e8ef" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#5b6b80', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis ticks={ticks} domain={[0, ticks[ticks.length - 1]]} tickFormatter={short} tick={{ fill: '#5b6b80', fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(18, 40, 74, 0.05)' }} />
                    <Bar
                        dataKey="total"
                        fill={BAR_COLOR}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={32}
                        cursor={onSelect ? 'pointer' : undefined}
                        onClick={onSelect ? (_, index) => { if (data[index]?.total) onSelect(data[index].month) } : undefined}
                    >
                        {data.map(d => (
                            <Cell key={d.month ?? d.label} fill={activeMonth && d.month !== activeMonth ? BAR_SOFT : BAR_COLOR} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
