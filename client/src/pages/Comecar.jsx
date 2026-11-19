import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    ShieldCheck, Check, Calculator, Scale, Wallet, ArrowLeftRight, FileText, CalendarClock,
    CreditCard, Tags, BellRing, FileDown, MessageSquareText, Mic, Lock, Trash2,
    CircleCheck, ChevronDown, Landmark, Smartphone
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BrandMark from '../components/ui/BrandMark'
import PhoneDemo from '../components/landing/PhoneDemo'
import InvoiceDemo from '../components/landing/InvoiceDemo'
import { FEATURE_LABELS, sortPlans, formatBRL } from '../components/plans/planFeatures'
import { COMPANY, CONTACT_EMAILS } from '../utils/legalInfo'
import { pixelConfigured, reopenConsent } from '../utils/metaPixel'
import './Comecar.css'

/**
 * Página de campanha (anúncios no Instagram e no Facebook): /comecar.
 * Fora do menu do site, um caminho só (criar conta grátis). Planos, preços e o que
 * cada um libera vêm de /api/plans (o que o admin decide), nunca escritos aqui.
 */

const LAW = { 2026: 81000, 2027: 110000, 2028: 140000 }
const lawLimit = (year) => (year >= 2028 ? LAW[2028] : year === 2027 ? LAW[2027] : LAW[2026])
const thisYear = () => Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 4))
const brl0 = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const thousand = (v) => `R$ ${(Number(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
const pct = (p) => `${p.toLocaleString('pt-BR', { maximumFractionDigits: p < 10 ? 1 : 0 })}%`

/** "Nos planos Prata e Ouro", "No plano Ouro", "Em todos os planos" (ou null) */
function planNoteFor(plans) {
    return (key) => {
        if (!plans?.length) return null
        const names = plans.filter(p => p.features?.[key]).map(p => p.name)
        if (!names.length) return null
        if (names.length === plans.length) return 'Em todos os planos, inclusive o Gratuito'
        if (names.length === 1) return `No plano ${names[0]}`
        return `Nos planos ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
    }
}

const ALL_FEATURES = [
    { icon: MessageSquareText, title: 'Assistente no WhatsApp', text: 'Receitas, despesas e contas por mensagem, com confirmação antes de gravar. Dá para ligar mais de um número à conta.', key: 'whatsapp' },
    { icon: Mic, title: 'Áudio, foto e PDF', text: 'Mande áudio, foto do boleto ou do comprovante, ou o PDF, e a IA lê para você.', key: 'whatsapp_midia' },
    { icon: FileText, title: 'Leitura de faturas com IA', text: 'O PDF da fatura do cartão vira a lista de compras, com categoria sugerida.', key: 'upload_faturas' },
    { icon: CalendarClock, title: 'Contas a pagar', text: 'Boletos com vencimento e lembrete no WhatsApp às 8h do dia.', key: 'contas_pagar' },
    { icon: BellRing, title: 'Alertas do MEI', text: 'Aviso perto do limite do ano, antes do DAS e na época da declaração anual.', key: 'alertas' },
    { icon: Calculator, title: 'Simulador do DAS', text: 'Quanto você paga por mês e o custo de ter um funcionário.' },
    { icon: Scale, title: 'Comparativo MEI x Microempresa', text: 'Quanto pagaria de imposto se passasse a Microempresa.', key: 'comparativo' },
    { icon: Wallet, title: 'MEI e casa separados', text: 'Carteiras do MEI e pessoais, cada uma com o seu saldo.', key: 'multi_carteiras' },
    { icon: ArrowLeftRight, title: 'Transferência entre carteiras', text: 'Tirou do MEI para a casa? Fica registrado dos dois lados.', key: 'transferencias' },
    { icon: CreditCard, title: 'Cartões de crédito', text: 'Faturas por mês, limite usado e gasto por categoria.', key: 'cartoes' },
    { icon: Tags, title: 'Categorias suas', text: 'Crie as categorias do seu negócio e veja onde o dinheiro vai.', key: 'categorias' },
    { icon: FileDown, title: 'Relatórios em PDF', text: 'Painel e contas a pagar para guardar ou mandar ao contador.', key: 'pdf' }
]

