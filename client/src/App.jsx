import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import lazyPage, { registerPreload, preloadPath } from './utils/lazyPage'
import PageSuspense from './components/PageSuspense'
// Aviso de cookies e Pixel da Meta: só existe com VITE_META_PIXEL_ID (utils/metaPixel.js)
import CookieConsent from './components/CookieConsent'

// A Início vem junto com o site (é a primeira página da maioria das visitas).
// As outras páginas são baixadas só quando alguém entra nelas (utils/lazyPage.js).
import Home from './pages/Home'
// Este CSS tem uma regra para todo <h3> do site (ver design-do-site.md): continua valendo em todas as páginas
import './components/FinanceQuickActionModal.css'

// User Pages
// Página dos anúncios (fora do menu do site)
const Comecar = lazyPage(() => import('./pages/Comecar'))
const Simulator = lazyPage(() => import('./pages/Simulator'))
const Results = lazyPage(() => import('./pages/Results'))
const Login = lazyPage(() => import('./pages/Login'))
const Register = lazyPage(() => import('./pages/Register'))
const ForgotPassword = lazyPage(() => import('./pages/ForgotPassword'))
const ResetPassword = lazyPage(() => import('./pages/ResetPassword'))
const ConfirmEmail = lazyPage(() => import('./pages/ConfirmEmail'))
const PrivacyPolicy = lazyPage(() => import('./pages/PrivacyPolicy'))
const TermsOfService = lazyPage(() => import('./pages/TermsOfService'))
const Contact = lazyPage(() => import('./pages/Contact'))
const DataDeletion = lazyPage(() => import('./pages/DataDeletion'))
const Dashboard = lazyPage(() => import('./pages/Dashboard'))
const Comparison = lazyPage(() => import('./pages/Comparison'))
const Account = lazyPage(() => import('./pages/Account'))
const Plans = lazyPage(() => import('./pages/Plans'))
const Alerts = lazyPage(() => import('./pages/Alerts'))
const BillsToPay = lazyPage(() => import('./pages/Finance/BillsToPay'))
const CreditCards = lazyPage(() => import('./pages/Finance/CreditCards'))
const CardDashboard = lazyPage(() => import('./pages/Finance/CardDashboard'))
const InvoiceUpload = lazyPage(() => import('./pages/Finance/InvoiceUpload'))
const FinanceCategories = lazyPage(() => import('./pages/Finance/FinanceCategories'))
const FinancialStatement = lazyPage(() => import('./pages/Finance/FinancialStatement'))
const AccountManager = lazyPage(() => import('./pages/Finance/AccountManager'))

// Admin Pages
const AdminLogin = lazyPage(() => import('./pages/admin/AdminLogin'))
const AdminDashboard = lazyPage(() => import('./pages/admin/AdminDashboard'))
const AdminUsers = lazyPage(() => import('./pages/admin/AdminUsers'))
const AdminRules = lazyPage(() => import('./pages/admin/AdminRules'))
const AdminLimits = lazyPage(() => import('./pages/admin/AdminLimits'))
const AdminPlans = lazyPage(() => import('./pages/admin/AdminPlans'))
const AdminFeatures = lazyPage(() => import('./pages/admin/AdminFeatures'))
const AdminReports = lazyPage(() => import('./pages/admin/AdminReports'))
const AdminSettings = lazyPage(() => import('./pages/admin/AdminSettings'))
const AdminLogs = lazyPage(() => import('./pages/admin/AdminLogs'))

// Layouts
import UserLayout from './layouts/UserLayout'
const AdminLayout = lazyPage(() => import('./layouts/AdminLayout'))

// Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

