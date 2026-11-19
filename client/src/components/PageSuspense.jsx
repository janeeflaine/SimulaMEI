import { Component, Suspense } from 'react'

// Espera a página ser baixada (as páginas vêm sob demanda, ver utils/lazyPage.js).
// Se não der para baixar (sem internet), mostra o aviso no lugar da página; o topo e o
// rodapé continuam.
class LoadBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { failed: false }
    }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    componentDidCatch(error) {
        console.error('Página não abriu:', error)
    }

    render() {
        if (!this.state.failed) return this.props.children
        return (
            <div className="container" role="alert" style={{ padding: '64px 16px', textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.375rem', marginBottom: 8 }}>Não deu para abrir esta página</h1>
                <p style={{ color: '#5b6b80', marginBottom: 20 }}>Confira a internet e tente de novo.</p>
                <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                    Tentar de novo
                </button>
            </div>
        )
    }
}

export function PageLoading({ minHeight = '50vh' }) {
    return (
        <div className="flex items-center justify-center" style={{ minHeight }} aria-busy="true">
            <div className="loader"></div>
        </div>
    )
}

export default function PageSuspense({ children, boundaryKey, minHeight }) {
    return (
        <LoadBoundary key={boundaryKey}>
            <Suspense fallback={<PageLoading minHeight={minHeight} />}>{children}</Suspense>
        </LoadBoundary>
    )
}
