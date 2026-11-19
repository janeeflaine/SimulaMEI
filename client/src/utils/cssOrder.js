// Ordem dos arquivos de CSS do site, a mesma de quando ele tinha um CSS só.
//
// O CSS de várias telas depende dessa ordem (regras com o mesmo peso: vale a que vem
// depois; ex.: o main.css vinha por último e vencia .table-container e .header-actions).
// Com as páginas sob demanda, o CSS de cada página chega depois e o navegador o poria no
// fim. Aqui cada arquivo entra no lugar dele nesta lista.
//
// Arquivo de CSS novo: acrescente na posição em que ele entraria (fora da lista, entra
// junto com o CSS das páginas, antes do UserLayout/AdminLayout/main).
// O nome de cada arquivo publicado vem do vite.config.js (css-<caminho>-<hash>.css).
const ORDER = [
    'pages/Home',
    'pages/Comecar',
    'components/CookieConsent',
    'pages/Simulator',
    'pages/Results',
    'pages/Login',
    'components/legal/LegalDoc',
    'components/ui/Select',
    'pages/Contact',
    'components/FeatureLock',
    'components/ui/ConfirmDialog',
    'components/FinanceQuickActionModal',
    'components/ui/WalletDot',
    'pages/Dashboard',
    'pages/Comparison',
    'components/WhatsAppSection',
    'components/plans/MemberCard',
    'components/plans/PlanComparison',
    'pages/Account',
    'pages/Plans',
    'components/cards/CardsSummaryPanel',
    'pages/Alerts',
    'pages/Finance/FinanceCategories',
    'pages/Finance/BillsToPay',
    'pages/Finance/CreditCards',
    'pages/Finance/CardDashboard',
    'pages/Finance/InvoiceUpload',
    'components/TransferModal',
    'pages/Finance/FinancialStatement',
    'pages/Finance/PixPaymentForm',
    'components/ImageCropperModal',
    'pages/Finance/AccountManager',
    'pages/admin/AdminLogin',
    'pages/admin/AdminDashboard',
    'pages/admin/AdminPanel',
    'pages/admin/AdminPages',
    'pages/admin/AdminUsers',
    'pages/admin/AdminRules',
    'pages/admin/AdminLimits',
    'pages/admin/AdminPlans',
    'pages/admin/AdminFeatures',
    'pages/admin/AdminReports',
    'pages/admin/AdminSettings',
    'pages/admin/AdminLogs',
    'layouts/UserLayout',
    'layouts/AdminLayout',
    'styles/main',
]

const RANK = new Map(ORDER.map((name, i) => [name.replace(/\//g, '-'), i + 1]))
const PAGE_RANK = ORDER.indexOf('layouts/UserLayout') + 0.5

function rankOf(link) {
    const file = (link.getAttribute('href') || '').split('/').pop()
    if (!file.startsWith('css-')) return 0 // fontes e o resto do arquivo geral: primeiro
    const name = file.slice(4, -'-12345678.css'.length)
    return RANK.get(name) ?? PAGE_RANK
}

const isStylesheet = (node) => node?.tagName === 'LINK' && node.rel === 'stylesheet'

if (typeof document !== 'undefined') {
    const head = document.head
    const append = head.appendChild.bind(head)
    head.appendChild = (node) => {
        if (!isStylesheet(node)) return append(node)
        const rank = rankOf(node)
        const after = [...head.querySelectorAll('link[rel="stylesheet"]')].find((l) => rankOf(l) > rank)
        return after ? head.insertBefore(node, after) : append(node)
    }
}
