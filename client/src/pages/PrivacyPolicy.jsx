import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Building2, Lock, FileText, Database, UserCheck, Mail, ArrowLeft } from 'lucide-react'
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
                        Transparência e segurança no tratamento das suas informações pessoais e dados do seu negócio.
                    </p>
                    <div className="legal-updated">
                        Última atualização: {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </div>
                </div>

                {/* Callout Institucional Obrigatório */}
                <div className="legal-entity-card">
                    <div className="legal-entity-icon">
                        <Building2 size={24} />
                    </div>
                    <div className="legal-entity-body">
                        <h3>Identificação Institucional do Controlador</h3>
                        <p>
                            O <strong>SimulaMEI</strong> é um produto e serviço de tecnologia pertencente e operado por{' '}
                            <strong>ESPETINHO DO NORDESTE</strong>, pessoa jurídica de direito privado, inscrita no Cadastro Nacional da Pessoa Jurídica sob o{' '}
                            <strong>CNPJ nº 33.137.007/0001-09</strong>.
                        </p>
                    </div>
                </div>

                {/* Document Body */}
                <div className="legal-document-card">
                    <section className="legal-section">
                        <h2>
                            <FileText size={20} className="text-emerald-500" />
                            1. Introdução e Objetivo
                        </h2>
                        <p>
                            Esta Política de Privacidade tem como objetivo esclarecer, de forma clara, transparente e acessível, como o <strong>SimulaMEI</strong>, desenvolvido e gerido por <strong>ESPETINHO DO NORDESTE (CNPJ 33.137.007/0001-09)</strong>, coleta, armazena, utiliza, compartilha e protege os dados pessoais de seus usuários e clientes, em estrita observância à Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD), ao Marco Civil da Internet (Lei nº 12.965/2014) e às demais legislações brasileiras aplicáveis.
                        </p>
                        <p>
                            Ao acessar a plataforma, simular dados tributários ou contratar nossos planos, você declara ter lido integralmente este documento e expressa sua concordância com as práticas aqui descritas.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Database size={20} className="text-emerald-500" />
                            2. Informações e Dados que Coletamos
                        </h2>
                        <p>
                            Para viabilizar as funcionalidades da plataforma SimulaMEI, coletamos apenas os dados estritamente necessários para o cumprimento de nossas finalidades:
                        </p>
                        <ul>
                            <li>
                                <strong>Dados Cadastrais:</strong> Nome completo, endereço de e-mail, telefone de contato e credenciais criptografadas de acesso.
                            </li>
                            <li>
                                <strong>Dados Operacionais e de Simulação:</strong> Faturamento mensal e anual estimado, CNAE (atividades econômicas), informações de despesas e custos operacionais informadas por você para realização de diagnósticos de enquadramento no MEI ou Simples Nacional.
                            </li>
                            <li>
                                <strong>Dados de Gestão Financeira (Módulos Pagos):</strong> Registros de contas a pagar, categorias de despesas, lançamentos de extrato e dados de cartões cadastrados exclusivamente para acompanhamento e controle orçamentário pessoal ou empresarial.
                            </li>
                            <li>
                                <strong>Dados de Navegação e Dispositivo:</strong> Endereço IP, data e hora de acesso, tipo de navegador, páginas visitadas e fingerprint técnico de segurança para prevenção a fraudes e garantia de integridade da sessão.
                            </li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Lock size={20} className="text-emerald-500" />
                            3. Finalidades do Uso dos Dados
                        </h2>
                        <p>Os dados tratados pelo SimulaMEI têm as seguintes finalidades legítimas:</p>
                        <ol>
                            <li>Processar e calcular simulações de tributação, alertando sobre limites de faturamento anual do MEI (R$ 81.000,00 ou teto proporcional);</li>
                            <li>Criar, autenticar e gerenciar sua conta de usuário e plano de assinatura;</li>
                            <li>Prestar suporte ao cliente e responder a dúvidas, solicitações ou chamados técnicos;</li>
                            <li>Enviar notificações e alertas pertinentes à gestão do MEI (como prazos de DAS, declarações e relatórios financeiros);</li>
                            <li>Aprimorar a estabilidade, a usabilidade e a segurança das soluções do SimulaMEI;</li>
                            <li>Cumprir obrigações legais ou ordens de autoridades competentes.</li>
                        </ol>
                        <div className="legal-highlight-box">
                            <strong>Compromisso de Não Comercialização:</strong> Em nenhuma hipótese o SimulaMEI ou a empresa ESPETINHO DO NORDESTE comercializa, vende, aluga ou cede bases de dados pessoais de usuários a terceiros para fins de marketing ou publicidade externa.
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <ShieldCheck size={20} className="text-emerald-500" />
                            4. Segurança e Armazenamento dos Dados
                        </h2>
                        <p>
                            Adotamos medidas técnicas, administrativas e organizacionais rígidas para salvaguardar suas informações contra acessos não autorizados, perdas, destruição ou alterações indevidas. Nossos mecanismos incluem:
                        </p>
                        <ul>
                            <li>Comunicação totalmente criptografada via protocolo HTTPS/SSL de alta graduação;</li>
                            <li>Criptografia de senhas com algoritmos seguros de hashing (como bcrypt/Argon2);</li>
                            <li>Ambiente em nuvem com controles de acesso restrito baseados no princípio do privilégio mínimo;</li>
                            <li>Rotinas periódicas de cópia de segurança e monitoramento contínuo de vulnerabilidades.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Building2 size={20} className="text-emerald-500" />
                            5. Compartilhamento de Informações com Terceiros
                        </h2>
                        <p>
                            O compartilhamento de dados ocorre exclusivamente quando indispensável para a prestação do serviço contratado, tais como:
                        </p>
                        <ul>
                            <li><strong>Provedores de Infraestrutura e Hospedagem em Nuvem:</strong> Servidores e bancos de dados seguros que hospedam a aplicação.</li>
                            <li><strong>Processadores de Pagamento:</strong> Gateways de pagamento homologados (ex.: Stripe / Mercado Pago) para processamento de assinaturas com conformidade PCI-DSS.</li>
                            <li><strong>Autoridades Públicas:</strong> Quando requisitado formalmente por autoridade judicial ou policial competente, conforme previsto em lei.</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <UserCheck size={20} className="text-emerald-500" />
                            6. Seus Direitos como Titular de Dados (LGPD)
                        </h2>
                        <p>
                            Nos termos do artigo 18 da LGPD, você possui os seguintes direitos em relação aos seus dados pessoais tratados pelo SimulaMEI:
                        </p>
                        <ul>
                            <li>Confirmação da existência de tratamento e acesso aos dados;</li>
                            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                            <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
                            <li>Portabilidade dos dados a outro fornecedor de serviço, mediante requisição expressa;</li>
                            <li>Eliminação dos dados pessoais tratados com o consentimento do titular;</li>
                            <li>Revogação do consentimento concedido anteriormente.</li>
                        </ul>
                        <p>
                            Você pode exercer seus direitos a qualquer momento entrando em contato diretamente com nossa equipe através dos canais de atendimento indicados abaixo.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>
                            <Mail size={20} className="text-emerald-500" />
                            7. Encarregado pelo Tratamento de Dados (DPO) e Contato
                        </h2>
                        <p>
                            Caso tenha qualquer dúvida, comentário ou solicitação a respeito desta Política de Privacidade ou do tratamento de seus dados pessoais, você pode entrar em contato com o responsável de privacidade da <strong>ESPETINHO DO NORDESTE</strong>:
                        </p>
                        <div className="legal-highlight-box">
                            <p style={{ margin: 0, fontWeight: 600 }}>Canais de Atendimento:</p>
                            <ul style={{ margin: '8px 0 0 16px' }}>
                                <li><strong>Razão Social:</strong> ESPETINHO DO NORDESTE</li>
                                <li><strong>CNPJ:</strong> 33.137.007/0001-09</li>
                                <li><strong>E-mail de Privacidade / LGPD:</strong> privacidade@simulamei.com.br</li>
                                <li><strong>E-mail de Suporte Geral:</strong> contato@simulamei.com.br</li>
                                <li><strong>Página de Atendimento:</strong> <Link to="/contato" style={{ color: 'var(--color-primary-dark)' }}>Fale Conosco</Link></li>
                            </ul>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>8. Alterações a Esta Política</h2>
                        <p>
                            Poderemos atualizar esta Política de Privacidade periodicamente para refletir mudanças em nossos serviços, avanços tecnológicos ou atualizações legislativas. Qualquer alteração substancial será informada previamente em nosso site ou por meio de comunicação aos usuários cadastrados.
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
