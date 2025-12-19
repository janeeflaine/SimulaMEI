import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import FeatureLock from '../../components/FeatureLock'

export default function BillsToPay() {
    const { user } = useAuth()
    const isOuro = user?.plan === 'Ouro' || Number(user?.planId) === 3

    if (!isOuro) {
        return (
            <div className="container py-8">
                <FeatureLock
                    featureName="Contas a Pagar (Boletos)"
                    requiredPlan="Ouro"
                    description="Nunca mais esqueça um vencimento. Gerencie seus boletos e contas futuras de forma organizada e eficiente."
                    icon="📄"
                />
            </div>
        )
    }

    return (
        <div className="container py-8">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Contas a Pagar</h1>
                    <p className="text-muted">Gerencie seus boletos e compromissos futuros</p>
                </div>
            </header>

            <div className="card overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Descrição</th>
                            <th className="px-6 py-4 font-semibold">Vencimento</th>
                            <th className="px-6 py-4 font-semibold">Valor</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colSpan="4" className="px-6 py-12 text-center text-muted italic">
                                Nenhuma conta pendente encontrada.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}
