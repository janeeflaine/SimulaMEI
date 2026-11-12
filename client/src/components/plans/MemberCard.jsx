import './MemberCard.css'

/**
 * Cartão de assinante do EuSempreMEI: azul da logo, faixa metálica conforme o
 * plano (ouro, prata ou verde no gratuito). Usado em Minha conta e em Planos.
 *
 * tier:   "ouro" | "prata" | "gratuito"
 * label:  nome do plano no canto do cartão
 * body:   conteúdo do meio (titular ou preço)
 * footer: linha de baixo (situação, renovação...)
 * shine:  brilho único ao aparecer (respeita "reduzir movimento")
 */
export default function MemberCard({ tier = 'gratuito', label, body, footer, shine = false, className = '' }) {
    return (
        <div className={`member-card member-card--${tier} ${shine ? 'member-card--shine' : ''} ${className}`}>
            <div className="member-card__top">
                <span className="member-card__mark" aria-hidden="true">
                    <i /><i /><i />
                </span>
                <span className="member-card__brand">EuSempreMEI</span>
                <span className="member-card__tier">{label}</span>
            </div>
            <div className="member-card__body">{body}</div>
            <div className="member-card__bottom">{footer}</div>
        </div>
    )
}
