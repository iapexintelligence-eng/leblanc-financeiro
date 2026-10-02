import { NavLink } from 'react-router-dom'
import { podeTudo } from '../lib/useRole.js'
import {
  IcoHome, IcoSales, IcoProject, IcoReceive, IcoForecast, IcoCost,
  IcoPay, IcoDre, IcoBank, IcoGift, IcoTool, IcoPeople, IcoReport,
} from './Icons.jsx'

// roles = papéis que veem o item (além de administrativo/diretoria, que veem tudo).
// sem roles = só administrativo/diretoria.
const GROUPS = [
 {label:'Visão geral',items:[
  {to:'/pendencias',icon:IcoProject,txt:'Pendências da equipe',roles:['vendedor','correcao','logistica','financeiro','gestor']},
  {to:'/',icon:IcoHome,txt:'Visão Geral',end:true},
  {to:'/jornada',icon:IcoProject,txt:'Jornada do cliente',roles:['vendedor','correcao','logistica','financeiro','gestor','qualidade']},
 ]},
 {label:'Setores',items:[
  {to:'/vendas',icon:IcoSales,txt:'Vendas',roles:['vendedor']},
  {to:'/correcao',icon:IcoTool,txt:'Correção',roles:['correcao']},
  {to:'/liberacao',icon:IcoProject,txt:'Liberação',roles:['correcao','logistica']},
  {to:'/capacidade-montagem',icon:IcoPeople,txt:'Capacidade de montagem',roles:['logistica','gestor']},
  {to:'/montagem',icon:IcoTool,txt:'Montagem',roles:['logistica','montagem','montador']},
  {to:'/qualidade',icon:IcoTool,txt:'Qualidade',roles:['logistica','qualidade']},
 ]},
 {label:'Financeiro · Leia',items:[
  {to:'/planilhas-historicas',icon:IcoReport,txt:'Planilhas históricas',roles:['financeiro','gestor']},
  {to:'/revisao-mensal',icon:IcoDre,txt:'Revisão mensal'},
  {to:'/conferencia-financeira',icon:IcoPay,txt:'Conferência, margens e autorizações'},
  {to:'/recebiveis',icon:IcoReceive,txt:'Recebimentos'},
  {to:'/pagamentos',icon:IcoPay,txt:'Pagamentos'},
  {to:'/custos',icon:IcoCost,txt:'Custos operacionais'},
  {to:'/saidas',icon:IcoPay,txt:'Saídas'},
  {to:'/contas-fixas',icon:IcoPay,txt:'Contas fixas mensais'},
  {to:'/vincular',icon:IcoProject,txt:'Gastos por contrato'},
  {to:'/dre',icon:IcoDre,txt:'DRE mensal'},
  {to:'/previsibilidade',icon:IcoForecast,txt:'Previsibilidade'},
  {to:'/bancos',icon:IcoBank,txt:'Bancos'},
  {to:'/pro-labore',icon:IcoPay,txt:'Pró-labore'},
  {to:'/faturas-cartao',icon:IcoBank,txt:'Faturas de cartão'},
  {to:'/gratificacao',icon:IcoGift,txt:'Gratificação'},
 ]},
 {label:'Gestão e cadastros',items:[
  {to:'/planejamento-integrado',icon:IcoReport,txt:'Prévia da integração'},
  {to:'/historico-operacional',icon:IcoReport,txt:'Histórico operacional'},
  {to:'/projetos',icon:IcoProject,txt:'Projetos anteriores'},
  {to:'/funcionarios',icon:IcoPeople,txt:'Funcionários'},
  {to:'/usuarios',icon:IcoPeople,txt:'Usuários e acessos'},
  {to:'/relatorios',icon:IcoReport,txt:'Relatórios'},
 ]},
]

export default function Sidebar({ papel = null }) {
  const vePode = (it) => podeTudo(papel) || (it.roles && it.roles.includes(papel))
  const grupos = GROUPS.map((g) => ({ ...g, items: g.items.filter(vePode) })).filter((g) => g.items.length)
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>Le Blanc</h1>
        <span>Gestão integrada</span>
      </div>
      {grupos.map((g) => (
        <div className="nav-group" key={g.label}>
          <div className="label">{g.label}</div>
          {g.items.map((it) => {
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
