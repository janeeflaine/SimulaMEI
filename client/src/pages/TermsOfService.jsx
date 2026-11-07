import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FileCheck, Building2, AlertTriangle, ShieldCheck, HelpCircle, ArrowLeft } from 'lucide-react'
import { CONTACT_EMAILS, LEGAL_LAST_UPDATED } from '../utils/legalInfo'
import './LegalPages.css'

export default function TermsOfService() {
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    return (
        <div className="legal-page-container">
            <div className="legal-page-content">
                {/* Header */}
                <div className="legal-header">
                    <div className="legal-badge terms-badge">
                        <FileCheck size={16} />
                        Condições de Uso da Plataforma
                    </div>
                    <h1>Termos de Serviço</h1>
                    <p>
                        Regras, responsabilidades e diretrizes que regem o acesso e a utilização dos serviços do SimulaMEI.
                    </p>
                    <div className="legal-updated">
                        Última atualização: {LEGAL_LAST_UPDATED}
                    </div>
                </div>

                {/* Callout Institucional Obrigatório */}
                <div className="legal-entity-card">
                    <div className="legal-entity-icon">
                        <Building2 size={24} />
                    </div>
                    <div className="legal-entity-body">
                        <h3>Identificação Institucional</h3>
                        <p>
                            A plataforma <strong>SimulaMEI</strong> é de titularidade e operada exclusivamente pela pessoa jurídica{' '}
                            <strong>ESPETINHO DO NORDESTE</strong>, inscrita no CNPJ sob o nº{' '}
                            <strong>33.137.007/0001-09</strong>.
                        </p>
                    </div>
                </div>

                {/* Document Body */}
                <div className="legal-document-card">
                    <section className="legal-section">
                        <h2>1. Aceitação dos Termos</h2>
                        <p>
                            Ao acessar, navegar, simular ou criar uma conta na plataforma <strong>SimulaMEI</strong>, você (doravante denominado "Usuário") concorda expressamente e sem reservas com estes <strong>Termos de Serviço</strong> e com a nossa <Link to="/politica-de-privacidade" style={{ color: 'var(--color-primary-dark)', fontWeight: 600 }}>Política de Privacidade</Link>.
                        </p>
                        <p>
                            Ao criar uma conta, o Usuário confirma expressamente o aceite destes Termos e declara ter lido a Política de Privacidade, por meio da caixa de seleção do formulário de cadastro.
                        </p>
                        <p>
                            O uso da plataforma é permitido apenas a maiores de 18 anos.
                        </p>
                        <p>
                            Caso você não concorde com qualquer uma das disposições aqui estabelecidas, orientamos que interrompa imediatamente o uso do site e de suas funcionalidades.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>2. Objeto e Descrição dos Serviços</h2>
                        <p>
                            O <strong>SimulaMEI</strong> é uma plataforma SaaS (Software as a Service) voltada ao Microempreendedor Individual (MEI) e pequenos negócios, fornecendo ferramentas digitais para:
                        </p>
                        <ul>
                            <li>Simulação e estimativa de enquadramento tributário (MEI vs. Simples Nacional vs. Lucro Presumido);</li>
                            <li>Acompanhamento de teto de faturamento anual do MEI (limite legal e proporcional);</li>
                            <li>Planejamento e controle de fluxo de caixa, contas a pagar e extrato financeiro;</li>
                            <li>Gestão de despesas e faturas de cartões de crédito vinculados à atividade empresarial ou pessoal;</li>
                            <li>Geração de relatórios analíticos, alertas fiscais e materiais de apoio ao empreendedor.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>3. Caráter Estimativo e Isenção Contábil</h2>
                        <div className="legal-highlight-box warning">
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                                <AlertTriangle size={18} />
                                <strong>Aviso Legal Importante:</strong>
                            </div>
                            As simulações, projeções e cálculos disponibilizados pelo SimulaMEI possuem finalidade estritamente orientativa e de auxílio à gestão. As análises não constituem e não substituem, em hipótese alguma, parecer contábil, consultoria jurídica ou serviço prestado por contador habilitado junto ao Conselho Regional de Contabilidade (CRC).
                        </div>
                        <p>
                            Cabe exclusivamente ao empreendedor a validação formal de seus recolhimentos, emissões de notas fiscais e declaração anual (DASN-SIMEI) perante a Receita Federal do Brasil e os órgãos municipais e estaduais competentes.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>4. Cadastro, Credenciais e Segurança</h2>
                        <p>Para usufruir dos recursos avançados e salvar simulações, o Usuário deve se cadastrar fornecendo dados verídicos e atualizados:</p>
                        <ul>
                            <li>O Usuário é o único responsável pela guarda, confidencialidade e uso de sua senha de acesso;</li>
                            <li>É expressamente proibido ceder, emprestar, vender ou transferir sua conta a terceiros sem prévia autorização;</li>
                            <li>Em caso de suspeita de uso indevido ou invasão de sua conta, o Usuário deverá comunicar imediatamente a equipe do SimulaMEI;</li>
                            <li>O SimulaMEI se reserva o direito de suspender ou encerrar contas com cadastros falsos, fraudulentos ou que violem estes termos.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>5. Regras de Utilização e Condutas Vedadas</h2>
                        <p>Ao utilizar o SimulaMEI, o Usuário compromete-se a NÃO:</p>
                        <ol>
                            <li>Utilizar a plataforma para quaisquer propósitos ilícitos, fraudulentos ou contrários à moral e aos bons costumes;</li>
                            <li>Executar ataques de negação de serviço (DDoS), engenharia reversa, descompilação, scraping abusivo ou invasão de sistemas;</li>
                            <li>Inserir vírus, cavalos de troia ou qualquer código malicioso capaz de danificar a infraestrutura do SimulaMEI ou de terceiros;</li>
                            <li>Tentar contornar travas de planos, limites de recursos ou privilégios de acesso sem a devida contratação;</li>
                            <li>Reproduzir, duplicar, copiar ou revender o software e o modelo de negócios do SimulaMEI sem consentimento prévio e expresso da empresa <strong>ESPETINHO DO NORDESTE</strong>.</li>
                        </ol>
                    </section>

                    <section className="legal-section">
                        <h2>6. Planos de Assinatura, Cobrança e Cancelamento</h2>
                        <p>
                            O SimulaMEI oferece planos gratuitos com funcionalidades essenciais e planos pagos com recursos avançados:
                        </p>
                        <ul>
                            <li><strong>Cobrança:</strong> Planos por assinatura são faturados de forma recorrente (mensal ou anual) através dos meios de pagamento oficiais disponibilizados na plataforma.</li>
                            <li><strong>Renovação Automática:</strong> Salvo cancelamento prévio pelo Usuário em sua área de conta, a renovação da assinatura ocorrerá automaticamente no fim de cada ciclo.</li>
                            <li><strong>Cancelamento:</strong> O Usuário poderá cancelar sua assinatura a qualquer momento através do painel de controle do usuário, mantendo o acesso aos recursos contratados até o final do período vigente já pago.</li>
                            <li><strong>Direito de Arrependimento:</strong> Em conformidade com o artigo 49 do Código de Defesa do Consumidor (CDC), para contratações online o Usuário poderá solicitar o reembolso integral no prazo de até 7 (sete) dias corridos a contar da primeira assinatura.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>7. Propriedade Intelectual</h2>
                        <p>
                            Todo o conteúdo disponibilizado na plataforma — incluindo mas não se limitando a marcas, logotipos, layouts, códigos-fonte, algoritmos de cálculo, textos, imagens e design — é de propriedade exclusiva da <strong>ESPETINHO DO NORDESTE (CNPJ 33.137.007/0001-09)</strong> ou de seus licenciadores, sendo protegido pela legislação brasileira de direitos autorais e propriedade industrial.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>8. Limitação de Responsabilidade</h2>
                        <p>
                            A ESPETINHO DO NORDESTE empenha os melhores esforços técnicos para manter o SimulaMEI disponível 24 horas por dia, 7 dias por semana. Entretanto, não garante operação livre de eventuais interrupções temporárias decorrentes de manutenção técnica, falhas de conectividade de operadoras ou eventos de força maior.
                        </p>
                        <p>
                            A plataforma não será responsável por eventuais prejuízos decorrentes de decisões comerciais, fiscais ou financeiras tomadas exclusivamente com base em estimativas da plataforma sem prévia validação contábil formal.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>9. Disposições Gerais, Foro e Lei Aplicável</h2>
                        <p>
                            Estes Termos de Serviço são regidos e interpretados em conformidade com as leis da República Federativa do Brasil. Para dirimir eventuais controvérsias oriundas deste termo, as partes elegem o foro da Comarca do domicílio do Usuário ou da sede da empresa, conforme previsto nas regras aplicáveis do direito do consumidor.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>10. Informações de Contato</h2>
                        <p>
                            Para esclarecimentos sobre estes Termos de Serviço ou solicitação de suporte:
                        </p>
                        <div className="legal-highlight-box">
                            <ul style={{ margin: '4px 0 0 16px' }}>
                                <li><strong>Titular:</strong> ESPETINHO DO NORDESTE</li>
                                <li><strong>CNPJ:</strong> 33.137.007/0001-09</li>
                                <li><strong>E-mail de Suporte:</strong> {CONTACT_EMAILS.suporte}</li>
                                <li><strong>E-mail Comercial & Parcerias:</strong> {CONTACT_EMAILS.contato}</li>
                                <li><strong>Página de Atendimento:</strong> <Link to="/contato" style={{ color: 'var(--color-primary-dark)' }}>Central de Contato</Link></li>
                            </ul>
                        </div>
                    </section>

                    <div className="legal-action-links">
                        <Link to="/" className="btn btn-secondary btn-sm">
                            <ArrowLeft size={16} /> Voltar para o Início
                        </Link>
                        <Link to="/politica-de-privacidade" className="btn btn-secondary btn-sm">
                            Ver Política de Privacidade
                        </Link>
                        <Link to="/simular" className="btn btn-primary btn-sm">
                            Acessar o Simulador
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
