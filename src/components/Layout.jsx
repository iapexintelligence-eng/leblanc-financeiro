import AlertasJornada from './AlertasJornada.jsx'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import { authOn } from '../lib/supabase.js'
import { signOut } from '../lib/useAuth.js'
import { useRole } from '../lib/useRole.js'

const TITLES = {
 '/planilhas-historicas':['Financeiro · Leia','Planilhas históricas'],
 '/pendencias':['Equipe','Pendências e próximos passos'],
 '/revisao-mensal':['Financeiro · Leia','Revisão mensal'],
 '/capacidade-montagem':['Logística · Glauci','Capacidade de montagem'],
 '/planejamento-integrado':['Prévia','CRM, métricas e controle financeiro'],
 '/historico-operacional':['Consulta','Histórico operacional anterior'],
 '/conferencia-financeira':['Financeiro · Leia','Conferência, margens e autorizações'],
 '/jornada':['Operação','Jornada do cliente'],
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

const PAPEL_TXT = { administrativo: 'Administrativo', diretoria: 'Diretoria', correcao: 'Correção', montagem: 'Montagem', qualidade: 'Qualidade', vendedor: 'Vendedor' }

export default function Layout() {
  const { pathname } = useLocation()
  const [crumb, title] = TITLES[pathname] || ['', '']
  const role = useRole()
  const iniciais = (role.nome || 'LB').slice(0, 2).toUpperCase()
  return (
    <div className="app">
      <Sidebar papel={role.papel} />
      <div className="main">
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
        <main className="content"><AlertasJornada /><Outlet /></main>
      </div>
    </div>
  )
}
