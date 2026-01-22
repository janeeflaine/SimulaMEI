import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TenantProvider } from './context/TenantContext'

// User Pages
import Home from './pages/Home'
import Simulator from './pages/Simulator'
import Results from './pages/Results'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Comparison from './pages/Comparison'
import Account from './pages/Account'
import Plans from './pages/Plans'
import Alerts from './pages/Alerts'
import BillsToPay from './pages/Finance/BillsToPay'
import CreditCards from './pages/Finance/CreditCards'
import FinanceCategories from './pages/Finance/FinanceCategories'
import FinancialStatement from './pages/Finance/FinancialStatement'
import FinancialStatement from './pages/Finance/FinancialStatement'
import PixPaymentForm from './pages/Finance/PixPaymentForm'
import FamilyDashboard from './pages/Family/FamilyDashboard'
import FamilyDashboard from './pages/Family/FamilyDashboard'

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

// Layouts
import UserLayout from './layouts/UserLayout'
import AdminLayout from './layouts/AdminLayout'

// Guards
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

function App() {
    return (
        <AuthProvider>
            <TenantProvider>
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

                            {/* Protected User Routes */}
                            <Route element={<ProtectedRoute />}>
                                <Route path="/dashboard" element={<Dashboard />} />
                                <Route path="/comparativo" element={<Comparison />} />
                                <Route path="/conta" element={<Account />} />
                                <Route path="/alertas" element={<Alerts />} />
                                <Route path="/financas/contas" element={<BillsToPay />} />
                                <Route path="/financas/cartoes" element={<CreditCards />} />
                                <Route path="/financas/categorias" element={<FinanceCategories />} />
                                <Route path="/financas/extrato" element={<FinancialStatement />} />
                                <Route path="/financas/pix" element={<PixPaymentForm />} />
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
                            </Route>
                        </Route>
                    </Routes>
                </BrowserRouter>
            </TenantProvider>
        </AuthProvider>
    )
}

export default App