// Caminhos dos links que começam a baixar a página antes do clique
const PRELOAD = [
    ['/comecar', Comecar], ['/simular', Simulator], ['/resultado', Results], ['/planos', Plans], ['/login', Login],
    ['/cadastro', Register], ['/esqueci-senha', ForgotPassword], ['/redefinir-senha', ResetPassword], ['/confirmar-email', ConfirmEmail],
    ['/politica-de-privacidade', PrivacyPolicy], ['/privacidade', PrivacyPolicy],
    ['/termos-de-servico', TermsOfService], ['/termos', TermsOfService], ['/contato', Contact],
    ['/exclusao-de-dados', DataDeletion], ['/dashboard', Dashboard], ['/comparativo', Comparison],
    ['/conta', Account], ['/alertas', Alerts], ['/financas/contas', BillsToPay],
    ['/financas/cartoes', CreditCards], ['/financas/cartoes/:id', CardDashboard],
    ['/financas/cartoes/:id/upload', InvoiceUpload], ['/financas/categorias', FinanceCategories],
    ['/financas/extrato', FinancialStatement],
    ['/financas/gerenciar-contas', AccountManager], ['/admin/login', AdminLogin],
    ['/admin', AdminDashboard], ['/admin/usuarios', AdminUsers], ['/admin/regras', AdminRules],
    ['/admin/limites', AdminLimits], ['/admin/planos', AdminPlans],
    ['/admin/funcionalidades', AdminFeatures], ['/admin/relatorios', AdminReports],
    ['/admin/configuracoes', AdminSettings], ['/admin/logs', AdminLogs],
]
PRELOAD.forEach(([path, Page]) => registerPreload(path, Page))

function useLinkPreload() {
    useEffect(() => {
        const onIntent = (event) => {
            const link = event.target.closest?.('a[href]')
            if (!link || link.origin !== window.location.origin) return
            preloadPath(link.pathname)
            if (link.pathname.startsWith('/admin') && link.pathname !== '/admin/login') AdminLayout.preload()
        }
        document.addEventListener('pointerover', onIntent, { passive: true })
        document.addEventListener('touchstart', onIntent, { passive: true })
        document.addEventListener('focusin', onIntent)
        return () => {
            document.removeEventListener('pointerover', onIntent)
            document.removeEventListener('touchstart', onIntent)
            document.removeEventListener('focusin', onIntent)
        }
    }, [])
}

function App() {
    useLinkPreload()
    return (
        <AuthProvider>
            <BrowserRouter>
                <PageSuspense minHeight="100vh">
                <Routes>
                    {/* Public User Routes */}
                    <Route element={<UserLayout />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/simular" element={<Simulator />} />
                        <Route path="/resultado" element={<Results />} />
                        <Route path="/planos" element={<Plans />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/cadastro" element={<Register />} />
                        <Route path="/esqueci-senha" element={<ForgotPassword />} />
                        <Route path="/redefinir-senha" element={<ResetPassword />} />
                        <Route path="/confirmar-email" element={<ConfirmEmail />} />
                        <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
                        <Route path="/privacidade" element={<PrivacyPolicy />} />
                        <Route path="/termos-de-servico" element={<TermsOfService />} />
                        <Route path="/termos" element={<TermsOfService />} />
                        <Route path="/contato" element={<Contact />} />
                        <Route path="/exclusao-de-dados" element={<DataDeletion />} />

                        {/* Protected User Routes */}
                        <Route element={<ProtectedRoute />}>
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/comparativo" element={<Comparison />} />
                            <Route path="/conta" element={<Account />} />
                            <Route path="/alertas" element={<Alerts />} />
                            <Route path="/financas/contas" element={<BillsToPay />} />
                            <Route path="/financas/cartoes" element={<CreditCards />} />
                            <Route path="/financas/cartoes/:id" element={<CardDashboard />} />
                            <Route path="/financas/cartoes/:id/upload" element={<InvoiceUpload />} />
                            <Route path="/financas/categorias" element={<FinanceCategories />} />
                            <Route path="/financas/extrato" element={<FinancialStatement />} />
                            <Route path="/financas/gerenciar-contas" element={<AccountManager />} />
                        </Route>
                    </Route>

                    {/* Página dos anúncios: sem o menu e o rodapé do site */}
                    <Route path="/comecar" element={<Comecar />} />

                    {/* Admin Routes */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route element={<AdminRoute />}>
                        <Route element={<AdminLayout />}>
                            <Route path="/admin" element={<AdminDashboard />} />
                            <Route path="/admin/usuarios" element={<AdminUsers />} />
                            <Route path="/admin/regras" element={<AdminRules />} />
                            <Route path="/admin/limites" element={<AdminLimits />} />
                            <Route path="/admin/planos" element={<AdminPlans />} />
                            <Route path="/admin/funcionalidades" element={<AdminFeatures />} />
                            <Route path="/admin/relatorios" element={<AdminReports />} />
                            <Route path="/admin/configuracoes" element={<AdminSettings />} />
                            <Route path="/admin/logs" element={<AdminLogs />} />
                        </Route>
                    </Route>
                </Routes>
                </PageSuspense>
                <CookieConsent />
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App
