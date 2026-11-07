import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Building2, Mail, CheckCircle, AlertTriangle, ArrowLeft, MessageCircle } from 'lucide-react'
import { COMPANY, CONTACT_EMAILS, LEGAL_LAST_UPDATED } from '../utils/legalInfo'
import './LegalPages.css'

const DELETION_SUBJECT = 'Solicitação de exclusão de conta e dados'
const DELETION_BODY = [
    'Olá,',
    '',
    `Solicito a exclusão definitiva da minha conta no ${COMPANY.productName} e de todos os meus dados pessoais.`,
    '',
    'Nome completo:',
    'E-mail cadastrado:',
    '',
    'Estou ciente de que a exclusão é irreversível.'
].join('\n')

export default function DataDeletion() {
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    const mailtoHref = `mailto:${CONTACT_EMAILS.privacidade}?subject=${encodeURIComponent(DELETION_SUBJECT)}&body=${encodeURIComponent(DELETION_BODY)}`

    return (
        <div className="legal-page-container">
            <div className="legal-page-content">
                {/* Header */}
                <div className="legal-header">
                    <div className="legal-badge">
                        <Trash2 size={16} />
                        Direitos do Titular — LGPD
                    </div>
                    <h1>Exclusão de Conta e Dados</h1>
                    <p>
                        Como pedir a exclusão definitiva da sua conta e dos seus dados pessoais no {COMPANY.productName}.
                    </p>
                    <div className="legal-updated">
                        Última atualização: {LEGAL_LAST_UPDATED}
                    </div>
                </div>

                <div className="legal-entity-card">
                    <div className="legal-entity-icon">
                        <Building2 size={24} />
                    </div>
                    <div className="legal-entity-body">
                        <h3>Controlador dos Dados</h3>
                        <p>
                            <strong>{COMPANY.legalName}</strong>, CNPJ <strong>{COMPANY.cnpj}</strong>, responsável pelo {COMPANY.productName}.
                        </p>
                    </div>
                </div>

                <div className="legal-document-card">
                    <section className="legal-section">
                        <h2>
                            <Mail size={20} className="text-emerald-500" />
                            1. Como Solicitar
                        </h2>
                        <p><strong>Opção 1 — pela sua conta (imediato):</strong></p>
                        <ol>
                            <li>Entre no {COMPANY.productName} e acesse <Link to="/conta" style={{ color: 'var(--color-primary-dark)', fontWeight: 600 }}>Minha Conta</Link>;</li>
                            <li>Na seção "Zona de Perigo", clique em <strong>Excluir conta</strong>;</li>
                            <li>Informe sua senha e digite <strong>EXCLUIR</strong> para confirmar.</li>
                        </ol>
                        <p>
                            A exclusão acontece na hora. Se você tiver assinatura paga, ela é cancelada automaticamente antes da exclusão, e nenhuma nova cobrança é feita.
                        </p>
                        <p><strong>Opção 2 — por e-mail</strong> (por exemplo, se você não consegue mais acessar a conta):</p>
                        <ol>
                            <li>
                                Envie um e-mail para <strong>{CONTACT_EMAILS.privacidade}</strong> <strong>a partir do e-mail cadastrado na sua conta</strong>, com o assunto "{DELETION_SUBJECT}".
                            </li>
                            <li>Confirmaremos o recebimento e poderemos pedir uma confirmação adicional de identidade, para proteger a sua conta contra pedidos de terceiros.</li>
                            <li>A exclusão é concluída em até 15 dias após a confirmação, e você recebe um aviso por e-mail quando terminar. A assinatura paga, se houver, também é cancelada.</li>
                        </ol>
                        <div className="legal-action-links" style={{ justifyContent: 'flex-start', marginTop: '16px' }}>
                            <a href={mailtoHref} className="btn btn-primary btn-sm">
                                <Mail size={16} /> Solicitar exclusão por e-mail
                            </a>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <CheckCircle size={20} className="text-emerald-500" />
                            2. O Que é Excluído
                        </h2>
                        <ul>
                            <li>Conta de usuário (nome, e-mail e senha);</li>
                            <li>Simulações salvas;</li>
                            <li>Lançamentos financeiros, contas a pagar, categorias e carteiras;</li>
                            <li>Cartões, faturas, itens de fatura e histórico de envios;</li>
                            <li>Alertas, sessões e registros de pagamento na nossa base;</li>
                            <li>Vínculo com o WhatsApp, quando houver.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <AlertTriangle size={20} className="text-emerald-500" />
                            3. O Que Pode Ser Mantido
                        </h2>
                        <ul>
                            <li><strong>Registros de acesso e de segurança</strong> (IP, data, hora e evento), por no mínimo 6 meses, por exigência do art. 15 do Marco Civil da Internet, sem vínculo com a conta excluída;</li>
                            <li><strong>Registros das transações nos processadores de pagamento</strong> (Stripe e Mercado Pago), que eles mantêm pelos prazos legais aplicáveis.</li>
                        </ul>
                        <div className="legal-highlight-box warning">
                            A exclusão é <strong>definitiva e irreversível</strong>. Se quiser guardar seus dados, exporte relatórios antes de solicitar.
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <MessageCircle size={20} className="text-emerald-500" />
                            4. Apenas Desativar o WhatsApp
                        </h2>
                        <p>
                            Para parar de receber mensagens sem excluir a conta, envie <strong>PARAR</strong> no WhatsApp ou desvincule o número na área da sua conta.
                        </p>
                    </section>

                    <div className="legal-action-links">
                        <Link to="/" className="btn btn-secondary btn-sm">
                            <ArrowLeft size={16} /> Voltar para o Início
                        </Link>
                        <Link to="/politica-de-privacidade" className="btn btn-secondary btn-sm">
                            Política de Privacidade
                        </Link>
                        <Link to="/contato" className="btn btn-primary btn-sm">
                            Falar com Suporte
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
