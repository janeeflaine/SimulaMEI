import { Link } from 'react-router-dom'
import { Building2, Mail, UserX, Clock, Trash2, CreditCard, ShieldCheck, FileText, MessageSquare } from 'lucide-react'
import LegalDoc from '../components/legal/LegalDoc'
import { COMPANY, CONTACT_EMAILS, LEGAL_LAST_UPDATED } from '../utils/legalInfo'

const DELETION_SUBJECT = 'Solicitação de exclusão de conta e dados'
const DELETION_BODY = [
    'Olá,',
    '',
    `Peço a exclusão definitiva da minha conta no ${COMPANY.productName} e de todos os meus dados pessoais.`,
    '',
    'Nome completo:',
    'E-mail cadastrado:',
    '',
    'Estou ciente de que a exclusão não pode ser desfeita.'
].join('\n')

const MAILTO = `mailto:${CONTACT_EMAILS.privacidade}?subject=${encodeURIComponent(DELETION_SUBJECT)}&body=${encodeURIComponent(DELETION_BODY)}`

// Quebra a linha depois do @ (e não no meio do domínio) em telas estreitas
function MailText({ email }) {
    const [user, domain] = email.split('@')
    return <>{user}@<wbr />{domain}</>
}

const SECTIONS = [
    {
        id: 'pela-conta',
        title: 'Pela sua conta (na hora)',
        content: (
            <>
                <ol>
                    <li>Entre no {COMPANY.productName} e abra <Link to="/conta" className="lgl-link">Minha conta</Link>;</li>
                    <li>No bloco <strong>Sair ou excluir a conta</strong>, clique em <strong>Excluir conta</strong>;</li>
                    <li>Informe a sua senha e digite <strong>EXCLUIR</strong>;</li>
                    <li>Confira na janela o que vai ser apagado e clique em <strong>Excluir minha conta</strong>.</li>
                </ol>
                <p>
                    A exclusão acontece na hora. Se você tem um plano pago, a assinatura é cancelada no mesmo momento e nenhuma nova cobrança é feita. O tempo que faltava do mês já pago não é devolvido, exceto dentro dos 7 dias de arrependimento previstos nos{' '}
                    <Link to="/termos-de-servico#arrependimento" className="lgl-link">Termos de serviço</Link>.
                </p>
            </>
        ),
    },
    {
        id: 'por-email',
        title: 'Por e-mail (se não consegue entrar)',
        content: (
            <>
                <ol>
                    <li>
                        Escreva para <a className="lgl-link" href={MAILTO}><MailText email={CONTACT_EMAILS.privacidade} /></a>{' '}
                        <strong>a partir do e-mail cadastrado na sua conta</strong>, com o assunto "{DELETION_SUBJECT}";
                    </li>
                    <li>Respondemos confirmando o pedido e podemos pedir uma confirmação de identidade, para que ninguém peça a exclusão da sua conta no seu lugar;</li>
                    <li>A exclusão é feita em até 15 dias depois da confirmação, e você recebe um aviso por e-mail quando terminar. A assinatura paga, se houver, também é cancelada.</li>
                </ol>
                <div className="lgl-actions">
                    <a href={MAILTO} className="lgl-btn lgl-btn--primary">
                        <Mail size={16} aria-hidden="true" />
                        Pedir a exclusão por e-mail
                    </a>
                </div>
            </>
        ),
    },
    {
        id: 'o-que-sai',
        title: 'O que é apagado',
        content: (
            <ul>
                <li>A conta: nome, e-mail e senha;</li>
                <li>Carteiras, lançamentos, contas a pagar e categorias;</li>
                <li>Cartões, faturas, compras e o histórico de faturas enviadas;</li>
                <li>Alertas e simulações salvas;</li>
                <li>Aparelhos conectados, registros de pagamento e os códigos da assinatura na nossa base;</li>
                <li>O vínculo com o WhatsApp, os códigos de vínculo e os identificadores das mensagens;</li>
                <li>As tentativas de entrar ligadas ao seu e-mail.</li>
            </ul>
        ),
    },
    {
        id: 'o-que-fica',
        title: 'O que pode ficar guardado',
        content: (
            <ul>
                <li><strong>Registros de acesso e de segurança</strong> (IP, data, hora e evento): no mínimo 6 meses, como exige o art. 15 do Marco Civil da Internet, sem ligação com a conta excluída;</li>
                <li><strong>Registros de cobrança no Stripe</strong>, que o próprio Stripe guarda pelos prazos legais que valem para ele;</li>
                <li><strong>Mensagens trocadas com o atendimento</strong>, pelo tempo necessário para responder e manter o histórico do pedido.</li>
            </ul>
        ),
    },
    {
        id: 'antes-de-excluir',
        title: 'Antes de excluir',
        content: (
            <>
                <p className="lgl-note lgl-note--warn">
                    <strong>A exclusão não pode ser desfeita.</strong> Depois dela, não conseguimos recuperar nenhum dado.
                </p>
                <p>
                    Se quiser guardar alguma coisa, baixe antes o relatório em PDF do Painel e o PDF de Contas a pagar. Se quiser uma cópia dos seus dados, peça pelo e-mail de privacidade antes de excluir.
                </p>
            </>
        ),
    },
    {
        id: 'so-whatsapp',
        title: 'Só desligar o WhatsApp',
        content: (
            <p>
                Para parar de usar o WhatsApp sem excluir a conta, envie <strong>DESVINCULAR</strong> no WhatsApp ou desconecte o número em Minha conta: o número e a autorização são apagados. Para parar só o lembrete diário e continuar usando o atendimento, envie <strong>PARAR</strong>.
            </p>
        ),
    },
]

const SUMMARY = {
    title: 'Em poucas palavras',
    items: [
        { icon: UserX, title: 'Na hora, pela sua conta', text: 'Em Minha conta, com a sua senha.' },
        { icon: Clock, title: 'Sem acesso? Por e-mail', text: 'Excluímos em até 15 dias depois de confirmar que é você.' },
        { icon: Trash2, title: 'Sai tudo', text: 'Conta, lançamentos, cartões, faturas e WhatsApp.' },
        { icon: CreditCard, title: 'Sem novas cobranças', text: 'A assinatura é cancelada junto.' },
    ],
    note: 'Este resumo ajuda na leitura. O que vale é o texto completo abaixo.',
}

const RELATED = [
    { to: '/politica-de-privacidade', icon: ShieldCheck, title: 'Política de privacidade', text: 'Quais dados usamos, para quê e os seus direitos.' },
    { to: '/termos-de-servico', icon: FileText, title: 'Termos de serviço', text: 'As regras de uso do site e das assinaturas.' },
    { to: '/contato', icon: MessageSquare, title: 'Fale com a gente', text: 'Dúvidas, suporte e pedidos sobre a sua conta.' },
]

export default function DataDeletion() {
    return (
        <LegalDoc
            title="Exclusão de conta e dados"
            intro={`Como apagar de vez a sua conta e os seus dados pessoais no ${COMPANY.productName}.`}
            updated={LEGAL_LAST_UPDATED}
            summary={SUMMARY}
            entity={(
                <>
                    <span className="lgl-entity__icon" aria-hidden="true"><Building2 size={20} /></span>
                    <div>
                        <h3>Quem cuida do pedido</h3>
                        <p>
                            <strong>{COMPANY.legalName}</strong>, CNPJ <strong>{COMPANY.cnpj}</strong>, controlador dos dados do {COMPANY.productName}, com sede em {COMPANY.address}.
                        </p>
                    </div>
                </>
            )}
            sections={SECTIONS}
            related={RELATED}
        />
    )
}