const FAQ = [
    {
        q: 'Preciso de cartão de crédito para criar a conta?',
        a: (note, trial) => trial
            ? `Não. A conta nova começa com ${trial.days} dias do plano ${trial.planName}, sem cartão. No fim, ela volta sozinha ao Gratuito, que não tem mensalidade. Você só informa um cartão se decidir assinar.`
            : 'Não. O plano Gratuito não tem mensalidade e não pede cartão. Você só informa um cartão se decidir assinar um plano pago.'
    },
    {
        q: 'Como funciona o teste grátis?',
        trialOnly: true,
        a: (note, trial) => `Ao criar a conta, você usa o plano ${trial.planName} por ${trial.days} dias, com o WhatsApp e tudo o que ele libera. O teste começa quando você confirma o e-mail. Nada é cobrado: no fim, a conta volta ao Gratuito com os seus dados, e você assina só se quiser. É um teste por e-mail e por aparelho.`
    },
    {
        q: 'O assistente grava alguma coisa sem eu ver?',
        a: () => 'Não. Antes de gravar, ele mostra o resumo (valor, carteira, forma de pagamento e categoria) e espera você tocar em Confirmar. Se algo estiver errado, toque em Cancelar.'
    },
    {
        q: 'Em quais planos está o WhatsApp?',
        a: (note) => {
            const text = note('whatsapp')
            const media = note('whatsapp_midia')
            if (!text) return 'Veja na tabela de planos o que cada um libera.'
            return `${text}, você lança por mensagem de texto.${media ? ` Áudio, foto e PDF: ${media.charAt(0).toLowerCase()}${media.slice(1)}.` : ''}`
        }
    },
    {
        q: 'Como eu ligo o meu WhatsApp?',
        a: () => 'Depois de criar a conta, entre em Minha conta, toque em Conectar na parte do WhatsApp e mande para o número do EuSempreMEI a mensagem com o código que aparece. Para desligar o lembrete diário, mande PARAR; para desconectar o número, mande DESVINCULAR.'
    },
    {
        q: 'Posso cancelar quando quiser?',
        a: () => 'Sim, em Minha conta, sem multa. O plano continua até o fim do mês já pago e depois volta ao Gratuito, sem perder os seus dados. Na primeira assinatura, você pode desistir em até 7 dias e receber todo o valor de volta (art. 49 do Código de Defesa do Consumidor).'
    },
    {
        q: 'O EuSempreMEI é do governo? Ele paga o meu DAS?',
        a: () => 'Não. É um serviço particular. Ele calcula, mostra e lembra o DAS, mas a guia continua sendo emitida e paga no Portal do Empreendedor, no gov.br.'
    },
    {
        q: 'Substitui o contador?',
        a: () => 'Não. Ele organiza o dia a dia do MEI. Para mudar de enquadramento, abrir uma Microempresa ou decidir sobre impostos, converse com um contador.'
    },
    {
        q: 'Quem lê as minhas mensagens e faturas?',
        a: () => 'Uma IA lê o texto, o áudio ou o arquivo só para montar o lançamento. Os seus dados não são vendidos nem usados para propaganda. A Política de Privacidade explica tudo, e você pode excluir a conta e os dados quando quiser.'
    },
    {
        q: 'Funciona no celular?',
        a: () => 'Sim. O site abre no navegador do celular, sem instalar nada, e o assistente funciona no próprio WhatsApp.'
    }
]

