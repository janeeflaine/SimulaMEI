import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    Mail,
    Building2,
    Clock,
    Shield,
    LifeBuoy,
    Copy,
    Check,
    ChevronDown,
    AlertCircle,
    CheckCircle2,
    ExternalLink
} from 'lucide-react'
import { COMPANY, CONTACT_EMAILS } from '../utils/legalInfo'
import { useAuth } from '../context/AuthContext'
import Select from '../components/ui/Select'
import { showToast } from '../utils/toast'
import './Contact.css'

// Assunto do formulário -> caixa de e-mail responsável
const SUBJECTS = [
    { value: 'duvida', label: 'Dúvida sobre o Simulador', email: CONTACT_EMAILS.contato },
    { value: 'suporte', label: 'Ajuda com o site ou com a conta', email: CONTACT_EMAILS.suporte },
    { value: 'planos', label: 'Planos e assinatura', email: CONTACT_EMAILS.suporte },
    { value: 'privacidade', label: 'Privacidade e dados pessoais (LGPD)', email: CONTACT_EMAILS.privacidade },
    { value: 'comercial', label: 'Parcerias e outros assuntos', email: CONTACT_EMAILS.contato }
]

const CHANNELS = [
    {
        icon: LifeBuoy,
        title: 'Ajuda com o site',
        text: 'Conta, acesso, lançamentos, cartões, planos e assinatura.',
        email: CONTACT_EMAILS.suporte
    },
    {
        icon: Mail,
        title: 'Assuntos gerais',
        text: 'Dúvidas sobre o Simulador, sugestões e parcerias.',
        email: CONTACT_EMAILS.contato
    },
    {
        icon: Shield,
        title: 'Privacidade e LGPD',
        text: 'Pedidos sobre os seus dados pessoais, com o encarregado de dados.',
        email: CONTACT_EMAILS.privacidade
    }
]

const NAME_MAX = 80
const MESSAGE_MIN = 10
// Endereço mailto muito longo não abre em vários aplicativos de e-mail
const MESSAGE_MAX = 1500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// E-mail que, se não couber, quebra depois do @ (e não no meio da palavra)
function MailText({ email }) {
    const at = email.indexOf('@')
    if (at < 0) return email
    return <>{email.slice(0, at + 1)}<wbr />{email.slice(at + 1)}</>
}

const subjectOf = (value) => SUBJECTS.find((s) => s.value === value) || SUBJECTS[0]

function buildMessage(form) {
    const subject = subjectOf(form.subject)
    const body = [
        form.message.trim(),
        '',
        '---',
        `Nome: ${form.name.trim()}`,
        `E-mail para resposta: ${form.email.trim()}`
    ].join('\n')
    return { to: subject.email, title: `[EuSempreMEI] ${subject.label}`, body }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // Navegador sem permissão da área de transferência: copia por um campo escondido
        try {
            const area = document.createElement('textarea')
            area.value = text
            area.setAttribute('readonly', '')
            area.style.position = 'fixed'
            area.style.opacity = '0'
            document.body.appendChild(area)
            area.select()
            const ok = document.execCommand('copy')
            area.remove()
            return ok
        } catch {
            return false
        }
    }
}

function formProblems(form) {
    const problems = {}
    const name = form.name.trim()
    const email = form.email.trim()
    const message = form.message.trim()
    if (name.length < 2) problems.name = 'Escreva o seu nome.'
    else if (name.length > NAME_MAX) problems.name = `O nome pode ter até ${NAME_MAX} letras.`
    if (!email) problems.email = 'Escreva o e-mail para a resposta.'
    else if (email.length > 254 || !EMAIL_RE.test(email)) problems.email = 'Confira o e-mail: falta algo como nome@exemplo.com.br.'
    if (message.length < MESSAGE_MIN) problems.message = 'Conte um pouco mais na mensagem (pelo menos 10 letras).'
    else if (message.length > MESSAGE_MAX) problems.message = `A mensagem pode ter até ${MESSAGE_MAX} letras.`
    return problems
}

