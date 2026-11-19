import { Link } from 'react-router-dom'
import { Building2, Ban, FileCheck2, Trash2, Mail, FileText, MessageSquare } from 'lucide-react'
import LegalDoc from '../components/legal/LegalDoc'
import { COMPANY, CONTACT_EMAILS, LEGAL_LAST_UPDATED } from '../utils/legalInfo'

// O texto das partes é o texto legal em vigor (versão LEGAL_VERSION).
// Mudou o texto? Atualize LEGAL_LAST_UPDATED e LEGAL_VERSION em utils/legalInfo.js.
// Quebra a linha depois do @ (e não no meio do domínio) em telas estreitas
function MailText({ email }) {
    const [user, domain] = email.split('@')
    return <>{user}@<wbr />{domain}</>
}

const SECTIONS = [
    {
        id: 'introducao',
        title: 'Introdução',
        content: (
            <>
                <p>
                    Esta Política explica, em linguagem simples, quais dados pessoais o {COMPANY.productName} trata, para quê, com quem compartilha, por quanto tempo guarda e como você exerce os seus direitos. Ela segue a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD), o Marco Civil da Internet (Lei nº 12.965/2014), o Código de Defesa do Consumidor e as resoluções da Autoridade Nacional de Proteção de Dados (ANPD).
                </p>
                <p>
                    Ela vale para o site {COMPANY.domain}, para a aplicação {COMPANY.productName} e para os canais de atendimento ligados a ela, inclusive o WhatsApp, quando você decide ativá-lo.
                </p>
            </>
        ),
    },
    {
        id: 'dados-que-coletamos',
        title: 'Dados que coletamos',
        content: (
            <>
                <ul>
                    <li>
                        <strong>Cadastro:</strong> nome, e-mail e senha (guardada só como código criptografado, com bcrypt; ninguém consegue ler a sua senha), além da data e da versão destes documentos que você aceitou ao criar a conta.
                    </li>
                    <li>
                        <strong>Simulações:</strong> tipo de atividade (comércio, serviço ou os dois), faturamento informado e se você tem funcionário. Sem conta, a simulação é calculada e não fica guardada no nosso banco de dados; com conta, ela entra no seu histórico.
                    </li>
                    <li>
                        <strong>Gestão financeira:</strong> lançamentos de receitas e despesas, contas a pagar, categorias, carteiras (pessoal ou do MEI, com CPF ou CNPJ quando você informa), cartões (apelido, bandeira, 4 últimos números, dias de fechamento e vencimento e limite), alertas que você configura e as imagens opcionais que você escolhe para cartões e carteiras. Não pedimos o número completo nem o código de segurança de cartões; por isso, não use como imagem a foto do seu cartão de verdade.
                    </li>
                    <li>
                        <strong>Faturas enviadas:</strong> arquivos de fatura (PDF, imagem, CSV ou OFX) que você decide enviar, para que a inteligência artificial leia as compras.
                    </li>
                    <li>
                        <strong>Assinatura e pagamento:</strong> plano escolhido, situação da assinatura e os códigos que identificam você e a sua assinatura no Stripe. Os dados do cartão de crédito são digitados na página do Stripe e não passam pelos nossos servidores.
                    </li>
                    <li>
                        <strong>Dados técnicos e de segurança:</strong> endereço IP, data e hora de acesso, navegador (user agent), um identificador técnico do aparelho (criado no seu navegador a partir de características como idioma, tamanho da tela e fuso horário, somadas a um número aleatório) e o registro de eventos da conta, como entradas, saídas, tentativas de entrar com senha errada (com o e-mail digitado) e pedidos de senha nova.
                    </li>
                    <li>
                        <strong>Canal WhatsApp (opcional):</strong> se você vincular o seu número, tratamos o número de telefone, a data em que você autorizou o contato e as mensagens de texto, áudio, imagem ou PDF que você enviar ao nosso número oficial.
                    </li>
                    <li>
                        <strong>Atendimento:</strong> o que você nos escreve por e-mail ou pela página de contato, com o seu nome e e-mail.
                    </li>
                    <li>
                        <strong>Teste grátis:</strong> o teste começa quando você confirma o e-mail pelo link que mandamos. Para que o mesmo e-mail e o mesmo aparelho não ganhem outro teste, guardamos um código irreversível (SHA-256) do e-mail, em que apelidos do mesmo endereço contam como um só, e um código irreversível do identificador técnico do aparelho usado no cadastro. Nunca o e-mail nem o identificador em si.
                    </li>
                </ul>
                <p>
                    <strong>Armazenamento no navegador:</strong> cookies de anúncios só com o seu aceite (veja Cookies e anúncios, logo abaixo). Fora isso, usamos o armazenamento do seu navegador apenas para manter você conectado (código de sessão e nome, e-mail e plano para mostrar no topo do site), guardar o identificador técnico do aparelho, o plano escolhido antes do cadastro, preferências de avisos, o resultado da última simulação, o motivo de uma saída automática da conta e a sua escolha sobre os cookies de anúncios. Na página de pagamento, o Stripe usa os próprios cookies, conforme a política dele.
                </p>
                <p>
                    <strong>Dados sensíveis:</strong> não pedimos dados sensíveis (como saúde, religião ou opinião política). Evite escrevê-los nas descrições de lançamentos ou nas mensagens.
                </p>
            </>
        ),
    },
    {
        id: 'cookies',
        title: 'Cookies e anúncios',
        content: (
            <>
                <p>
                    Anunciamos o {COMPANY.productName} no Facebook e no Instagram. Para saber quais anúncios trazem pessoas
                    que criam conta, o site pode usar o <strong>Pixel da Meta</strong>, mas <strong>só se você tocar em Aceitar</strong> no
                    aviso de cookies. Antes disso, nada da Meta é carregado. Recusar não muda nada no uso do site.
                </p>
                <ul>
                    <li><strong>O que o Pixel registra:</strong> as páginas visitadas, a criação da conta, o início de um teste grátis e a assinatura de um plano, junto com dados técnicos do navegador (como o IP e os cookies da Meta). Não mandamos nome, e-mail, telefone nem dados financeiros.</li>
                    <li><strong>Quem recebe:</strong> a Meta Platforms, que trata esses dados também conforme a política de privacidade dela.</li>
                    <li><strong>Mudar de ideia:</strong> toque em Cookies, no rodapé do site, e escolha de novo. Você também pode apagar os cookies no navegador.</li>
                </ul>
            </>
        ),
    },
    {
        id: 'finalidades-e-bases-legais',
        title: 'Finalidades e bases legais',
        content: (
            <>
                <p>Cada uso dos seus dados tem uma finalidade definida e uma base legal prevista no art. 7º da LGPD:</p>
                <ul>
                    <li><strong>Criar e manter a sua conta, calcular simulações e oferecer as ferramentas financeiras e os alertas no site:</strong> execução de contrato (art. 7º, V).</li>
                    <li><strong>Cobrar as assinaturas pelo Stripe e cumprir obrigações fiscais:</strong> execução de contrato (art. 7º, V) e cumprimento de obrigação legal (art. 7º, II).</li>
                    <li><strong>Ler com inteligência artificial as faturas que você envia:</strong> execução de contrato (art. 7º, V), só quando você envia o arquivo.</li>
                    <li><strong>Atendimento pelo WhatsApp e lembretes e alertas por lá:</strong> consentimento (art. 7º, I), dado quando você vincula o número e que pode ser retirado a qualquer momento.</li>
                    <li><strong>Medir os nossos anúncios com o Pixel da Meta:</strong> consentimento (art. 7º, I), dado no aviso de cookies e que pode ser retirado a qualquer momento.</li>
                    <li><strong>Evitar que o mesmo e-mail ou o mesmo aparelho use o teste grátis mais de uma vez:</strong> legítimo interesse (art. 7º, IX), guardando só códigos irreversíveis do e-mail e do identificador do aparelho.</li>
                    <li><strong>Guardar os registros de acesso:</strong> cumprimento de obrigação legal do Marco Civil da Internet (art. 7º, II).</li>
                    <li><strong>Proteger a conta (limite de tentativas de entrar, conferência de senha vazada, controle de aparelhos e registro de eventos) e evitar fraudes:</strong> legítimo interesse (art. 7º, IX), sempre limitado ao necessário para a sua segurança.</li>
                    <li><strong>Responder ao seu contato e defender direitos em processos:</strong> execução de contrato e exercício regular de direitos (art. 7º, V e VI).</li>
                </ul>
                <p className="lgl-note">
                    <strong>Não comercializamos dados:</strong> o {COMPANY.productName} e seu controlador não vendem, alugam ou cedem dados pessoais para fins de marketing ou publicidade de terceiros, e não enviamos propaganda. A única exceção é o Pixel da Meta, que só funciona se você aceitar os cookies de anúncios.
                </p>
                <p>
                    <strong>Inteligência artificial:</strong> a IA lê faturas, sugere categorias e entende os pedidos feitos pelo WhatsApp. Ela não decide nada sozinha: nada é gravado na sua conta sem a sua confirmação, e você pode pedir a revisão de qualquer resultado (art. 20 da LGPD).
                </p>
            </>
        ),
    },
    {
        id: 'compartilhamento',
        title: 'Compartilhamento com terceiros',
        content: (
            <>
                <p>Compartilhamos dados apenas com fornecedores que operam o serviço em nosso nome (operadores), na medida do necessário e só para essas finalidades:</p>
                <ul>
                    <li><strong>Vercel Inc.:</strong> hospedagem do site e do servidor.</li>
                    <li><strong>Supabase Inc.:</strong> banco de dados onde as suas informações ficam guardadas.</li>
                    <li><strong>Google LLC (API Gemini):</strong> leitura das faturas que você envia e, no canal WhatsApp, interpretação de mensagens de texto, áudio e imagem.</li>
                    <li><strong>Stripe:</strong> cobrança e pagamento das assinaturas.</li>
                    <li><strong>Resend:</strong> envio dos e-mails do site, como o link para criar uma senha nova.</li>
                    <li><strong>Meta Platforms (WhatsApp Business):</strong> somente se você ativar o canal WhatsApp, para entregar e receber as mensagens.</li>
                    <li><strong>Meta Platforms (Pixel da Meta):</strong> somente se você aceitar os cookies de anúncios, para medir os nossos anúncios no Facebook e no Instagram.</li>
                    <li><strong>Autoridades públicas:</strong> quando houver requisição legal ou ordem judicial.</li>
                </ul>
            </>
        ),
    },
    {
        id: 'transferencia-internacional',
        title: 'Transferência internacional',
        content: (
            <>
                <p>
                    Os fornecedores acima guardam ou processam dados fora do Brasil, nos <strong>Estados Unidos</strong>:
                </p>
                <ul>
                    <li><strong>Hospedagem (Vercel) e banco de dados (Supabase):</strong> todos os dados da conta, enquanto ela existir.</li>
                    <li><strong>Inteligência artificial (Google):</strong> o arquivo da fatura e as mensagens do WhatsApp, só pelo tempo de processar o pedido.</li>
                    <li><strong>Pagamentos (Stripe), e-mails (Resend) e WhatsApp (Meta):</strong> os dados necessários para cobrar, mandar o e-mail ou entregar a mensagem, pelos prazos de cada um.</li>
                    <li><strong>Pixel da Meta:</strong> só com o seu aceite, os dados de navegação descritos em Cookies e anúncios, pelos prazos da Meta.</li>
                </ul>
                <p>
                    Essas transferências se apoiam nas garantias contratuais de proteção de dados desses fornecedores (art. 33, II, da LGPD) e são necessárias para prestar o serviço que você contratou (art. 33, IX, da LGPD). Todos os seus direitos desta Política valem também para esses dados, e você pode pedir mais informações pelo canal de privacidade.
                </p>
            </>
        ),
    },
    {
        id: 'por-quanto-tempo',
        title: 'Por quanto tempo guardamos os dados',
        content: (
            <ul>
                <li><strong>Dados da conta, financeiros e simulações:</strong> enquanto a sua conta existir. Quando você exclui a conta, são apagados de vez.</li>
                <li><strong>Faturas enviadas:</strong> o arquivo é lido na hora e não fica guardado. Guardamos o nome, o tipo e o tamanho do arquivo e as compras lidas, que seguem o prazo dos dados da conta.</li>
                <li><strong>Assinatura:</strong> os códigos do Stripe são apagados junto com a conta, e a assinatura é cancelada. O Stripe guarda os próprios registros das cobranças pelos prazos legais que valem para ele.</li>
                <li><strong>Tentativas de entrar e pedidos de senha nova (e-mail e IP):</strong> até 1 dia. Saem antes quando você entra com a senha certa, cria uma senha nova ou exclui a conta.</li>
                <li><strong>Link de senha nova:</strong> vale por 1 hora e só pode ser usado uma vez.</li>
                <li><strong>Aparelhos conectados (IP, navegador e identificador técnico):</strong> enquanto a conta existir.</li>
                <li><strong>Registros de acesso e de segurança (IP, data, hora e evento):</strong> no mínimo 6 meses, como exige o art. 15 do Marco Civil da Internet, inclusive depois da exclusão da conta, quando deixam de estar ligados a ela.</li>
                <li><strong>Canal WhatsApp:</strong> o número e a data da autorização ficam guardados enquanto o canal estiver ativo e saem ao desconectar o número ou excluir a conta. O conteúdo das mensagens não é armazenado: um pedido entendido fica guardado no máximo 30 minutos, esperando a sua confirmação, e o identificador técnico de cada mensagem recebida, por 30 dias, para evitar processamento em dobro e abusos. Áudios e imagens não ficam guardados como arquivo.</li>
                <li><strong>Atendimento:</strong> as mensagens que você nos envia ficam guardadas pelo tempo necessário para responder e manter o histórico do seu pedido.</li>
                <li><strong>Teste grátis (códigos irreversíveis do e-mail e do aparelho):</strong> até 2 anos, inclusive depois da exclusão da conta, só para o mesmo e-mail e o mesmo aparelho não ganharem outro teste. O link de confirmação vale por 48 horas.</li>
                <li><strong>Escolha sobre os cookies de anúncios:</strong> fica só no seu navegador até você mudar ou apagar.</li>
            </ul>
        ),
    },
    {
        id: 'seguranca',
        title: 'Segurança',
        content: (
            <>
                <ul>
                    <li>Comunicação criptografada (HTTPS) em todo o site;</li>
                    <li>Senhas guardadas só como código bcrypt;</li>
                    <li>Senhas que aparecem em vazamentos conhecidos são recusadas. A conferência é feita no serviço Have I Been Pwned, que recebe só os 5 primeiros caracteres de um código da senha, nunca a senha nem o seu e-mail;</li>
                    <li>Limite de tentativas de entrar com senha errada, por e-mail e por rede;</li>
                    <li>Link de senha nova de uso único e com prazo;</li>
                    <li>Cada conta só acessa os próprios dados, conferido em cada operação;</li>
                    <li>Conta bloqueada ou excluída perde o acesso na hora, em todos os aparelhos;</li>
                    <li>Opção de um aparelho por vez, conforme o plano: ao entrar num aparelho novo, os outros saem da conta;</li>
                    <li>Códigos de vínculo do WhatsApp guardados só como código criptografado e válidos por 15 minutos;</li>
                    <li>Acesso interno restrito à administração do site, apenas para suporte, segurança e cobrança;</li>
                    <li>Registro de eventos de segurança para auditoria.</li>
                </ul>
                <p>
                    Se houver um incidente de segurança que possa trazer risco ou dano relevante, avisaremos os titulares afetados e a Autoridade Nacional de Proteção de Dados (ANPD), como determinam o art. 48 da LGPD e a Resolução CD/ANPD nº 15/2024.
                </p>
            </>
        ),
    },
    {
        id: 'canal-whatsapp',
        title: 'Canal WhatsApp',
        content: (
            <>
                <p>
                    O atendimento pelo WhatsApp é opcional e só começa quando você vincula o seu número na área da conta. Por ele, você pode registrar movimentações, consultar e marcar contas a pagar e receber lembretes de vencimento e alertas do MEI (como limite de faturamento, DAS e declaração anual).
                </p>
                <ul>
                    <li>O número é vinculado por um código de uso único, gerado na sua conta e enviado do seu próprio WhatsApp;</li>
                    <li>O assistente usa inteligência artificial (Google Gemini) apenas para entender o seu pedido e responde somente sobre as suas finanças no {COMPANY.productName};</li>
                    <li>Nenhum lançamento é gravado sem a sua confirmação no próprio WhatsApp;</li>
                    <li>Você pode desligar o lembrete diário enviando <strong>PARAR</strong> e desconectar o número enviando <strong>DESVINCULAR</strong> ou pela sua conta;</li>
                    <li>As mensagens passam pela infraestrutura da Meta (WhatsApp Business) e seguem também a política de privacidade do WhatsApp;</li>
                    <li>Áudios e imagens são usados apenas para entender o seu pedido e não ficam guardados como arquivo.</li>
                </ul>
            </>
        ),
    },
    {
        id: 'seus-direitos',
        title: 'Seus direitos (art. 18 da LGPD)',
        content: (
            <>
                <ul>
                    <li>Confirmação de que tratamos os seus dados e acesso a eles;</li>
                    <li>Correção de dados incompletos, errados ou desatualizados;</li>
                    <li>Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desacordo com a LGPD;</li>
                    <li>Portabilidade dos dados a outro fornecedor;</li>
                    <li>Eliminação dos dados tratados com o seu consentimento e retirada desse consentimento (por exemplo, desconectando o WhatsApp);</li>
                    <li>Informação sobre com quem compartilhamos os seus dados e sobre a possibilidade de não dar o consentimento e o que acontece nesse caso;</li>
                    <li>Oposição a um tratamento feito com base no legítimo interesse, quando ele não seguir a LGPD;</li>
                    <li>Revisão de resultados da inteligência artificial (art. 20 da LGPD);</li>
                    <li>Petição à ANPD, se entender que os seus direitos não foram atendidos.</li>
                </ul>
                <p>
                    Para exercer qualquer direito, escreva para{' '}
                    <a className="lgl-link" href={`mailto:${CONTACT_EMAILS.privacidade}`}>{CONTACT_EMAILS.privacidade}</a>{' '}
                    a partir do e-mail cadastrado na sua conta. Podemos pedir informações para confirmar que é você antes de atender. Respondemos em até 15 dias, como prevê o art. 19 da LGPD. A exclusão da conta você também faz sozinho, em Minha conta.
                </p>
            </>
        ),
    },
    {
        id: 'exclusao',
        title: 'Exclusão da conta e dos dados',
        content: (
            <>
                <p>
                    Você pode excluir a sua conta a qualquer momento em <strong>Minha conta &gt; Excluir conta</strong>, ou pedir a exclusão pelo e-mail de privacidade. Ao excluir, apagamos de vez a conta, as carteiras, os lançamentos, os cartões, as faturas, as categorias, os alertas, as simulações, o vínculo com o WhatsApp e as tentativas de entrar ligadas ao seu e-mail, e cancelamos a assinatura no Stripe.
                </p>
                <p>
                    Ficam apenas os registros de acesso e de segurança exigidos pelo Marco Civil da Internet, sem ligação com a conta, e os registros de cobrança que o próprio Stripe guarda. O passo a passo está na página{' '}
                    <Link to="/exclusao-de-dados" className="lgl-link">Exclusão de Dados</Link>.
                </p>
            </>
        ),
    },
    {
        id: 'menores-de-idade',
        title: 'Menores de idade',
        content: (
            <p>
                O {COMPANY.productName} é destinado a maiores de 18 anos. Não coletamos de propósito dados de crianças ou adolescentes; se identificarmos um cadastro assim, ele será excluído.
            </p>
        ),
    },
    {
        id: 'canal-de-privacidade',
        title: 'Canal de privacidade',
        content: (
            <>
                <p>
                    Como agente de tratamento de pequeno porte, o controlador não é obrigado a indicar um encarregado de dados (Resolução CD/ANPD nº 2/2022, art. 11) e mantém este canal de comunicação dedicado aos titulares e à ANPD:
                </p>
                <dl className="lgl-facts">
                    <div className="is-wide">
                        <dt>Controlador</dt>
                        <dd>{COMPANY.legalName}</dd>
                    </div>
                    <div>
                        <dt>CNPJ</dt>
                        <dd>{COMPANY.cnpj}</dd>
                    </div>
                    <div>
                        <dt>Telefone</dt>
                        <dd><a className="lgl-link" href={COMPANY.phoneHref}>{COMPANY.phone}</a></dd>
                    </div>
                    <div className="is-wide">
                        <dt>Endereço</dt>
                        <dd>{COMPANY.address}</dd>
                    </div>
                    <div>
                        <dt>Privacidade e LGPD</dt>
                        <dd><a className="lgl-link" href={`mailto:${CONTACT_EMAILS.privacidade}`}>{CONTACT_EMAILS.privacidade}</a></dd>
                    </div>
                    <div>
                        <dt>Atendimento geral</dt>
                        <dd><a className="lgl-link" href={`mailto:${CONTACT_EMAILS.contato}`}>{CONTACT_EMAILS.contato}</a></dd>
                    </div>
                    <div className="is-wide">
                        <dt>Página de atendimento</dt>
                        <dd><Link to="/contato" className="lgl-link">Fale com a gente</Link></dd>
                    </div>
                </dl>
            </>
        ),
    },
    {
        id: 'alteracoes',
        title: 'Alterações desta política',
        content: (
            <p>
                Podemos atualizar esta Política quando o serviço ou a lei mudarem. A data da última atualização fica no topo desta página. Mudanças relevantes, como um novo uso dos dados ou um novo fornecedor, serão avisadas por e-mail aos usuários cadastrados antes de valerem.
            </p>
        ),
    },
]