export default function Comecar() {
    const { user } = useAuth()
    const year = thisYear()
    const [plans, setPlans] = useState(null)
    const [plansFailed, setPlansFailed] = useState(false)
    const [limits, setLimits] = useState({ current: lawLimit(year), next: lawLimit(year + 1) })
    const [dasValue, setDasValue] = useState(undefined)
    const [trial, setTrial] = useState(null)
    const [monthly, setMonthly] = useState(6000)
    const [showBar, setShowBar] = useState(false)
    const heroCta = useRef(null)
    const endRef = useRef(null)

    // Página de anúncio: fora do Google e com título próprio
    useEffect(() => {
        const meta = document.createElement('meta')
        meta.name = 'robots'
        meta.content = 'noindex, follow'
        document.head.appendChild(meta)
        const title = document.title
        document.title = 'EuSempreMEI: o MEI organizado pelo WhatsApp'
        window.scrollTo(0, 0)
        return () => { meta.remove(); document.title = title }
    }, [])

    useEffect(() => {
        let alive = true
        fetch('/api/plans')
            .then(r => (r.ok ? r.json() : Promise.reject()))
            .then(data => { if (alive) setPlans(sortPlans(Array.isArray(data) ? data : [])) })
            .catch(() => { if (alive) setPlansFailed(true) })
        fetch('/api/simulate/limits')
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (!alive || !data) return
                const cur = Number(data.current?.annualLimit), nxt = Number(data.next?.annualLimit)
                setLimits(l => ({ current: cur > 0 ? cur : l.current, next: nxt > 0 ? nxt : l.next }))
            })
            .catch(() => {})
        fetch('/api/plans/trial')
            .then(r => (r.ok ? r.json() : null))
            .then(data => { if (alive && data?.enabled) setTrial(data) })
            .catch(() => {})
        fetch('/api/simulate/info')
            .then(r => (r.ok ? r.json() : null))
            .then(data => { const v = Number(data?.das?.comercio); if (alive && v > 0) setDasValue(v) })
            .catch(() => {})
        return () => { alive = false }
    }, [])

    // Botão preso embaixo no celular: aparece depois que o botão do topo sai da tela
    // e some quando o convite do fim aparece
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return
        const seen = new Map()
        const io = new IntersectionObserver((entries) => {
            entries.forEach(e => seen.set(e.target, e.isIntersecting))
            const heroVisible = seen.get(heroCta.current)
            const endVisible = seen.get(endRef.current)
            const heroAbove = heroCta.current && heroCta.current.getBoundingClientRect().bottom < 0
            setShowBar(!heroVisible && !endVisible && heroAbove)
        })
        if (heroCta.current) io.observe(heroCta.current)
        if (endRef.current) io.observe(endRef.current)
        return () => io.disconnect()
    }, [])

    const note = useMemo(() => planNoteFor(plans), [plans])
    const freePlan = plans?.find(p => Number(p.price) === 0)
    const paidWithWhatsapp = plans?.filter(p => Number(p.price) > 0 && p.features?.whatsapp) || []

    const cta = user
        ? { to: '/dashboard', label: 'Ir para o Painel' }
        : { to: '/cadastro', label: trial ? `Testar grátis por ${trial.days} dias` : 'Criar conta grátis' }
    // O Criar conta lê o plano escolhido antes (sessionStorage): aqui é sempre o Gratuito
    const startFree = () => { try { sessionStorage.removeItem('selectedPlanId') } catch { /* sem sessionStorage */ } }

    const annual = monthly * 12
    const used = (annual / limits.current) * 100
    const usedNext = (annual / limits.next) * 100
    const status = used > 100 ? 'over' : used >= 80 ? 'near' : 'ok'

    return (
        <div className="lp">
            <header className="lp-top">
                <div className="lp-wrap lp-top__row">
                    <Link to="/" className="lp-brand" aria-label="EuSempreMEI, página inicial">
                        <BrandMark size={26} /> <span>EuSempreMEI</span>
                    </Link>
                    {user
                        ? <Link to="/dashboard" className="lp-top__link">Ir para o Painel</Link>
                        : <Link to="/login" className="lp-top__link">Entrar</Link>}
                </div>
            </header>

            <main>
                {/* Topo: o que o produto faz, mostrado funcionando */}
                <section className="lp-hero" aria-labelledby="lp-title">
                    <div className="lp-wrap lp-hero__grid">
                        <div className="lp-hero__text">
                            <h1 id="lp-title" className="lp-title">Mandou no WhatsApp, entrou no Extrato.</h1>
                            <p className="lp-lead">
                                O EuSempreMEI organiza o dinheiro do MEI e o da casa. Você escreve, manda um
                                áudio ou a foto do boleto; a IA monta o lançamento e pede a sua confirmação
                                antes de gravar.
                            </p>
                            <div className="lp-actions" ref={heroCta}>
                                <Link to={cta.to} onClick={startFree} className="lp-btn lp-btn--primary">{cta.label}</Link>
                                <a href="#planos" className="lp-btn">Ver os planos</a>
                            </div>
                            {!user && (
                                <p className="lp-trust">
                                    <ShieldCheck size={16} aria-hidden="true" />
                                    {trial ? (
                                        <span>
                                            {trial.days} dias do plano {trial.planName} grátis, sem cartão de crédito. No fim, a conta
                                            volta sozinha ao Gratuito, sem cobrança.
                                            {paidWithWhatsapp.length > 0 && <> Depois do teste, o WhatsApp fica {paidWithWhatsapp.length === 1 ? `no plano ${paidWithWhatsapp[0].name}` : `nos planos ${paidWithWhatsapp.map(p => p.name).join(' e ')}`}.</>}
                                        </span>
                                    ) : (
                                        <span>
                                            Plano Gratuito sem mensalidade e sem cartão de crédito.
                                            {paidWithWhatsapp.length > 0 && <> O assistente do WhatsApp está {paidWithWhatsapp.length === 1 ? `no plano ${paidWithWhatsapp[0].name}` : `nos planos ${paidWithWhatsapp.map(p => p.name).join(' e ')}`}.</>}
                                        </span>
                                    )}
                                </p>
                            )}
                        </div>
                        <PhoneDemo dasValue={dasValue} planNote={note} />
                    </div>
                </section>

                {/* Como começar: é uma sequência de verdade */}
                <section className="lp-section" aria-labelledby="lp-steps-title">
                    <div className="lp-wrap">
                        <h2 id="lp-steps-title" className="lp-h2">Três passos para começar</h2>
                        <ol className="lp-steps">
                            <li>
                                <h3>Crie a conta grátis</h3>
                                <p>
                                    Nome, e-mail e senha. Depois, cadastre a carteira do MEI e a da casa.
                                    {trial && ` Os primeiros ${trial.days} dias são no plano ${trial.planName}.`}
                                </p>
                            </li>
                            <li>
                                <h3>Conecte o seu WhatsApp</h3>
                                <p>Em Minha conta, toque em Conectar e mande o código que aparecer para o número do EuSempreMEI.</p>
                            </li>
                            <li>
                                <h3>Mande a primeira mensagem</h3>
                                <p>“vendi 80 no pix”. O assistente mostra o resumo, você confirma e pronto.</p>
                            </li>
                        </ol>
                    </div>
                </section>

                {/* Fatura do cartão lida pela IA */}
                <section className="lp-section lp-section--paper" aria-labelledby="lp-inv-title">
                    <div className="lp-wrap lp-split">
                        <div className="lp-split__text">
                            <h2 id="lp-inv-title" className="lp-h2">A fatura do cartão vira lançamentos</h2>
                            <p className="lp-lead lp-lead--sm">
                                Envie o PDF da fatura. A IA separa cada compra e sugere a categoria. Você confere,
                                troca o que quiser e confirma.
                            </p>
                            <ul className="lp-checks">
                                <li><Check size={18} aria-hidden="true" /> Parcelas reconhecidas, com a categoria da parcela anterior</li>
                                <li><Check size={18} aria-hidden="true" /> IOF, multa e juros separados das compras</li>
                                <li><Check size={18} aria-hidden="true" /> Estorno desconta do total, como no banco</li>
                                <li><Check size={18} aria-hidden="true" /> Compra que já estava lançada não entra duas vezes</li>
                            </ul>
                            {note('upload_faturas') && <p className="lp-plan-note">{note('upload_faturas')}</p>}
                        </div>
                        <InvoiceDemo />
                    </div>
                </section>

                {/* Limite do MEI: a pessoa mexe e vê */}
                <section className="lp-section" aria-labelledby="lp-limit-title">
                    <div className="lp-wrap lp-split lp-split--limit">
                        <div className="lp-split__text">
                            <h2 id="lp-limit-title" className="lp-h2">Quanto do limite do MEI você já usou?</h2>
                            <p className="lp-lead lp-lead--sm">
                                Passar do limite de faturamento pode tirar você do MEI. O EuSempreMEI soma as receitas
                                do ano e avisa antes, no site e no WhatsApp.
                            </p>
                            <ul className="lp-checks">
                                <li><Check size={18} aria-hidden="true" /> Aviso quando chegar perto do limite (você escolhe a porcentagem)</li>
                                <li><Check size={18} aria-hidden="true" /> Lembrete do DAS antes do dia 20</li>
                                <li><Check size={18} aria-hidden="true" /> Lembrete da declaração anual do MEI</li>
                            </ul>
                        </div>

                        <div className="lp-meter">
                            <label className="lp-meter__label" htmlFor="lp-range">
                                Entra no MEI por mês <output htmlFor="lp-range">{brl0(monthly)}</output>
                            </label>
                            <input
                                id="lp-range"
                                className="lp-range"
                                type="range"
                                min="0"
                                max="15000"
                                step="250"
                                value={monthly}
                                onChange={(e) => setMonthly(Number(e.target.value))}
                                aria-valuetext={`${brl0(monthly)} por mês`}
                            />
                            <div className="lp-meter__result" aria-live="polite">
                                <p className="lp-meter__big">{pct(used)}</p>
                                <p className="lp-meter__cap">do limite de {year} ({thousand(limits.current)}), com {brl0(annual)} no ano</p>
                                <div className="lp-bar" role="img" aria-label={`${pct(used)} do limite de ${year}`}>
                                    <i className={`is-${status}`} style={{ width: `${Math.min(100, used)}%` }} />
                                    <span className="lp-bar__mark" style={{ left: '80%' }} />
                                </div>
                                <p className={`lp-meter__note is-${status}`}>
                                    {status === 'over'
                                        ? `Passa ${brl0(annual - limits.current)} do limite do ano.`
                                        : status === 'near'
                                            ? `Perto do limite: o alerta de 80% já teria avisado.`
                                            : `Ainda cabem ${brl0(limits.current - annual)} no ano.`}
                                </p>
                                <p className="lp-meter__next">
                                    Em {year + 1} o limite passa a {thousand(limits.next)} (Lei Complementar 238/2026): o mesmo valor usaria {pct(usedNext)}.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Tudo o que existe no site */}
                <section className="lp-section lp-section--paper" aria-labelledby="lp-all-title">
                    <div className="lp-wrap">
                        <h2 id="lp-all-title" className="lp-h2">Tudo o que vem junto</h2>
                        <p className="lp-lead lp-lead--sm">O que cada plano libera aparece na tabela logo abaixo.</p>
                        <ul className="lp-feats">
                            {ALL_FEATURES.map(({ icon: Icon, title, text, key }) => {
                                const onlyPaid = key && freePlan && !freePlan.features?.[key]
                                return (
                                    <li key={title} className="lp-feat">
                                        <span className="lp-feat__icon" aria-hidden="true"><Icon size={20} /></span>
                                        <h3>{title}</h3>
                                        <p>{text}</p>
                                        {onlyPaid && <span className="lp-feat__tag">Planos pagos</span>}
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                </section>

                {/* Planos: do servidor */}
                <section className="lp-section" id="planos" aria-labelledby="lp-plans-title">
                    <div className="lp-wrap">
                        <h2 id="lp-plans-title" className="lp-h2">Comece grátis. Assine quando fizer sentido.</h2>
                        <p className="lp-lead lp-lead--sm">
                            No Gratuito você organiza o MEI sem pagar nada. Os planos pagos trazem o assistente do
                            WhatsApp, a leitura de faturas e os lembretes.
                            {trial && ` Toda conta nova testa o ${trial.planName} por ${trial.days} dias, sem cartão.`}
                        </p>
                        <Plans plans={plans} failed={plansFailed} user={user} startFree={startFree} trial={trial} />
                        <p className="lp-fine">
                            Preços por mês, renovados sozinhos até você cancelar em Minha conta. Na primeira assinatura,
                            você pode desistir em até 7 dias e receber todo o valor de volta.
                        </p>
                    </div>
                </section>

                {/* Confiança */}
                <section className="lp-section lp-section--paper" aria-labelledby="lp-trust-title">
                    <div className="lp-wrap">
                        <h2 id="lp-trust-title" className="lp-h2">Os seus dados continuam seus</h2>
                        <ul className="lp-trustgrid">
                            <li><CircleCheck size={20} aria-hidden="true" /><div><h3>Nada é gravado sem você confirmar</h3><p>Todo lançamento pelo WhatsApp passa pelo resumo com Confirmar e Cancelar.</p></div></li>
                            <li><Lock size={20} aria-hidden="true" /><div><h3>Conta protegida</h3><p>Senha conferida contra listas de senhas vazadas e trava depois de várias tentativas erradas.</p></div></li>
                            <li><ShieldCheck size={20} aria-hidden="true" /><div><h3>Sem venda de dados</h3><p>Nada é vendido nem alugado, e o tratamento dos dados segue a LGPD.</p></div></li>
                            <li><Trash2 size={20} aria-hidden="true" /><div><h3>Saia quando quiser</h3><p>Exclua a conta e os dados em Minha conta, a qualquer momento.</p></div></li>
                        </ul>
                    </div>
                </section>

                {/* Perguntas */}
                <section className="lp-section" aria-labelledby="lp-faq-title">
                    <div className="lp-wrap lp-faq-wrap">
                        <h2 id="lp-faq-title" className="lp-h2">Perguntas frequentes</h2>
                        <div className="lp-faq">
                            {FAQ.filter(item => !item.trialOnly || trial).map(item => (
                                <details key={item.q}>
                                    <summary>{item.q}<ChevronDown size={20} aria-hidden="true" /></summary>
                                    <p>{item.a(note, trial)}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Fim */}
                <section className="lp-section lp-section--last" ref={endRef}>
                    <div className="lp-wrap">
                        <div className="lp-end">
                            <h2 className="lp-h2">{trial ? `Teste o ${trial.planName} por ${trial.days} dias` : 'Comece pelo plano Gratuito'}</h2>
                            <p className="lp-lead lp-lead--sm">
                                {trial
                                    ? 'Crie a conta, conecte o WhatsApp e lance a primeira venda hoje. Sem cartão e sem cobrança no fim.'
                                    : 'Crie a conta, cadastre a carteira do MEI e lance a primeira venda hoje.'}
                            </p>
                            <Link to={cta.to} onClick={startFree} className="lp-btn lp-btn--primary">{cta.label}</Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="lp-foot">
                <div className="lp-wrap">
                    <nav className="lp-foot__links" aria-label="Documentos e contato">
                        <Link to="/termos-de-servico">Termos de Serviço</Link>
                        <Link to="/politica-de-privacidade">Política de Privacidade</Link>
                        <Link to="/exclusao-de-dados">Exclusão de dados</Link>
                        <Link to="/contato">Contato</Link>
                        {pixelConfigured && <button type="button" onClick={reopenConsent}>Cookies</button>}
                    </nav>
                    <p>
                        {COMPANY.productName} é um produto de {COMPANY.legalName}, CNPJ {COMPANY.cnpj}.
                        {' '}{COMPANY.address}. {CONTACT_EMAILS.contato}
                    </p>
                    <p className="lp-foot__note">
                        <Landmark size={14} aria-hidden="true" /> Serviço particular, sem ligação com o governo. O DAS é emitido e pago no Portal do Empreendedor.
                    </p>
                    <p className="lp-foot__note">
                        <Smartphone size={14} aria-hidden="true" /> WhatsApp, Instagram e Facebook são marcas da Meta Platforms, Inc. O EuSempreMEI não é afiliado à Meta nem patrocinado por ela.
                    </p>
                    <p className="lp-foot__note">As conversas e telas desta página são exemplos, com nomes e valores inventados.</p>
                </div>
            </footer>

            {!user && (
                <div className={`lp-stick ${showBar ? 'is-on' : ''}`} aria-hidden={!showBar}>
                    <Link to="/cadastro" onClick={startFree} className="lp-btn lp-btn--primary" tabIndex={showBar ? 0 : -1}>{cta.label}</Link>
                </div>
            )}
        </div>
    )
}

function Plans({ plans, failed, user, startFree, trial }) {
    if (failed) {
        return <p className="lp-lead lp-lead--sm"><Link to="/planos" className="lp-link">Ver os planos e preços</Link></p>
    }
    if (!plans) {
        return <div className="lp-plans" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="lp-plan lp-plan--skeleton" />)}</div>
    }

    const has = (plan) => FEATURE_LABELS.filter(([key]) => plan.features?.[key])
    return (
        <div className="lp-plans">
            {plans.map((plan, i) => {
                const free = Number(plan.price) === 0
                const prev = i > 0 ? plans[i - 1] : null
                const prevKeys = new Set(prev ? has(prev).map(([k]) => k) : [])
                const extra = has(plan).filter(([k]) => !prevKeys.has(k))
                const top = i === plans.length - 1 && plans.length > 1
                // O plano do teste: o botão cria a conta com o teste (assinar fica para depois, em Planos)
                const isTrialPlan = !user && !!trial && Number(plan.id) === trial.planId
                const to = user ? '/planos' : (free || isTrialPlan) ? '/cadastro' : `/cadastro?planId=${plan.id}`
                return (
                    <article key={plan.id} className={`lp-plan ${free ? 'is-free' : ''} ${top ? 'is-top' : ''}`}>
                        <div className="lp-plan__head">
                            <h3>{plan.name}</h3>
                            {top && <span className="lp-plan__tag">Mais completo</span>}
                        </div>
                        <p className="lp-plan__price">
                            {free ? <>R$ 0<small> sem mensalidade</small></> : <>{formatBRL(plan.price)}<small> por mês</small></>}
                        </p>
                        {free && trial && !user && <p className="lp-plan__trial">Começa com {trial.days} dias do {trial.planName}, sem cartão</p>}
                        {isTrialPlan && <p className="lp-plan__trial">Teste grátis de {trial.days} dias na conta nova</p>}
                        {prev && extra.length > 0 && <p className="lp-plan__from">Tudo do {prev.name}, mais:</p>}
                        <ul>
                            {free && <li><Check size={16} aria-hidden="true" /> Extrato e Painel do MEI e da casa</li>}
                            {free && <li><Check size={16} aria-hidden="true" /> Simulador do DAS e do limite</li>}
                            {(prev ? extra : has(plan)).map(([key, label]) => (
                                <li key={key}><Check size={16} aria-hidden="true" /> {label}</li>
                            ))}
                        </ul>
                        <Link
                            to={to}
                            onClick={free || isTrialPlan ? startFree : undefined}
                            className={`lp-btn ${free ? 'lp-btn--primary' : ''} lp-plan__btn`}
                        >
                            {user ? 'Ver na página de planos' : free ? 'Criar conta grátis' : isTrialPlan ? `Testar ${trial.days} dias grátis` : `Assinar ${plan.name}`}
                        </Link>
                    </article>
                )
            })}
        </div>
    )
}