export default function Contact() {
    const { user } = useAuth()
    const [form, setForm] = useState({ name: '', email: '', subject: 'duvida', message: '' })
    const [problems, setProblems] = useState({})
    const [sent, setSent] = useState(null)
    const [openFaq, setOpenFaq] = useState(0)
    const doneRef = useRef(null)

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    // Quem já entrou não precisa digitar nome e e-mail
    useEffect(() => {
        if (!user) return
        setForm((prev) => ({
            ...prev,
            name: prev.name || (user.name || '').slice(0, NAME_MAX),
            email: prev.email || user.email || ''
        }))
    }, [user])

    useEffect(() => {
        if (sent) doneRef.current?.focus()
    }, [sent])

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }))
        if (problems[name]) setProblems((prev) => ({ ...prev, [name]: undefined }))
    }

    const openMail = (msg) => {
        window.location.href = `mailto:${msg.to}?subject=${encodeURIComponent(msg.title)}&body=${encodeURIComponent(msg.body)}`
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        const found = formProblems(form)
        setProblems(found)
        const first = ['name', 'email', 'message'].find((k) => found[k])
        if (first) {
            document.getElementById(`ctt-${first}`)?.focus()
            return
        }
        const msg = buildMessage(form)
        setSent(msg)
        openMail(msg)
    }

    const copyAndTell = async (text, okMessage) => {
        const ok = await copyText(text)
        showToast(ok ? okMessage : 'Não deu para copiar. Selecione o texto e copie à mão.', ok ? 'success' : 'error')
    }

    const faqs = [
        {
            q: 'O EuSempreMEI substitui o contador?',
            a: 'Não. O EuSempreMEI ajuda a organizar as finanças e a acompanhar o limite e os impostos do MEI. Os cálculos são estimativas; o que for entregue à Receita Federal ou à prefeitura deve ser conferido com um contador.'
        },
        {
            q: 'Quem mantém o EuSempreMEI?',
            a: `${COMPANY.legalName}, ${COMPANY.legalNature}, CNPJ ${COMPANY.cnpj}, com endereço em ${COMPANY.address}.`
        },
        {
            q: 'Como cancelo ou troco o meu plano?',
            a: 'Em Minha conta ou em Planos, depois de entrar. O cancelamento para as próximas cobranças e o acesso continua até o fim do período já pago.'
        },
        {
            q: 'Em quanto tempo vocês respondem?',
            a: 'Respondemos de segunda a sexta, das 9h às 18h (horário de Brasília), em geral em até 24 horas úteis.'
        }
    ]

    const left = MESSAGE_MAX - form.message.trim().length

    return (
        <div className="contato">
            <div className="ctt-wrap">
                <header className="ctt-head">
                    <h1>Fale com a gente</h1>
                    <p>Escreva a sua mensagem e escolha o assunto: ela vai para a equipe certa.</p>
                </header>

                <div className="ctt-grid">
                    <section className="ctt-card ctt-form-card" aria-labelledby="ctt-form-title">
                        <h2 id="ctt-form-title" className="ctt-h2">Escrever mensagem</h2>
                        <p className="ctt-muted">
                            Ao continuar, abrimos o seu aplicativo de e-mail com a mensagem pronta. É só conferir e enviar por lá.
                        </p>

                        {sent ? (
                            <div className="ctt-done" ref={doneRef} tabIndex={-1} role="status">
                                <div className="ctt-done__head">
                                    <CheckCircle2 size={20} aria-hidden="true" />
                                    <strong>Mensagem pronta no seu aplicativo de e-mail</strong>
                                </div>
                                <p>
                                    Confira e envie por lá. Se nada abriu (por exemplo, se você usa o e-mail pelo navegador),
                                    copie a mensagem e mande para <strong><MailText email={sent.to} /></strong>.
                                </p>
                                <div className="ctt-actions">
                                    <button type="button" className="ctt-btn ctt-btn--primary" onClick={() => copyAndTell(`${sent.title}\n\n${sent.body}`, 'Mensagem copiada')}>
                                        <Copy size={16} aria-hidden="true" /> Copiar mensagem
                                    </button>
                                    <button type="button" className="ctt-btn" onClick={() => copyAndTell(sent.to, 'E-mail copiado')}>
                                        <Mail size={16} aria-hidden="true" /> Copiar e-mail
                                    </button>
                                    <button type="button" className="ctt-btn" onClick={() => openMail(sent)}>
                                        <ExternalLink size={16} aria-hidden="true" /> Abrir de novo
                                    </button>
                                </div>
                                <button type="button" className="ctt-link" onClick={() => setSent(null)}>
                                    Voltar e mudar a mensagem
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="ctt-form" noValidate>
                                <div className="ctt-row">
                                    <div className="ctt-field">
                                        <label htmlFor="ctt-name">Seu nome</label>
                                        <input
                                            id="ctt-name"
                                            type="text"
                                            autoComplete="name"
                                            maxLength={NAME_MAX}
                                            placeholder="Maria da Silva"
                                            value={form.name}
                                            onChange={(e) => setField('name', e.target.value)}
                                            aria-invalid={problems.name ? 'true' : undefined}
                                            aria-describedby={problems.name ? 'ctt-name-err' : undefined}
                                        />
                                        {problems.name && <p className="ctt-err" id="ctt-name-err"><AlertCircle size={14} aria-hidden="true" />{problems.name}</p>}
                                    </div>
                                    <div className="ctt-field">
                                        <label htmlFor="ctt-email">E-mail para a resposta</label>
                                        <input
                                            id="ctt-email"
                                            type="email"
                                            inputMode="email"
                                            autoComplete="email"
                                            maxLength={254}
                                            placeholder="maria@exemplo.com.br"
                                            value={form.email}
                                            onChange={(e) => setField('email', e.target.value)}
                                            aria-invalid={problems.email ? 'true' : undefined}
                                            aria-describedby={problems.email ? 'ctt-email-err' : undefined}
                                        />
                                        {problems.email && <p className="ctt-err" id="ctt-email-err"><AlertCircle size={14} aria-hidden="true" />{problems.email}</p>}
                                    </div>
                                </div>

                                <div className="ctt-field">
                                    <label htmlFor="ctt-subject">Assunto</label>
                                    <Select
                                        id="ctt-subject"
                                        variant="field"
                                        value={form.subject}
                                        onChange={(v) => setField('subject', v)}
                                        options={SUBJECTS.map(({ value, label }) => ({ value, label }))}
                                    />
                                    <p className="ctt-hint">Vai para <MailText email={subjectOf(form.subject).email} /></p>
                                </div>

                                <div className="ctt-field">
                                    <label htmlFor="ctt-message">Mensagem</label>
                                    <textarea
                                        id="ctt-message"
                                        rows={6}
                                        maxLength={MESSAGE_MAX + 200}
                                        placeholder="Conte o que aconteceu ou o que você precisa."
                                        value={form.message}
                                        onChange={(e) => setField('message', e.target.value)}
                                        aria-invalid={problems.message ? 'true' : undefined}
                                        aria-describedby="ctt-message-count"
                                    />
                                    <div className="ctt-field__foot">
                                        {problems.message
                                            ? <p className="ctt-err"><AlertCircle size={14} aria-hidden="true" />{problems.message}</p>
                                            : <span />}
                                        <span id="ctt-message-count" className={`ctt-count${left < 0 ? ' is-over' : ''}`}>
                                            {left >= 0 ? `Cabem mais ${left} letras` : `${-left} letras a mais`}
                                        </span>
                                    </div>
                                </div>

                                <button type="submit" className="ctt-btn ctt-btn--primary ctt-btn--wide">
                                    <Mail size={16} aria-hidden="true" /> Abrir no meu e-mail
                                </button>
                            </form>
                        )}
                    </section>

                    <aside className="ctt-channels" aria-labelledby="ctt-channels-title">
                        <h2 id="ctt-channels-title" className="ctt-h2">Ou escreva direto</h2>
                        <ul className="ctt-channel-list">
                            {CHANNELS.map(({ icon: Icon, title, text, email }) => (
                                <li key={email} className="ctt-channel">
                                    <span className="ctt-channel__icon" aria-hidden="true"><Icon size={18} /></span>
                                    <div className="ctt-channel__body">
                                        <strong>{title}</strong>
                                        <span>{text}</span>
                                        <div className="ctt-channel__mail">
                                            <a href={`mailto:${email}`}><MailText email={email} /></a>
                                            <button
                                                type="button"
                                                className="ctt-copy"
                                                onClick={() => copyAndTell(email, 'E-mail copiado')}
                                                aria-label={`Copiar ${email}`}
                                            >
                                                <Copy size={16} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="ctt-hours">
                            <Clock size={18} aria-hidden="true" />
                            <div>
                                <strong>Segunda a sexta, das 9h às 18h</strong>
                                <span>Horário de Brasília. Respostas em até 24 horas úteis.</span>
                            </div>
                        </div>
                    </aside>
                </div>

                <div className="ctt-grid ctt-grid--bottom">
                    <section className="ctt-card" aria-labelledby="ctt-faq-title">
                        <h2 id="ctt-faq-title" className="ctt-h2">Perguntas frequentes</h2>
                        <div className="ctt-faq">
                            {faqs.map((faq, i) => {
                                const open = openFaq === i
                                return (
                                    <div key={faq.q} className={`ctt-faq__item${open ? ' is-open' : ''}`}>
                                        <h3>
                                            <button
                                                type="button"
                                                aria-expanded={open}
                                                aria-controls={`ctt-faq-${i}`}
                                                onClick={() => setOpenFaq(open ? null : i)}
                                            >
                                                <span>{faq.q}</span>
                                                <ChevronDown size={18} aria-hidden="true" />
                                            </button>
                                        </h3>
                                        <div id={`ctt-faq-${i}`} className="ctt-faq__answer" hidden={!open}>
                                            <p>{faq.a}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>

                    <section className="ctt-card ctt-company" aria-labelledby="ctt-company-title">
                        <h2 id="ctt-company-title" className="ctt-h2 ctt-h2--icon">
                            <span className="ctt-company__icon" aria-hidden="true"><Building2 size={18} /></span>
                            Quem mantém o site
                        </h2>
                        <dl>
                            <div className="ctt-span"><dt>Empresa</dt><dd>{COMPANY.legalName}</dd></div>
                            <div><dt>CNPJ</dt><dd className="ctt-num">{COMPANY.cnpj}</dd></div>
                            <div><dt>Telefone</dt><dd><a href={COMPANY.phoneHref}>{COMPANY.phone}</a></dd></div>
                            <div className="ctt-span"><dt>Endereço</dt><dd>{COMPANY.address}</dd></div>
                        </dl>
                        <nav className="ctt-legal" aria-label="Documentos">
                            <Link to="/politica-de-privacidade">Política de privacidade</Link>
                            <Link to="/termos-de-servico">Termos de serviço</Link>
                            <Link to="/exclusao-de-dados">Exclusão de dados</Link>
                        </nav>
                    </section>
                </div>
            </div>
        </div>
    )
}
