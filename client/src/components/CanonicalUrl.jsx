import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Endereço oficial do site: sempre https e com www (é para onde os outros endereços redirecionam).
const SITE = 'https://www.eusempremei.com.br'

// Endereços repetidos que mostram a mesma página: o Google deve considerar só o principal.
const ALIASES = {
    '/privacidade': '/politica-de-privacidade',
    '/termos': '/termos-de-servico',
}

export function canonicalPath(pathname) {
    let path = (pathname || '/').toLowerCase()
    if (path.length > 1) path = path.replace(/\/+$/, '') || '/'
    return ALIASES[path] || path
}

// Mantém <link rel="canonical"> e og:url no <head> com o endereço da página atual,
// sem ?parâmetros, para o Google indexar uma única versão (https://www...) de cada página.
export default function CanonicalUrl() {
    const { pathname } = useLocation()

    useEffect(() => {
        const url = SITE + canonicalPath(pathname)

        let link = document.head.querySelector('link[rel="canonical"]')
        if (!link) {
            link = document.createElement('link')
            link.setAttribute('rel', 'canonical')
            document.head.appendChild(link)
        }
        link.setAttribute('href', url)

        const ogUrl = document.head.querySelector('meta[property="og:url"]')
        if (ogUrl) ogUrl.setAttribute('content', url)
    }, [pathname])

    return null
}
