import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
    ShieldCheck, Building2, Lock, FileText, Database, UserCheck, Mail, ArrowLeft,
    Scale, Globe, Clock, Trash2, MessageCircle, Bell
} from 'lucide-react'
import { COMPANY, CONTACT_EMAILS, LEGAL_LAST_UPDATED } from '../utils/legalInfo'
import './LegalPages.css'

export default function PrivacyPolicy() {
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    return (
        <div className="legal-page-container">
            <div className="legal-page-content">
                {/* Header */}
                <div className="legal-header">
                    <div className="legal-badge">
                        <ShieldCheck size={16} />
                        Segurança & Conformidade LGPD
                    </div>
                    <h1>Política de Privacidade</h1>
                    <p>
                        Como o {COMPANY.productName} coleta, usa, compartilha e protege os seus dados pessoais.
                    </p>
                    <div className="legal-updated">
                        Última atualização: {LEGAL_LAST_UPDATED}
                    </div>
                </div>

                {/* Identificação do Controlador */}
                <div className="legal-entity-card">
                    <div className="legal-entity-icon">
                        <Building2 size={24} />
                    </div>
                    <div className="legal-entity-body">
                        <h3>Identificação do Controlador</h3>
                        <p>
                            O <strong>{COMPANY.productName}</strong> é um produto pertencente e operado por{' '}
                            <strong>{COMPANY.legalName}</strong>, {COMPANY.legalNature} inscrito no CNPJ sob o{' '}
                            <strong>nº {COMPANY.cnpj}</strong>, com sede em {COMPANY.address}, que atua como controlador dos dados pessoais tratados na plataforma.
                        </p>
                    </div>
                </div>

                {/* Document Body */}
                <div className="legal-document-card">
                    <section className="legal-section">
                        <h2>
                            <FileText size={20} className="text-emerald-500" />
                            1. Introdução
                        </h2>
                        <p>
                            Esta Política explica, de forma clara e acessível, como tratamos dados pessoais, em observância à Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD), ao Marco Civil da Internet (Lei nº 12.965/2014) e ao Código de Defesa do Consumidor.
                        </p>
                        <p>
                            Ela se aplica ao site {COMPANY.domain}, à aplicação {COMPANY.productName} e aos canais de atendimento vinculados a ela, inclusive o atendimento por WhatsApp, quando ativado pelo usuário.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Database size={20} className="text-emerald-500" />
                            2. Dados que Coletamos
                        </h2>
                        <ul>
                            <li>
                                <strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada apenas de forma criptografada, com hash bcrypt).
                            </li>
                            <li>
                                <strong>Dados de simulação:</strong> tipo de atividade (comércio, serviço ou ambos), faturamento informado e se você possui funcionário. A simulação pode ser feita sem cadastro.
                            </li>
                            <li>
                                <strong>Dados de gestão financeira:</strong> lançamentos de receitas e despesas, contas a pagar, categorias, carteiras (PF/PJ, com CNPJ quando informado) e cartões cadastrados (apelido, bandeira, 4 últimos dígitos, dias de fechamento e vencimento e limite) e as imagens opcionais que você escolher para personalizar cartões e carteiras. Não solicitamos o número completo nem o código de segurança de cartões — por isso, não use como imagem a foto do seu cartão real.
                            </li>
                            <li>
                                <strong>Faturas enviadas:</strong> arquivos de fatura (PDF, imagem, CSV ou OFX) que você decide enviar, para extração automática dos itens por inteligência artificial.
                            </li>
                            <li>
                                <strong>Dados de pagamento:</strong> nome e CPF do pagador em pagamentos via Pix, e o histórico das suas assinaturas. Dados de cartão de crédito são digitados diretamente no ambiente do processador de pagamento e não passam pelos nossos servidores.
                            </li>
                            <li>
                                <strong>Dados técnicos e de segurança:</strong> endereço IP, data e hora de acesso, navegador (user agent) e um identificador técnico do dispositivo, usados para manter a sessão segura e impedir acessos simultâneos indevidos.
                            </li>
                            <li>
                                <strong>Dados do canal WhatsApp (opcional):</strong> se você vincular seu número, tratamos o número de telefone e as mensagens de texto, áudio e imagem que você enviar ao nosso número oficial.
                            </li>
                        </ul>
                        <p>
                            <strong>Armazenamento no navegador:</strong> não utilizamos cookies de publicidade nem ferramentas de rastreamento de terceiros. Usamos o armazenamento local do navegador apenas para manter você conectado (token de sessão), guardar preferências de tela, o identificador técnico de segurança e o resultado da última simulação.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Scale size={20} className="text-emerald-500" />
                            3. Finalidades e Bases Legais
                        </h2>
                        <p>Cada tratamento tem uma finalidade definida e uma base legal prevista no art. 7º da LGPD:</p>
                        <ul>
                            <li><strong>Criar e manter sua conta, calcular simulações e oferecer as ferramentas financeiras:</strong> execução de contrato (art. 7º, V).</li>
                            <li><strong>Processar pagamentos e emitir cobranças das assinaturas:</strong> execução de contrato (art. 7º, V) e cumprimento de obrigação legal (art. 7º, II).</li>
                            <li><strong>Ler faturas enviadas por você com inteligência artificial:</strong> execução de contrato (art. 7º, V), mediante sua ação de envio.</li>
                            <li><strong>Segurança da conta, prevenção a fraudes e registros de acesso:</strong> legítimo interesse (art. 7º, IX) e cumprimento de obrigação legal do Marco Civil da Internet (art. 7º, II).</li>
                            <li><strong>Enviar alertas e lembretes (por exemplo, vencimento de contas e do DAS):</strong> execução de contrato (art. 7º, V); no WhatsApp, somente após o seu consentimento (art. 7º, I).</li>
                            <li><strong>Atender solicitações e exercer direitos em processos:</strong> execução de contrato e exercício regular de direitos (art. 7º, V e VI).</li>
                        </ul>
                        <div className="legal-highlight-box">
                            <strong>Não comercializamos dados:</strong> o {COMPANY.productName} e seu controlador não vendem, alugam ou cedem dados pessoais para fins de marketing ou publicidade de terceiros.
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Building2 size={20} className="text-emerald-500" />
                            4. Compartilhamento com Terceiros
                        </h2>
                        <p>Compartilhamos dados apenas com fornecedores que operam a plataforma em nosso nome (operadores), na medida necessária:</p>
                        <ul>
                            <li><strong>Vercel Inc.:</strong> hospedagem do site e da aplicação.</li>
                            <li><strong>Supabase Inc.:</strong> banco de dados onde suas informações ficam armazenadas.</li>
                            <li><strong>Google (Gemini API):</strong> leitura automática das faturas que você envia e, no canal WhatsApp, interpretação de mensagens de texto, áudio e imagem.</li>
                            <li><strong>Stripe e Mercado Pago:</strong> processamento de pagamentos de assinaturas.</li>
                            <li><strong>Provedor de e-mail:</strong> envio de mensagens transacionais, como a recuperação de senha.</li>
                            <li><strong>Meta Platforms (WhatsApp Business):</strong> somente se você ativar o canal WhatsApp, para entrega e recebimento das mensagens.</li>
                            <li><strong>Autoridades públicas:</strong> quando houver requisição legal ou ordem judicial.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Globe size={20} className="text-emerald-500" />
                            5. Transferência Internacional
                        </h2>
                        <p>
                            Parte dos fornecedores acima mantém servidores fora do Brasil; em especial, nossa hospedagem e nosso banco de dados ficam nos Estados Unidos. Essas transferências ocorrem nos termos do art. 33 da LGPD, com base nas garantias contratuais de proteção de dados oferecidas por esses fornecedores, e são necessárias para a prestação do serviço que você contratou.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Clock size={20} className="text-emerald-500" />
                            6. Por Quanto Tempo Guardamos os Dados
                        </h2>
                        <ul>
                            <li><strong>Dados da conta e financeiros:</strong> enquanto sua conta estiver ativa. Após a exclusão da conta, são apagados definitivamente.</li>
                            <li><strong>Registros de acesso e de segurança (IP, data, hora e evento):</strong> no mínimo 6 meses, conforme exige o art. 15 do Marco Civil da Internet, mesmo após a exclusão da conta.</li>
                            <li><strong>Registros de pagamentos:</strong> apagados da nossa base junto com a conta. Os processadores de pagamento (Stripe e Mercado Pago) mantêm os próprios registros das transações pelos prazos legais que se aplicam a eles.</li>
                            <li><strong>Arquivos de fatura e mensagens de áudio:</strong> são processados em memória e não ficam armazenados como arquivo. Guardamos apenas o nome e o tamanho do arquivo e os dados extraídos dele (itens, valores e datas), que seguem o prazo dos dados da conta.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Lock size={20} className="text-emerald-500" />
                            7. Segurança
                        </h2>
                        <ul>
                            <li>Comunicação criptografada por HTTPS;</li>
                            <li>Senhas armazenadas somente como hash bcrypt;</li>
                            <li>Acesso aos dados restrito por conta, com verificação de propriedade em cada operação;</li>
                            <li>Controle de sessão que encerra acessos antigos ao detectar login em novo dispositivo;</li>
                            <li>Registro de eventos de segurança para auditoria.</li>
                        </ul>
                        <p>
                            Em caso de incidente de segurança que possa gerar risco ou dano relevante, comunicaremos os titulares afetados e a Autoridade Nacional de Proteção de Dados (ANPD), conforme o art. 48 da LGPD.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <MessageCircle size={20} className="text-emerald-500" />
                            8. Canal WhatsApp
                        </h2>
                        <p>
                            O atendimento pelo WhatsApp é opcional e só é ativado quando você vincula seu número na área da conta. Por ele, você pode registrar movimentações, consultar contas a vencer e marcar contas como pagas, e receber lembretes de vencimento.
                        </p>
                        <ul>
                            <li>Você pode desativar o canal a qualquer momento enviando <strong>PARAR</strong> ou desvinculando o número na sua conta;</li>
                            <li>As mensagens trafegam pela infraestrutura da Meta (WhatsApp Business) e estão sujeitas também à política de privacidade do WhatsApp;</li>
                            <li>Áudios e imagens são usados apenas para interpretar o seu pedido e não são armazenados como arquivo.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <UserCheck size={20} className="text-emerald-500" />
                            9. Seus Direitos (art. 18 da LGPD)
                        </h2>
                        <ul>
                            <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
                            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                            <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
                            <li>Portabilidade dos dados a outro fornecedor;</li>
                            <li>Eliminação dos dados tratados com base no consentimento e revogação desse consentimento;</li>
                            <li>Informação sobre com quem compartilhamos seus dados;</li>
                            <li>Petição à ANPD, caso entenda que seus direitos não foram atendidos.</li>
                        </ul>
                        <p>
                            Para exercer qualquer direito, escreva para <strong>{CONTACT_EMAILS.privacidade}</strong> a partir do e-mail cadastrado na sua conta. Poderemos pedir informações adicionais para confirmar a sua identidade antes de atender ao pedido.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Trash2 size={20} className="text-emerald-500" />
                            10. Exclusão da Conta e dos Dados
                        </h2>
                        <p>
                            Você pode pedir a exclusão definitiva da sua conta e dos seus dados a qualquer momento. O passo a passo está na página{' '}
                            <Link to="/exclusao-de-dados" style={{ color: 'var(--color-primary-dark)', fontWeight: 600 }}>Exclusão de Dados</Link>.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <ShieldCheck size={20} className="text-emerald-500" />
                            11. Menores de Idade
                        </h2>
                        <p>
                            O {COMPANY.productName} é destinado a maiores de 18 anos. Não coletamos intencionalmente dados de crianças ou adolescentes; se identificarmos esse tipo de cadastro, ele será excluído.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Mail size={20} className="text-emerald-500" />
                            12. Canal de Privacidade
                        </h2>
                        <p>
                            Como agente de tratamento de pequeno porte, nos termos da Resolução CD/ANPD nº 2/2022, o controlador disponibiliza um canal de comunicação dedicado para titulares e para a ANPD:
                        </p>
                        <div className="legal-highlight-box">
                            <ul style={{ margin: '4px 0 0 16px' }}>
                                <li><strong>Controlador:</strong> {COMPANY.legalName}</li>
                                <li><strong>CNPJ:</strong> {COMPANY.cnpj}</li>
                                <li><strong>Endereço:</strong> {COMPANY.address}</li>
                                <li><strong>Telefone:</strong> {COMPANY.phone}</li>
                                <li><strong>Privacidade e LGPD:</strong> {CONTACT_EMAILS.privacidade}</li>
                                <li><strong>Atendimento geral:</strong> {CONTACT_EMAILS.contato}</li>
                                <li><strong>Página de atendimento:</strong> <Link to="/contato" style={{ color: 'var(--color-primary-dark)' }}>Fale Conosco</Link></li>
                            </ul>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Bell size={20} className="text-emerald-500" />
                            13. Alterações desta Política
                        </h2>
                        <p>
                            Podemos atualizar esta Política para refletir mudanças nos serviços ou na legislação. A data da última atualização fica no topo desta página, e alterações relevantes serão comunicadas aos usuários cadastrados com antecedência.
                        </p>
                    </section>

                    <div className="legal-action-links">
                        <Link to="/" className="btn btn-secondary btn-sm">
                            <ArrowLeft size={16} /> Voltar para o Início
                        </Link>
                        <Link to="/termos-de-servico" className="btn btn-secondary btn-sm">
                            Ler Termos de Serviço
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
