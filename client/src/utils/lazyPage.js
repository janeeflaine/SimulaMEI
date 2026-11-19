import { lazy } from 'react'

// Páginas carregadas só quando alguém entra nelas (o celular não baixa o site inteiro
// para abrir a Início).
//
// Depois de uma publicação nova, quem está com o site aberto ainda tem a versão antiga,
// e os arquivos das páginas antigas já não existem. Nesse caso o site recarrega uma vez
// para pegar a versão nova; se falhar de novo logo em seguida (sem internet, por
// exemplo), o erro segue para a tela de "não deu para abrir".
const KEY = 'page-reload-at'

export function reloadOnce() {
    let last = 0
    try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch { /* sem sessionStorage */ }
    if (Date.now() - last < 10000) return false
    try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* sem sessionStorage */ }
    window.location.reload()
    return true
}

// Arquivo de uma página (JS ou CSS) que não chegou: o Vite avisa por este evento
if (typeof window !== 'undefined') {
    window.addEventListener('vite:preloadError', (event) => {
        if (reloadOnce()) event.preventDefault()
    })
}

const loaders = new Map()

export default function lazyPage(load) {
    let promise = null
    const start = () => {
        if (!promise) {
            promise = load().catch((err) => {
                promise = null
                if (reloadOnce()) return new Promise(() => {}) // espera o recarregamento
                throw err
            })
        }
        return promise
    }
    const Page = lazy(start)
    Page.preload = start
    return Page
}

// Começa a baixar a página de um link quando o dedo encosta ou o mouse passa por cima,
// para ela abrir sem espera no clique.
export function registerPreload(path, Page) {
    loaders.set(path, Page.preload)
}

export function preloadPath(pathname) {
    for (const [path, preload] of loaders) {
        const re = new RegExp('^' + path.replace(/:[^/]+/g, '[^/]+') + '/?$')
        if (re.test(pathname)) { preload(); return }
    }
}
