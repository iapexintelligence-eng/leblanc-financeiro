import AlertasJornada from './AlertasJornada.jsx'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Protegido from './Protegido.jsx'
import Sidebar, { AREA_INICIAL, INICIO, areaDaRota, areasVisiveis, itemDaArea, podeVerRota } from './Sidebar.jsx'
import { authOn } from '../lib/supabase.js'
import { signOut } from '../lib/useAuth.js'
import { useRole } from '../lib/useRole.js'

const TITLES = {
 '/orcamentos':['Comercial','Orçamentos e contratos'],
 '/planilhas-historicas':['Financeiro · Leia','Planilhas históricas'],
 '/pendencias':['Equipe','Pendências e próximos passos'],
 '/revisao-mensal':['Financeiro · Leia','Revisão mensal'],
 '/capacidade-montagem':['Logística · Glauci','Capacidade de montagem'],
 '/planejamento-integrado':['Prévia','CRM, métricas e controle financeiro'],
 '/historico-operacional':['Consulta','Histórico operacional anterior'],
 '/conferencia-financeira':['Financeiro · Leia','Conferência, margens e autorizações'],
 '/jornada':['Operação','Jornada do cliente'],
 '/contratos-todos':['Financeiro · Leia','Contratos'],
 '/medicao':['Setores','Medida técnica'],
 '/fretes':['Logística','Fretes por viagem'],
 '/agenda-operacional':['Logística','Escalas e previsão'],
 '/assistencias-operacionais':['Pós-venda','Prazos de assistências'],
  '/': ['Início', 'Visão Geral'],
  '/vendas-historico': ['Consulta', 'Histórico de vendas'],
  '/vendas': ['Setores', 'Vendas'],
  '/novo-contrato': ['Operação', 'Novo Contrato'],
  '/contratos': ['Operação', 'Emitir Contrato'],
  '/simulador': ['Operação', 'Simulador de Pagamento'],
  '/acompanhamento': ['Operação', 'Acompanhamento'],
  '/projetos': ['Operação', 'Projetos'],
  '/recebiveis': ['Financeiro · Leia', 'Recebimentos'],
  '/previsibilidade': ['Financeiro · Leia', 'Previsibilidade'],
  '/previsibilidade-montagens': ['Operação', 'Previsibilidade de montagens'],
  '/correcao': ['Setores', 'Correção'],
  '/liberacao': ['Setores', 'Liberação'],
  '/montagem': ['Setores', 'Montagem'],
  '/qualidade': ['Setores', 'Qualidade'],
  '/agenda': ['Setores', 'Agenda da loja'],
  '/custos': ['Financeiro', 'Custos Operacionais'],
  '/pagamentos': ['Financeiro', 'Pagamentos'],
  '/saidas': ['Financeiro', 'Saídas'],
  '/contas-fixas': ['Financeiro', 'Contas Fixas Mensais'],
  '/vincular': ['Financeiro', 'Vincular gastos a contratos'],
  '/dre': ['Financeiro', 'DRE Mensal'],
  '/bancos': ['Financeiro', 'Bancos'],
  '/pro-labore': ['Financeiro', 'Pró-labore'],
  '/faturas-cartao': ['Financeiro', 'Faturas de cartão'],
  '/gratificacao': ['Financeiro', 'Gratificação'],
  '/assistencias': ['Pós-venda', 'Assistências'],
  '/aot': ['Pós-venda', 'AOT'],
  '/funcionarios': ['Cadastros', 'Funcionários'],
  '/usuarios': ['Cadastros', 'Usuários & Acessos'],
  '/relatorios': ['Análise', 'Relatórios'],
}

const PAPEL_TXT = { medidor: 'Medida técnica', logistica: 'Logística', financeiro: 'Financeiro', gestor: 'Gestão', montador: 'Montador', administrativo: 'Administrativo', diretoria: 'Diretoria', correcao: 'Correção', montagem: 'Montagem', qualidade: 'Qualidade', vendedor: 'Vendedor' }

const lerArea = () => { try { return localStorage.getItem('lb-area') || '' } catch { return '' } }
const gravarArea = (id) => { try { localStorage.setItem('lb-area', id) } catch { /* sem armazenamento: só não lembra a aba */ } }

export default function Layout() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const noCRM = ['/orcamentos','contratos','/contratos'].includes(pathname) && new URLSearchParams(search).get('crm')==='1'
  const role = useRole()
  const areas = useMemo(() => areasVisiveis(role.papel), [role.papel])
  const [escolhida, setEscolhida] = useState(lerArea)
  const areaId = areaDaRota(areas, pathname, escolhida || AREA_INICIAL[role.papel], role.papel)
  const area = areas.find((a) => a.id === areaId)
  useEffect(() => { if (areaId && areaId !== escolhida) { setEscolhida(areaId); gravarArea(areaId) } }, [areaId, escolhida])
  const abrirArea = (a) => { setEscolhida(a.id); gravarArea(a.id); navigate(a.grupos[0].itens[0].to) }
  const doMenu = itemDaArea(area, pathname)
  const [crumb0, title0] = TITLES[pathname] || ['', '']
  const crumb = doMenu ? `${area.label} · ${area.quem}` : crumb0
  const title = doMenu && !doMenu.to.includes('?') ? doMenu.txt : title0
  const iniciais = (role.nome || 'LB').slice(0, 2).toUpperCase()
  // Cada setor abre na sua aba e não entra nas telas financeiras pela barra de endereço.
  if (authOn && !role.loading && role.papel && !podeVerRota(pathname, role.papel)) {
    const destino = INICIO[role.papel] || '/pendencias'
    if (destino !== pathname) return <Navigate to={destino} replace />
  }
  return (
    <div className="app">
      {!noCRM && <Sidebar area={area} />}
      <div className="main">
        <div className="topo">
          {!noCRM && areas.length > 1 && (
            <nav className="areas" aria-label="Áreas do sistema">
              {areas.map((a) => (
                <button key={a.id} type="button" className={'area-tab' + (a.id === areaId ? ' active' : '')} aria-current={a.id === areaId ? 'page' : undefined} onClick={() => abrirArea(a)}>
                  {a.label}<small>{a.quem}</small>
                </button>
              ))}
            </nav>
          )}
          <header className="topbar">
            <div>
              <div className="crumb">{crumb}</div>
              <h2>{title}</h2>
            </div>
            <div className="right">
              <span className="pill">{role.nome || 'Le Blanc'}{role.papel ? ` · ${PAPEL_TXT[role.papel] || role.papel}` : ''}</span>
              <div className="avatar" title={role.email}>{iniciais}</div>
              {authOn && (
                <button className="icon-btn" onClick={signOut} title="Sair">Sair</button>
              )}
            </div>
          </header>
        </div>
        <main className="content"><AlertasJornada /><Protegido nome={title || 'Tela'} chave={pathname}><Outlet /></Protegido></main>
      </div>
    </div>
  )
}
