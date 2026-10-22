import { NavLink } from 'react-router-dom'
import { podeTudo } from '../lib/useRole.js'
import {
  IcoHome, IcoSales, IcoProject, IcoReceive, IcoForecast, IcoCost,
  IcoPay, IcoDre, IcoBank, IcoGift, IcoTool, IcoPeople, IcoReport,
} from './Icons.jsx'

// Cada rota tem UMA regra de acesso (papéis que veem, além de administrativo/diretoria/gestão/financeiro, que veem tudo).
// sem roles = só quem vê tudo. As abas do topo só organizam o menu; não mudam quem pode abrir o quê.
const ROTAS = {
 '/pendencias':{icon:IcoProject,txt:'Pendências',roles:['medidor','vendedor','correcao','logistica','financeiro','gestor']},
 '/':{icon:IcoHome,txt:'Visão Geral',end:true},
 '/jornada':{icon:IcoProject,txt:'Jornada do cliente',roles:['medidor','vendedor','correcao','logistica','financeiro','gestor','qualidade']},
 '/orcamentos':{icon:IcoSales,txt:'Orçamentos e contratos',roles:['vendedor','financeiro','gestor']},
 '/contratos-todos':{icon:IcoReport,txt:'Contratos (comercial e importados)',roles:['financeiro','gestor']},
 '/vendas':{icon:IcoSales,txt:'Vendas',roles:['vendedor']},
 '/medicao':{icon:IcoTool,txt:'Medida técnica',roles:['medidor','correcao']},
 '/correcao':{icon:IcoTool,txt:'Correção',roles:['correcao']},
 '/liberacao':{icon:IcoProject,txt:'Liberação',roles:['correcao','logistica']},
 '/previsibilidade-montagens':{icon:IcoForecast,txt:'Previsibilidade de montagens',roles:['logistica','gestor','financeiro','correcao']},
 '/capacidade-montagem':{icon:IcoPeople,txt:'Capacidade de montagem',roles:['logistica','gestor']},
 '/montagem':{icon:IcoTool,txt:'Quadro de pós-venda',roles:['logistica','montagem','montador']},
 '/qualidade':{icon:IcoTool,txt:'Entrega técnica e qualidade',roles:['logistica','qualidade']},
 '/assistencias-operacionais':{icon:IcoTool,txt:'Assistências',roles:['logistica','qualidade']},
 '/agenda-operacional':{icon:IcoProject,txt:'Escalas e previsão',roles:['logistica','montagem']},
 '/agenda':{icon:IcoProject,txt:'Agenda da loja',roles:['logistica','montagem']},
 '/fretes':{icon:IcoCost,txt:'Fretes por viagem',roles:['logistica']},
 '/planilhas-historicas':{icon:IcoReport,txt:'Planilhas históricas',roles:['financeiro','gestor']},
 '/revisao-mensal':{icon:IcoDre,txt:'Revisão mensal'},
 '/conferencia-financeira':{icon:IcoPay,txt:'Conferência, margens e autorizações'},
 '/recebiveis':{icon:IcoReceive,txt:'Recebimentos'},
 '/pagamentos':{icon:IcoPay,txt:'Pagamentos'},
 '/custos':{icon:IcoCost,txt:'Custos operacionais'},
 '/saidas':{icon:IcoPay,txt:'Saídas'},
 '/contas-fixas':{icon:IcoPay,txt:'Contas fixas mensais'},
 '/vincular':{icon:IcoProject,txt:'Gastos por contrato'},
 '/dre':{icon:IcoDre,txt:'DRE mensal'},
 '/previsibilidade':{icon:IcoForecast,txt:'Previsibilidade financeira'},
 '/bancos':{icon:IcoBank,txt:'Bancos'},
 '/pro-labore':{icon:IcoPay,txt:'Pró-labore'},
 '/faturas-cartao':{icon:IcoBank,txt:'Faturas de cartão'},
 '/gratificacao':{icon:IcoGift,txt:'Gratificação'},
 '/planejamento-integrado':{icon:IcoReport,txt:'Prévia da integração'},
 '/historico-operacional':{icon:IcoReport,txt:'Histórico operacional'},
 '/projetos':{icon:IcoProject,txt:'Projetos anteriores'},
 '/funcionarios':{icon:IcoPeople,txt:'Funcionários'},
 '/usuarios':{icon:IcoPeople,txt:'Usuários e acessos'},
 '/relatorios':{icon:IcoReport,txt:'Relatórios'},
}

