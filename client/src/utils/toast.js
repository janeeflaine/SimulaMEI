/**
 * Aviso flutuante (canto de baixo da tela), por cima de janelas abertas.
 * Antes não tinha estilo nenhum no site: o aviso ia para o fim da página, atrás
 * da janela, e ninguém via (nem os erros). Estilo em styles/main.css (.global-toast).
 */
const ICONS = {
    success: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>'
}

export function showToast(message, type = 'success') {
    // Até três avisos na tela
    const existing = document.querySelectorAll('.global-toast')
    if (existing.length > 2) existing[0].remove()

    const kind = type === 'error' ? 'error' : 'success'
    const toast = document.createElement('div')
    toast.className = `global-toast toast-${kind}`
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status')

    const icon = document.createElement('span')
    icon.className = 'toast-icon'
    icon.innerHTML = ICONS[kind]

    const text = document.createElement('span')
    text.className = 'toast-text'
    text.innerText = String(message || '').replace(/^Erro:\s*/, '')

    toast.appendChild(icon)
    toast.appendChild(text)
    document.body.appendChild(toast)

    setTimeout(() => toast.classList.add('show'), 10)
    // Erro fica mais tempo na tela
    setTimeout(() => {
        toast.classList.remove('show')
        setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast) }, 300)
    }, kind === 'error' ? 6000 : 3500)
}
