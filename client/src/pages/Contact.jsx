import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
    Mail,
    Building2,
    Clock,
    Send,
    CheckCircle,
    HelpCircle,
    ChevronDown,
    ChevronUp,
    Shield,
    MessageSquare
} from 'lucide-react'
import { CONTACT_EMAILS } from '../utils/legalInfo'
import './LegalPages.css'

// Assunto do formulário -> caixa de e-mail responsável
const SUBJECT_ROUTING = {
    duvida: { email: CONTACT_EMAILS.contato, label: 'Dúvida sobre o Simulador MEI' },
    suporte: { email: CONTACT_EMAILS.suporte, label: 'Suporte Técnico / Acesso à Conta' },
    planos: { email: CONTACT_EMAILS.suporte, label: 'Planos e Assinaturas' },
    privacidade: { email: CONTACT_EMAILS.privacidade, label: 'Privacidade e Dados Pessoais (LGPD)' },
    comercial: { email: CONTACT_EMAILS.contato, label: 'Parcerias e Outros Assuntos' }
}

export default function Contact() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        subject: 'duvida',
        message: ''
    })
    const [submitted, setSubmitted] = useState(null)
    const [openFaq, setOpenFaq] = useState(null)

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    // Sem serviço de e-mail no backend: abre o app de e-mail do usuário com a mensagem pronta
    const handleSubmit = (e) => {
        e.preventDefault()
        const route = SUBJECT_ROUTING[formData.subject] || SUBJECT_ROUTING.duvida
        const body = [
            formData.message,
            '',
            '---',
            `Nome: ${formData.name}`,
            `E-mail para resposta: ${formData.email}`
        ].join('\n')
        window.location.href = `mailto:${route.email}?subject=${encodeURIComponent(`[SimulaMEI] ${route.label}`)}&body=${encodeURIComponent(body)}`
        setSubmitted(route.email)
    }

    const toggleFaq = (index) => {
        setOpenFaq(openFaq === index ? null : index)
    }

    const faqs = [
        {
            q: 'O SimulaMEI substitui a assessoria de um contador?',
            a: 'Não. O SimulaMEI é uma ferramenta de tecnologia desenvolvida para apoiar e orientar a gestão financeira e tributária do microempreendedor. O cálculo serve como estimativa e diagnóstico; atos formais perante a Receita Federal e prefeituras devem ser avaliados com um contador habilitado.'
        },
        {
            q: 'Quem é a empresa responsável pelo SimulaMEI?',
            a: 'O SimulaMEI é um produto desenvolvido e administrado pela empresa ESPETINHO DO NORDESTE, inscrita no CNPJ sob o nº 33.137.007/0001-09.'
        },
        {
            q: 'Como posso cancelar ou alterar meu plano de assinatura?',
            a: 'Você pode gerenciar ou cancelar seu plano a qualquer momento diretamente na aba Minha Conta ou na seção de Planos logado na plataforma. O cancelamento interrompe cobranças futuras e mantém seu acesso ativo até o término do período contratado.'
        },
        {
            q: 'Em quanto tempo o suporte responde às mensagens?',
            a: 'Nossa equipe de suporte técnico e atendimento responde à maioria das solicitações em até 24 horas úteis, de segunda a sexta-feira, das 09h às 18h.'
        }
    ]

    return (
        <div className="legal-page-container">
            <div className="legal-page-content">
                {/* Header */}
                <div className="legal-header">
                    <div className="legal-badge contact-badge">
                        <MessageSquare size={16} />
                        Atendimento ao Empreendedor
                    </div>
                    <h1>Informações de Contato</h1>
                    <p>
                        Dúvidas sobre o simulador, sugestões, suporte técnico ou questões de privacidade? Estamos prontos para atender você.
                    </p>
                </div>

                {/* Callout Institucional */}
                <div className="legal-entity-card">
                    <div className="legal-entity-icon">
                        <Building2 size={24} />
                    </div>
                    <div className="legal-entity-body">
                        <h3>Informações Corporativas</h3>
                        <p>
                            <strong>SimulaMEI</strong> é um produto desenvolvido e mantido por{' '}
                            <strong>ESPETINHO DO NORDESTE</strong>, inscrita no CNPJ nº{' '}
                            <strong>33.137.007/0001-09</strong>.
                        </p>
                    </div>
                </div>

                {/* Contact Cards Grid */}
                <div className="contact-grid">
                    <div className="contact-info-card">
                        <div className="contact-card-icon primary">
                            <Mail size={22} />
                        </div>
                        <h3>Suporte Técnico</h3>
                        <p>Dúvidas sobre a plataforma, ferramentas de finanças ou relatórios.</p>
                        <a href={`mailto:${CONTACT_EMAILS.suporte}`} className="contact-link">
                            {CONTACT_EMAILS.suporte}
                        </a>
                    </div>

                    <div className="contact-info-card">
                        <div className="contact-card-icon secondary">
                            <Building2 size={22} />
                        </div>
                        <h3>Contato Comercial & Geral</h3>
                        <p>Parcerias, planos corporativos, sugestões e informações institucionais.</p>
                        <a href={`mailto:${CONTACT_EMAILS.contato}`} className="contact-link">
                            {CONTACT_EMAILS.contato}
                        </a>
                    </div>

                    <div className="contact-info-card">
                        <div className="contact-card-icon accent">
                            <Shield size={22} />
                        </div>
                        <h3>Privacidade & LGPD</h3>
                        <p>Canal do Encarregado de Dados para direitos do titular e privacidade.</p>
                        <a href={`mailto:${CONTACT_EMAILS.privacidade}`} className="contact-link">
                            {CONTACT_EMAILS.privacidade}
                        </a>
                    </div>

                    <div className="contact-info-card">
                        <div className="contact-card-icon primary">
                            <Clock size={22} />
                        </div>
                        <h3>Horário de Atendimento</h3>
                        <p>Segunda a Sexta-feira</p>
                        <strong style={{ color: 'var(--color-text)' }}>09:00 às 18:00 (Brasília)</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            Respostas em até 24 horas úteis
                        </span>
                    </div>
                </div>

                {/* Contact Form */}
                <div className="contact-form-container">
                    <h2 className="contact-form-title">Envie uma Mensagem</h2>
                    <p className="contact-form-subtitle">
                        Preencha o formulário e clique em enviar: abriremos o seu aplicativo de e-mail com a mensagem pronta, endereçada à equipe certa.
                    </p>

                    {submitted && (
                        <div className="contact-success-msg">
                            <CheckCircle size={22} />
                            <div>
                                <strong>Seu aplicativo de e-mail foi aberto com a mensagem pronta.</strong>
                                <p style={{ margin: '2px 0 0', fontSize: '0.9rem' }}>
                                    Confira e clique em enviar por lá. Se nada abriu, escreva diretamente para <strong>{submitted}</strong>.
                                </p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="contact-form">
                        <div className="contact-form-grid">
                            <div>
                                <label htmlFor="contact-name">Seu Nome Completo</label>
                                <input
                                    id="contact-name"
                                    type="text"
                                    name="name"
                                    required
                                    placeholder="Ex: Maria da Silva"
                                    value={formData.name}
                                    onChange={handleChange}
                                />
                            </div>

                            <div>
                                <label htmlFor="contact-email">Seu E-mail de Contato</label>
                                <input
                                    id="contact-email"
                                    type="email"
                                    name="email"
                                    required
                                    placeholder="Ex: maria@exemplo.com.br"
                                    value={formData.email}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="contact-field-full">
                                <label htmlFor="contact-subject">Assunto</label>
                                <select
                                    id="contact-subject"
                                    name="subject"
                                    value={formData.subject}
                                    onChange={handleChange}
                                >
                                    <option value="duvida">Dúvida sobre o Simulador MEI</option>
                                    <option value="suporte">Suporte Técnico / Acesso à Conta</option>
                                    <option value="planos">Planos e Assinaturas</option>
                                    <option value="privacidade">Privacidade e Dados Pessoais (LGPD)</option>
                                    <option value="comercial">Parcerias e Outros Assuntos</option>
                                </select>
                            </div>

                            <div className="contact-field-full">
                                <label htmlFor="contact-message">Sua Mensagem</label>
                                <textarea
                                    id="contact-message"
                                    name="message"
                                    rows="5"
                                    required
                                    placeholder="Descreva detalhadamente sua dúvida ou solicitação..."
                                    value={formData.message}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                            <Send size={16} />
                            Enviar Mensagem
                        </button>
                    </form>
                </div>

                {/* FAQ Section */}
                <div className="faq-section">
                    <h3 className="faq-title">Perguntas Frequentes (FAQ)</h3>
                    <div className="faq-accordion">
                        {faqs.map((faq, index) => (
                            <div key={index} className="faq-item">
                                <div
                                    className="faq-question"
                                    onClick={() => toggleFaq(index)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && toggleFaq(index)}
                                >
                                    <span>{faq.q}</span>
                                    {openFaq === index ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </div>
                                {openFaq === index && (
                                    <div className="faq-answer">
                                        {faq.a}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Action Links */}
                <div className="legal-action-links" style={{ marginTop: '48px' }}>
                    <Link to="/" className="btn btn-secondary btn-sm">
                        Ir para Início
                    </Link>
                    <Link to="/politica-de-privacidade" className="btn btn-secondary btn-sm">
                        Política de Privacidade
                    </Link>
                    <Link to="/termos-de-servico" className="btn btn-secondary btn-sm">
                        Termos de Serviço
                    </Link>
                </div>
            </div>
        </div>
    )
}
