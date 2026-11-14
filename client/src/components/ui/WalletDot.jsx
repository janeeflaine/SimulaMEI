import { Building2, User } from 'lucide-react'
import './WalletDot.css'

/**
 * Bolinha da carteira: a foto dela ou, sem foto, o ícone do tipo
 * (prédio = MEI, pessoa = Pessoal). Usar onde uma carteira aparece pelo nome,
 * para reconhecer de relance (pedido do dono, 14/11/2026).
 * Nas listas de escolha: { value, label, icon: <WalletDot wallet={w} /> }.
 */
export default function WalletDot({ wallet, size = 28, className = '' }) {
    const Icon = (wallet?.account_type || wallet?.accountType) === 'PJ' ? Building2 : User
    const photo = wallet?.logo_url || wallet?.photo_url
    return (
        <span className={`wallet-dot ${photo ? 'has-photo' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
            {photo ? <img src={photo} alt="" /> : <Icon size={Math.round(size * 0.5)} />}
        </span>
    )
}

// Opções da lista de escolha agrupadas em MEI / Pessoal, com a bolinha
export const walletOptionGroups = (wallets, { exclude, mei = 'MEI', pessoal = 'Pessoal' } = {}) => {
    const list = (Array.isArray(wallets) ? wallets : []).filter(w => String(w.id) !== String(exclude ?? ''))
    const opts = (type) => list
        .filter(w => w.account_type === type)
        .map(w => ({ value: String(w.id), label: w.name, icon: <WalletDot wallet={w} /> }))
    return [
        ...(opts('PJ').length ? [{ group: mei, options: opts('PJ') }] : []),
        ...(opts('PF').length ? [{ group: pessoal, options: opts('PF') }] : [])
    ]
}