// Abas do topo: tudo o que cada pessoa usa fica junto, mesmo que a tela se repita em outra aba.
// papeis = quem vê a aba (quem vê tudo vê todas). Item = caminho, ou [caminho, nome nesta aba]. Pendências já abre filtrada pela equipe da aba.
export const AREAS = [
 {id:'financeiro',label:'Financeiro',quem:'Léia',papeis:['financeiro'],grupos:[
  {label:'Dia a dia',itens:[['/pendencias?equipe=financeiro','Minhas pendências'],'/jornada','/contratos-todos',['/previsibilidade-montagens','Saldos e montagens'],'/recebiveis','/pagamentos','/faturas-cartao','/saidas','/contas-fixas','/custos','/vincular','/bancos']},
  {label:'Conferência e fechamento',itens:['/conferencia-financeira','/revisao-mensal','/dre','/previsibilidade','/orcamentos','/planilhas-historicas','/pro-labore','/gratificacao']},
 ]},
 {id:'posvenda',label:'Pós-venda',quem:'Glauci',papeis:['logistica','montagem','montador'],grupos:[
  {label:'Montagem',itens:[['/pendencias?equipe=logistica','Minhas pendências'],'/montagem','/previsibilidade-montagens','/capacidade-montagem','/agenda-operacional','/agenda','/fretes','/liberacao']},
  {label:'Depois da montagem',itens:['/qualidade','/assistencias-operacionais','/jornada']},
 ]},
 {id:'correcao',label:'Correção',quem:'Giovanna',papeis:['correcao','medidor'],grupos:[
  {label:'Correção',itens:[['/pendencias?equipe=correcao','Minhas pendências'],'/correcao','/medicao','/liberacao','/jornada','/previsibilidade-montagens']},
 ]},
 {id:'qualidade',label:'Qualidade',quem:'Altair',papeis:['qualidade','logistica'],grupos:[
  {label:'Qualidade',itens:[['/pendencias?equipe=logistica','Pendências'],'/qualidade','/assistencias-operacionais','/montagem','/agenda','/jornada']},
 ]},
 {id:'comercial',label:'Comercial',quem:'Vendas',papeis:['vendedor','medidor'],grupos:[
  {label:'Comercial',itens:[['/pendencias?equipe=vendedor','Pendências'],'/orcamentos','/vendas','/medicao','/jornada']},
 ]},
 {id:'gestao',label:'Gestão',quem:'Diretoria',papeis:['gestor'],grupos:[
  {label:'Visão geral',itens:['/',['/pendencias','Pendências da equipe'],'/jornada','/relatorios']},
  {label:'Cadastros e consulta',itens:['/planejamento-integrado','/historico-operacional','/projetos','/funcionarios','/usuarios']},
 ]},
]
export const AREA_INICIAL = { financeiro:'financeiro', logistica:'posvenda', montagem:'posvenda', montador:'posvenda', correcao:'correcao', qualidade:'qualidade', vendedor:'comercial', medidor:'comercial' }

const caminho = (to) => to.split('?')[0]
const item = (x) => { const [to, txt] = Array.isArray(x) ? x : [x]; const r = ROTAS[caminho(to)]; return r && { ...r, to, txt: txt || r.txt } }
const vePode = (papel) => (it) => podeTudo(papel) || (it.roles && it.roles.includes(papel))
const casa = (it, path) => { const c = caminho(it.to); return it.end ? path === c : path === c || path.startsWith(c + '/') }

export function areasVisiveis(papel) {
  return AREAS.map((a) => ({ ...a, grupos: a.grupos.map((g) => ({ ...g, itens: g.itens.map(item).filter(Boolean).filter(vePode(papel)) })).filter((g) => g.itens.length) })).filter((a) => a.grupos.length && (podeTudo(papel) || a.papeis.includes(papel)))
}
export const itemDaArea = (area, path) => area?.grupos.flatMap((g) => g.itens).find((it) => casa(it, path))
export function areaDaRota(areas, path, atual, papel) {
  if (itemDaArea(areas.find((a) => a.id === atual), path)) return atual
  const pref = areas.find((a) => a.id === (podeTudo(papel) ? atual : AREA_INICIAL[papel]))
  if (itemDaArea(pref, path)) return pref.id
  return (areas.find((a) => itemDaArea(a, path)) || areas.find((a) => a.id === AREA_INICIAL[papel]) || areas[0])?.id
}

// Página inicial e rotas extras (fora do menu) de cada setor.
export const INICIO = { medidor: '/medicao', vendedor: '/orcamentos', correcao: '/correcao', logistica: '/montagem', montagem: '/montagem', qualidade: '/qualidade', montador: '/montagem' }
const EXTRAS = {
  vendedor: ['/contratos', '/novo-contrato', '/simulador'],
}
export function podeVerRota(path, papel) {
  if (podeTudo(papel)) return true
  if (!papel) return false
  if ((EXTRAS[papel] || []).includes(path)) return true
  return Object.entries(ROTAS).some(([to, it]) => it.roles && it.roles.includes(papel) && casa({ ...it, to }, path))
}

export default function Sidebar({ area }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>Le Blanc</h1>
        <span>Gestão integrada</span>
      </div>
      {area && <div className="area-nome">{area.label}<small>{area.quem}</small></div>}
      {(area?.grupos || []).map((g) => (
        <div className="nav-group" key={g.label}>
          <div className="label">{g.label}</div>
          {g.itens.map((it) => {
            const Icon = it.icon
            return (
              <NavLink key={it.to} to={it.to} end={it.end}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                <Icon /> {it.txt}
              </NavLink>
            )
          })}
        </div>
      ))}
    </aside>
  )
}
