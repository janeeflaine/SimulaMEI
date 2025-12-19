import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'

export default function FinanceCategories() {
    const { user } = useAuth()
    const isOuro = user?.plan === 'Ouro' || Number(user?.planId) === 3

    if (!isOuro) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Gerenciamento de Categorias"
                    requiredPlan="Ouro"
                    description="Organize suas receitas e despesas por categorias personalizadas para um controle financeiro completo do seu MEI."
                    icon="🏷️"
                />
            </div>
        )
    }

    return (
        <div className="container py-8">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Categorias Financeiras</h1>
                    <p className="text-muted">Gerencie suas categorias de receitas e despesas</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-4">
                    <h3 className="font-bold mb-4 border-b pb-2">Despesas MEI</h3>
                    <p className="text-sm text-muted italic">Em breve: Funcionalidade completa de edição.</p>
                </div>
                <div className="card p-4">
                    <h3 className="font-bold mb-4 border-b pb-2">Receitas</h3>
                    <p className="text-sm text-muted italic">Em breve: Funcionalidade completa de edição.</p>
                </div>
                <div className="card p-4">
                    <h3 className="font-bold mb-4 border-b pb-2">Despesas Pessoais</h3>
                    <p className="text-sm text-muted italic">Em breve: Funcionalidade completa de edição.</p>
                </div>
            </div>
        </div>
    )
}
