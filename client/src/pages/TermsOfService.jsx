import { Link } from 'react-router-dom'
import { Building2, Calculator, CalendarX2, Undo2, KeyRound, ShieldCheck, Trash2, MessageSquare } from 'lucide-react'
import LegalDoc from '../components/legal/LegalDoc'
import { COMPANY, CONTACT_EMAILS, LEGAL_LAST_UPDATED } from '../utils/legalInfo'

// O texto das partes é o texto legal em vigor (versão LEGAL_VERSION).
// Mudou o texto? Atualize LEGAL_LAST_UPDATED e LEGAL_VERSION em utils/legalInfo.js.
const SECTIONS = [
    {
        id: 'aceitacao',
        title: 'Aceitação dos termos',
        content: (
            <>
                <p>
                    Estes Termos de Serviço são o contrato entre você (o "Usuário") e o titular do {COMPANY.productName} para o uso do site {COMPANY.domain} e dos canais ligados a ele. Ao usar o site, fazer uma simulação ou criar uma conta, você concorda com estes Termos e com a{' '}
                    <Link to="/politica-de-privacidade" className="lgl-link">Política de Privacidade</Link>.
                </p>
                <p>
                    Ao criar uma conta, você confirma o aceite marcando a caixa do formulário de cadastro. Guardamos a data e a versão dos documentos que você aceitou.
                </p>
                <p>
                    O uso é permitido apenas a maiores de 18 anos. Se não concordar com estes Termos, não use o site.
                </p>
            </>
        ),
    },
    {
        id: 'o-que-oferecemos',
        title: 'O que o EuSempreMEI oferece',
        content: (
            <>
                <p>
                    O {COMPANY.productName} é um serviço on-line para o Microempreendedor Individual (MEI) organizar as finanças e acompanhar as obrigações do MEI. Conforme o plano, ele oferece:
                </p>
                <ul>
                    <li>Simulador do DAS e do uso do limite de faturamento do MEI, e comparativo entre continuar MEI e virar Microempresa no Simples Nacional;</li>
                    <li>Extrato de receitas e despesas, separadas entre as carteiras do MEI e a pessoal, com categorias;</li>
                    <li>Contas a pagar, com lembretes de vencimento;</li>
                    <li>Cartões de crédito e faturas, com leitura de faturas por inteligência artificial;</li>
                    <li>Alertas do limite de faturamento, do DAS e da declaração anual (DASN-SIMEI);</li>
                    <li>Atendimento e lembretes pelo WhatsApp.</li>
                </ul>
                <p>
                    O que cada plano inclui, os limites de uso (como número de carteiras ou de leituras de fatura por dia) e os preços ficam na página{' '}
                    <Link to="/planos" className="lgl-link">Planos</Link>.
                </p>
            </>
        ),
    },
    {
        id: 'estimativas',
        title: 'Os cálculos são estimativas',
        content: (
            <>
                <p className="lgl-note lgl-note--warn">
                    <strong>Aviso importante:</strong> simulações, cálculos, alertas e leituras de fatura do {COMPANY.productName} servem para orientar e ajudar na organização. Eles não são e não substituem parecer contábil, consultoria jurídica ou o serviço de um contador registrado no Conselho Regional de Contabilidade (CRC).
                </p>
                <p>
                    Os cálculos seguem as regras e os valores oficiais conhecidos na data (como salário mínimo, limites do MEI e tabelas do Simples Nacional), que podem mudar. Cabe a você conferir os seus pagamentos, notas fiscais e a declaração anual (DASN-SIMEI) junto à Receita Federal e aos órgãos do seu estado e município.
                </p>
            </>
        ),
    },
    {
        id: 'conta',
        title: 'Conta, senha e segurança',
        content: (
            <ul>
                <li>Informe dados verdadeiros e mantenha o seu e-mail atualizado: é por ele que você recupera a senha;</li>
                <li>A conta é pessoal. Você é responsável por guardar a sua senha e pelo que for feito com ela, e não pode ceder, emprestar ou vender a conta;</li>
                <li>Para proteger a conta, o site limita as tentativas de entrar com senha errada, recusa senhas que aparecem em vazamentos conhecidos e, em alguns planos, permite um aparelho por vez: entrar num aparelho novo encerra a sessão nos outros;</li>
                <li>Se suspeitar de uso indevido da sua conta, troque a senha e nos avise pelo e-mail de suporte;</li>
                <li>Podemos bloquear ou encerrar contas com cadastro falso, fraude ou que desrespeitem estes Termos. Sempre que possível, avisaremos o motivo pelo e-mail cadastrado.</li>
            </ul>
        ),
    },
    {
        id: 'uso-proibido',
        title: 'O que não é permitido',
        content: (
            <>
                <p>Ao usar o {COMPANY.productName}, você se compromete a não:</p>
                <ul>
                    <li>Usar o site para fins ilegais ou fraudulentos;</li>
                    <li>Atacar, sobrecarregar ou tentar invadir o site (como ataques de negação de serviço), nem fazer engenharia reversa ou coleta automática abusiva de dados;</li>
                    <li>Enviar vírus ou qualquer código malicioso, inclusive em arquivos de fatura ou mensagens do WhatsApp;</li>
                    <li>Tentar contornar limites do plano ou acessar dados de outras pessoas;</li>
                    <li>Copiar, reproduzir ou revender o software ou o serviço do {COMPANY.productName} sem autorização por escrito do titular.</li>
                </ul>
            </>
        ),
    },
    {
        id: 'ia-e-whatsapp',
        title: 'Inteligência artificial e WhatsApp',
        content: (
            <ul>
                <li>A leitura de faturas e o atendimento pelo WhatsApp usam inteligência artificial, que pode errar. Por isso, nada é gravado na sua conta sem a sua confirmação: confira as compras, os valores e as categorias antes de confirmar;</li>
                <li>A quantidade de leituras de fatura e de números de WhatsApp depende do plano;</li>
                <li>O canal WhatsApp é opcional. As mensagens passam pela Meta e seguem também os termos do WhatsApp. Envie <strong>PARAR</strong> para desligar o lembrete diário e <strong>DESVINCULAR</strong> para desconectar o número;</li>
                <li>Lembretes e alertas dependem do funcionamento do WhatsApp e da internet. Não deixe de acompanhar os seus vencimentos por conta própria.</li>
            </ul>
        ),
    },
    {
        id: 'planos-e-cobranca',
        title: 'Planos, cobrança e cancelamento',
        content: (
            <ul>
                <li><strong>Gratuito e pagos:</strong> há um plano gratuito, com recursos essenciais, e planos pagos com mais recursos.</li>
                <li><strong>Cobrança:</strong> os planos pagos são cobrados todo mês, de forma recorrente, pelo Stripe, nos meios de pagamento mostrados na página de pagamento. Os dados do cartão são digitados no Stripe e não passam pelos nossos servidores.</li>
                <li><strong>Renovação:</strong> a assinatura renova sozinha a cada mês até você cancelar.</li>
                <li><strong>Troca de plano:</strong> ao subir de plano, os recursos novos liberam na hora e é cobrada a diferença proporcional até o fim do mês já pago. Ao descer de plano, a troca vale na hora e a diferença vira crédito para as próximas cobranças. O valor exato aparece antes de você confirmar.</li>
                <li><strong>Cancelamento:</strong> você cancela quando quiser em Minha conta. O plano continua até o fim do período já pago e depois volta ao Gratuito, sem nova cobrança.</li>
                <li><strong>Pagamento recusado:</strong> o Stripe tenta cobrar de novo por alguns dias e o plano continua enquanto isso. Se não conseguir, a conta volta ao Gratuito, sem perder os seus dados.</li>
                <li><strong>Teste grátis:</strong> quando oferecido, a duração e o plano aparecem no cadastro, e não pedimos cartão. Ao terminar, a conta volta ao Gratuito, sem cobrança automática e sem perder os dados. Cada e-mail tem direito a um teste.</li>
                <li><strong>Mudança de preço ou de recursos:</strong> avisaremos por e-mail, com antecedência, qualquer aumento de preço ou redução de recursos de um plano pago que você assina. Se não concordar, você pode cancelar antes de a mudança valer.</li>
            </ul>
        ),
    },
    {
        id: 'arrependimento',
        title: 'Direito de arrependimento',
        content: (
            <p>
                Como a contratação é feita pela internet, você pode desistir da primeira assinatura de um plano pago em até 7 (sete) dias corridos depois de assinar e receber de volta todo o valor pago, como prevê o art. 49 do Código de Defesa do Consumidor. Para isso, cancele em Minha conta e escreva para{' '}
                <a className="lgl-link" href={`mailto:${CONTACT_EMAILS.suporte}`}>{CONTACT_EMAILS.suporte}</a>{' '}
                a partir do e-mail cadastrado. O valor é devolvido pelo Stripe, no mesmo meio de pagamento.
            </p>
        ),
    },
    {
        id: 'exclusao-da-conta',
        title: 'Exclusão da conta',
        content: (
            <p>
                Você pode excluir a sua conta a qualquer momento em Minha conta. A exclusão apaga de vez os seus dados, como explica a{' '}
                <Link to="/politica-de-privacidade#exclusao" className="lgl-link">Política de Privacidade</Link>
                , e cancela a assinatura na hora, sem novas cobranças. O tempo que faltava do mês já pago não é devolvido, exceto dentro do prazo de arrependimento. Os dados excluídos não podem ser recuperados.
            </p>
        ),
    },
    {
        id: 'responsabilidade',
        title: 'Disponibilidade e responsabilidade',
        content: (
            <>
                <p>
                    Trabalhamos para manter o {COMPANY.productName} funcionando 24 horas por dia, mas podem acontecer interrupções por manutenção, falhas de fornecedores, de internet ou motivos de força maior. Sempre que possível, manutenções programadas serão avisadas.
                </p>
                <p>
                    O {COMPANY.productName} organiza informações que você mesmo registra e não guarda os arquivos de fatura que você envia. Mantenha os seus comprovantes, notas fiscais e documentos originais.
                </p>
                <p>
                    Não respondemos por decisões comerciais, fiscais ou financeiras tomadas só com base nas estimativas do site, sem conferência com um contador, nem por dados registrados de forma errada. Nada nestes Termos limita os direitos que você tem pelo Código de Defesa do Consumidor.
                </p>
            </>
        ),
    },
    {
        id: 'propriedade-intelectual',
        title: 'Propriedade intelectual e seus dados',
        content: (
            <>
                <p>
                    A marca, o logotipo, o design, os textos, os códigos e os métodos de cálculo do {COMPANY.productName} pertencem a <strong>{COMPANY.legalName} (CNPJ {COMPANY.cnpj})</strong> ou a quem os licenciou, e são protegidos pelas leis brasileiras de direito autoral e de propriedade industrial.
                </p>
                <p>
                    Os dados que você registra continuam sendo seus. Nós os usamos apenas para prestar o serviço, como explica a Política de Privacidade.
                </p>
            </>
        ),
    },
    {
        id: 'alteracoes',
        title: 'Alterações destes termos',
        content: (
            <p>
                Podemos atualizar estes Termos quando o serviço ou a lei mudarem. A data da última atualização fica no topo desta página. Mudanças relevantes serão avisadas por e-mail antes de valerem; se você continuar usando o site depois disso, as novas regras passam a valer. Se não concordar, você pode cancelar a assinatura ou excluir a conta.
            </p>
        ),
    },
    {
        id: 'lei-e-foro',
        title: 'Lei aplicável e foro',
        content: (
            <p>
                Estes Termos seguem as leis do Brasil. Qualquer disputa pode ser levada ao foro do domicílio do Usuário, como garante o Código de Defesa do Consumidor, ou ao da sede do titular, se o Usuário preferir.
            </p>
        ),
    },
    {
        id: 'contato',
        title: 'Contato',
        content: (
            <>
                <p>Para dúvidas sobre estes Termos ou pedidos de suporte:</p>
                <dl className="lgl-facts">
                    <div className="is-wide">
                        <dt>Titular</dt>
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
                        <dt>Suporte</dt>
                        <dd><a className="lgl-link" href={`mailto:${CONTACT_EMAILS.suporte}`}>{CONTACT_EMAILS.suporte}</a></dd>
                    </div>
                    <div>
                        <dt>Assuntos gerais e parcerias</dt>
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
]

const SUMMARY = {
    title: 'Em poucas palavras',
    items: [
        {
            icon: Calculator,
            title: 'Os cálculos são estimativas',
            text: 'Ajudam a organizar, mas não substituem um contador.',
        },
        {
            icon: CalendarX2,
            title: 'Cancele quando quiser',
            text: 'O plano continua até o fim do mês pago, sem multa.',
        },
        {
            icon: Undo2,
            title: '7 dias para desistir',
            text: 'Na primeira assinatura, devolvemos todo o valor.',
        },
        {
            icon: KeyRound,
            title: 'A conta é sua e pessoal',
            text: 'Guarde a senha e não empreste a conta.',
        },
    ],
    note: 'Este resumo ajuda na leitura. O que vale é o texto completo abaixo.',
}

const RELATED = [
    { to: '/politica-de-privacidade', icon: ShieldCheck, title: 'Política de privacidade', text: 'Quais dados usamos, para quê e os seus direitos.' },
    { to: '/exclusao-de-dados', icon: Trash2, title: 'Exclusão de dados', text: 'Como apagar a sua conta e tudo o que está nela.' },
    { to: '/contato', icon: MessageSquare, title: 'Fale com a gente', text: 'Dúvidas, suporte e pedidos sobre a sua conta.' },
]

export default function TermsOfService() {
    return (
        <LegalDoc
            title="Termos de serviço"
            intro={`As regras para usar o ${COMPANY.productName}: o que oferecemos, como funcionam os planos e o que cabe a cada um.`}
            updated={LEGAL_LAST_UPDATED}
            summary={SUMMARY}
            entity={(
                <>
                    <span className="lgl-entity__icon" aria-hidden="true"><Building2 size={20} /></span>
                    <div>
                        <h3>Quem oferece o serviço</h3>
                        <p>
                            O <strong>{COMPANY.productName}</strong> pertence e é operado por{' '}
                            <strong>{COMPANY.legalName}</strong>, {COMPANY.legalNature} inscrito no CNPJ sob o{' '}
                            <strong>nº {COMPANY.cnpj}</strong>, com sede em {COMPANY.address}.
                        </p>
                    </div>
                </>
            )}
            sections={SECTIONS}
            related={RELATED}
        />
    )
}
