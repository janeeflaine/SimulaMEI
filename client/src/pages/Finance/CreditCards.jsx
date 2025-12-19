import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'

export default function CreditCards() {
    const { user } = useAuth()
    const isOuro = user?.plan === 'Ouro' || Number(user?.planId) === 3

    if (!isOuro) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Gestão de Cartões de Crédito"
                    requiredPlan="Ouro"
                    description="Cadastre e gerencie seus cartões de crédito para acompanhar faturas e prazos de pagamento vinculados ao seu MEI."
                    icon="💳"
                />
            </div>
        )
    }

    return (
        <div className="container py-8">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Meus Cartões</h1>
                    <p className="text-muted">Gerencie seus cartões de crédito</p>
                </div>
            </header>

            <div className="card p-8 text-center bg-gray-50 border-dashed border-2">
                <div className="text-4xl mb-4">💳</div>
                <h3 className="text-lg font-semibold mb-2">Nenhum cartão cadastrado</h3>
                <p className="text-muted mb-6">Cadastre seu primeiro cartão para começar a organizar suas contas.</p>
                <button className="btn btn-primary" disabled>Adicionar Cartão (Em Breve)</button>
            </div>
        </div>
    )
}
