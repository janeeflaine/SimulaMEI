import { Link } from 'react-router-dom'
import './FeatureLock.css'

export default function FeatureLock({
    featureName,
    requiredPlan = 'Prata',
    description,
    icon = '🔒'
}) {
    return (
        <div className="feature-lock">
            <div className="feature-lock-icon">{icon}</div>
            <div className="feature-lock-content">
                <h3 className="feature-lock-title">
                    {featureName}
                </h3>
                <p className="feature-lock-description">
                    {description || `Esta funcionalidade está disponível a partir do plano ${requiredPlan}.`}
                </p>
                <div className="feature-lock-badge">
                    💎 Disponível no plano <strong>{requiredPlan}</strong> ou superior
                </div>
            </div>
            <Link to="/planos" className="btn btn-primary feature-lock-btn">
                Ver Planos
            </Link>
        </div>
    )
}
