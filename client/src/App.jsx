import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'

// User Pages
import Home from './pages/Home'
import Simulator from './pages/Simulator'
import Results from './pages/Results'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Comparison from './pages/Comparison'
import Account from './pages/Account'
import Plans from './pages/Plans'
import Alerts from './pages/Alerts'
import BillsToPay from './pages/Finance/BillsToPay'
import CreditCards from './pages/Finance/CreditCards'
import CardDashboard from './pages/Finance/CardDashboard'
import InvoiceUpload from './pages/Finance/InvoiceUpload'
import FinanceCategories from './pages/Finance/FinanceCategories'
import FinancialStatement from './pages/Finance/FinancialStatement'
import PixPaymentForm from './pages/Finance/PixPaymentForm'
import AccountManager from './pages/Finance/AccountManager'

// Admin Pages
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminRules from './pages/admin/AdminRules'
import AdminLimits from './pages/admin/AdminLimits'
import AdminPlans from './pages/admin/AdminPlans'
import AdminFeatures from './pages/admin/AdminFeatures'
import AdminReports from './pages/admin/AdminReports'
import AdminSettings from './pages/admin/AdminSettings'
import AdminLogs from './pages/admin/AdminLogs'

// Layouts
import UserLayout from './layouts/UserLayout'
import AdminLayout from './layouts/AdminLayout'

// Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
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
                            <Route path="/financas/pix" element={<PixPaymentForm />} />
                            <Route path="/financas/gerenciar-contas" element={<AccountManager />} />
                        </Route>
                    </Route>

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
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App
