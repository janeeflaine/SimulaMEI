import { FEATURE_LABELS, formatBRL } from './planFeatures'
import './PlanComparison.css'

function Check({ on }) {
    return on ? (
        <svg className="plan-check" viewBox="0 0 20 20" aria-label="Incluído" role="img">
            <circle cx="10" cy="10" r="9" />
            <path d="M6 10.4l2.6 2.6L14 7.6" />
        </svg>
    ) : (
        <span className="plan-dash" aria-label="Não incluído" role="img">–</span>
    )
}

/**
 * Tabela que compara o que cada plano inclui (Minha conta e Planos).
 *
 * plans:         planos já ordenados (do mais barato ao mais caro)
 * currentPlanId: plano do usuário logado, destacado como "Seu plano"
 * currentLabel:  texto acima do nome do plano atual (ex.: "Pagamento pendente")
 * renderAction:  (plan, { isCurrent, stacked }) => botão do rodapé de cada coluna
 * stackActionsOnMobile: no celular, tira os botões do rodapé (não cabem nas
 *                colunas) e mostra um por linha abaixo da tabela (stacked = true)
 */
export default function PlanComparison({ plans, currentPlanId, currentLabel = 'Seu plano', renderAction, stackActionsOnMobile = false }) {
    const rows = FEATURE_LABELS.filter(([key]) => plans.some(p => p.features && key in p.features))
    const isCurrent = (plan) => currentPlanId != null && Number(currentPlanId) === Number(plan.id)

    const stacked = stackActionsOnMobile && renderAction
        ? plans.map(plan => ({ plan, node: renderAction(plan, { isCurrent: isCurrent(plan), stacked: true }) })).filter(a => a.node)
        : []

    return (
        <>
        <div className={`plan-table-wrap ${stackActionsOnMobile ? 'plan-table-wrap--stack' : ''}`}>
            <table className="plan-table">
                <caption className="plan-table__caption">Comparação dos planos do EuSempreMEI</caption>
                <thead>
                    <tr>
                        <th scope="col" className="plan-table__feature-head"><span className="plan-table__caption">Recurso</span></th>
                        {plans.map(plan => (
                            <th key={plan.id} scope="col" className={isCurrent(plan) ? 'is-current' : ''}>
                                {isCurrent(plan) && <span className="plan-table__yours">{currentLabel}</span>}
                                <span className="plan-table__name">{plan.name}</span>
                                <span className="plan-table__price">
                                    {Number(plan.price) === 0
                                        ? 'Grátis'
                                        : <>{formatBRL(plan.price)}<small>/mês</small></>}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([key, label]) => (
                        <tr key={key}>
                            <th scope="row">{label}</th>
                            {plans.map(plan => (
                                <td key={plan.id} className={isCurrent(plan) ? 'is-current' : ''}>
                                    <Check on={!!plan.features?.[key]} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                {renderAction && (
                    <tfoot>
                        <tr>
                            <th scope="row"><span className="plan-table__caption">Ação</span></th>
                            {plans.map(plan => (
                                <td key={plan.id} className={isCurrent(plan) ? 'is-current' : ''}>
                                    {renderAction(plan, { isCurrent: isCurrent(plan) })}
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
        {stacked.length > 0 && (
            <div className="plan-table__stacked-actions">
                {stacked.map(({ plan, node }) => <div key={plan.id}>{node}</div>)}
            </div>
        )}
        </>
    )
}

/**
 * Botão padrão do rodapé da tabela: escuro para assinar, contornado para mudar.
 * Com children, mostra o texto completo e, no celular, o shortLabel (se houver).
 */
export function PlanTableButton({ planName, up, onClick, disabled, children, shortLabel }) {
    return (
        <button
            type="button"
            className={`plan-table__action ${up ? 'is-up' : ''}`}
            onClick={onClick}
            disabled={disabled}
            aria-label={children ? undefined : (up ? `Assinar o plano ${planName}` : `Mudar para o plano ${planName}`)}
        >
            {children ? (
                shortLabel ? (
                    <>
                        <span className="plan-table__label-full">{children}</span>
                        <span className="plan-table__label-short" aria-hidden="true">{shortLabel}</span>
                    </>
                ) : children
            ) : (
                <>
                    {up ? 'Assinar' : 'Mudar'}
                    <span className="plan-table__action-target">{up ? ` ${planName}` : ` para ${planName}`}</span>
                </>
            )}
        </button>
    )
}
