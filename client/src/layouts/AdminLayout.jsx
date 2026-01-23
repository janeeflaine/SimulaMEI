import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard,
    Calculator,
    DollarSign,
    Users,
    Settings,
    ChevronDown,
    Menu,
    X,
    PlusCircle,
    BarChart3,
    FileText,
    CreditCard,
    Clock,
    Bell,
    Award,
    User,
    LogOut
} from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import './AdminLayout.css'

export default function AdminLayout() {
    return (
        <div className="admin-layout" data-theme="dark">
            <main className="admin-main">
                <Header />
                <div className="admin-content">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