const SUMMARY = {
    title: 'Em poucas palavras',
    items: [
        {
            icon: Ban,
            title: 'Não vendemos seus dados',
            text: 'Nada é vendido nem alugado. Cookies de anúncios só com o seu aceite.',
        },
        {
            icon: FileCheck2,
            title: 'Você decide o que envia',
            text: 'Faturas e WhatsApp são opcionais. Arquivos e áudios são lidos e não ficam guardados.',
        },
        {
            icon: Trash2,
            title: 'Pode apagar quando quiser',
            text: 'Em Minha conta você exclui a conta e os dados saem de vez.',
        },
        {
            icon: Mail,
            title: 'Fale com quem cuida disso',
            text: <MailText email={CONTACT_EMAILS.privacidade} />,
        },
    ],
    note: 'Este resumo ajuda na leitura. O que vale é o texto completo abaixo.',
}

const RELATED = [
    { to: '/termos-de-servico', icon: FileText, title: 'Termos de serviço', text: 'As regras de uso do site e das assinaturas.' },
    { to: '/exclusao-de-dados', icon: Trash2, title: 'Exclusão de dados', text: 'Como apagar a sua conta e tudo o que está nela.' },
    { to: '/contato', icon: MessageSquare, title: 'Fale com a gente', text: 'Dúvidas, suporte e pedidos sobre os seus dados.' },
]

export default function PrivacyPolicy() {
    return (
        <LegalDoc
            title="Política de privacidade"
            intro={`Como o ${COMPANY.productName} coleta, usa, compartilha e protege os seus dados pessoais.`}
            updated={LEGAL_LAST_UPDATED}
            summary={SUMMARY}
            entity={(
                <>
                    <span className="lgl-entity__icon" aria-hidden="true"><Building2 size={20} /></span>
                    <div>
                        <h3>Quem é o controlador dos dados</h3>
                        <p>
                            O <strong>{COMPANY.productName}</strong> é um produto pertencente e operado por{' '}
                            <strong>{COMPANY.legalName}</strong>, {COMPANY.legalNature} inscrito no CNPJ sob o{' '}
                            <strong>nº {COMPANY.cnpj}</strong>, com sede em {COMPANY.address}, que atua como controlador dos dados pessoais tratados na plataforma.
                        </p>
                    </div>
                </>
            )}
            sections={SECTIONS}
            related={RELATED}
        />
    )
}
