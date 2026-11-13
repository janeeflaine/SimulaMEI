/**
 * Marca do EuSempreMEI: três barras crescentes nas cores da logo
 * (verde #4CC417, laranja #FF8C1A, azul #2F8CFF). Substitui o emoji 📊,
 * que mudava de desenho em cada celular.
 */
export default function BrandMark({ size = 28, className = '' }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 32 32"
            aria-hidden="true"
            focusable="false"
        >
            <rect x="3" y="15" width="7" height="14" rx="2.5" fill="#4CC417" />
            <rect x="12.5" y="9" width="7" height="20" rx="2.5" fill="#FF8C1A" />
            <rect x="22" y="3" width="7" height="26" rx="2.5" fill="#2F8CFF" />
        </svg>
    )
}
