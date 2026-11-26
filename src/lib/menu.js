// Menu do sistema: telas, quem vê cada uma e como elas se agrupam por área (aba do topo).
// Fica fora do Sidebar.jsx para poder ser testado sem React.

// Quem vê tudo: administrativo, diretoria, gestão e financeiro.
export const podeTudo = (papel) => papel === 'administrativo' || papel === 'diretoria' || papel === 'gestor' || papel === 'financeiro'

// Cada rota tem UMA regra de acesso (papéis que veem, além de quem vê tudo).
// sem roles = só quem vê tudo. As áreas só organizam o menu; não mudam quem pode abrir o quê.
export const ROTAS = {
 '/pendencias':{icon:'project',txt:'Pendências',roles:['medidor','vendedor','correcao','logistica','financeiro','gestor']},
 '/':{icon:'home',txt:'Visão Geral',end:true},
 '/jornada':{icon:'project',txt:'Jornada do cliente',roles:['medidor','vendedor','correcao','logistica','financeiro','gestor','qualidade']},
 '/orcamentos':{icon:'sales',txt:'Orçamentos e contratos',roles:['vendedor','financeiro','gestor']},
 '/contratos-todos':{icon:'report',txt:'Contratos (comercial e importados)',roles:['financeiro','gestor']},
 '/aditivos':{icon:'report',txt:'Aditivos de contrato',roles:['vendedor','financeiro','gestor']},
 '/vendas':{icon:'sales',txt:'Vendas',roles:['vendedor']},
 '/medicao':{icon:'tool',txt:'Medida técnica',roles:['medidor','correcao']},
 '/correcao':{icon:'tool',txt:'Correção',roles:['correcao']},
 '/liberacao':{icon:'project',txt:'Liberação',roles:['correcao','logistica']},
 '/previsibilidade-montagens':{icon:'forecast',txt:'Previsibilidade de montagens',roles:['logistica','gestor','financeiro','correcao']},
 '/capacidade-montagem':{icon:'people',txt:'Capacidade de montagem',roles:['logistica','gestor']},
 '/montagem':{icon:'tool',txt:'Quadro de pós-venda',roles:['logistica','montagem','montador']},
 '/qualidade':{icon:'tool',txt:'Entrega técnica e qualidade',roles:['logistica','qualidade']},
 '/assistencias-operacionais':{icon:'tool',txt:'Assistências',roles:['logistica','qualidade']},
 '/agenda-operacional':{icon:'project',txt:'Escalas e previsão',roles:['logistica','montagem']},
 '/agenda':{icon:'project',txt:'Agenda da loja',roles:['logistica','montagem']},
 '/fretes':{icon:'cost',txt:'Fretes por viagem',roles:['logistica']},
 '/planilhas-historicas':{icon:'report',txt:'Planilhas históricas',roles:['financeiro','gestor']},
 '/revisao-mensal':{icon:'dre',txt:'Revisão mensal'},
 '/conferencia-financeira':{icon:'pay',txt:'Conferência, margens e autorizações'},
 '/recebiveis':{icon:'receive',txt:'Recebimentos'},
 '/pagamentos':{icon:'pay',txt:'Pagamentos'},
 '/custos':{icon:'cost',txt:'Custos operacionais'},
 '/saidas':{icon:'pay',txt:'Saídas'},
 '/contas-fixas':{icon:'pay',txt:'Contas fixas mensais'},
 '/vincular':{icon:'project',txt:'Gastos por contrato'},
 '/dre':{icon:'dre',txt:'DRE mensal'},
 '/previsibilidade':{icon:'forecast',txt:'Previsibilidade financeira'},
 '/bancos':{icon:'bank',txt:'Bancos'},
 '/pro-labore':{icon:'pay',txt:'Pró-labore'},
 '/faturas-cartao':{icon:'bank',txt:'Faturas de cartão'},
 '/parcelamentos':{icon:'bank',txt:'Parcelamentos dos cartões'},
 '/gratificacao':{icon:'gift',txt:'Gratificação'},
 '/planejamento-integrado':{icon:'report',txt:'Prévia da integração'},
 '/historico-operacional':{icon:'report',txt:'Histórico operacional'},
 '/projetos':{icon:'project',txt:'Projetos anteriores'},
 '/funcionarios':{icon:'people',txt:'Funcionários'},
 '/usuarios':{icon:'people',txt:'Usuários e acessos'},
 '/relatorios':{icon:'report',txt:'Relatórios'},
}

// Item agrupado: um item só no menu, com as telas como abas no topo da página.
// abas = [caminho, nome da aba]; o item abre na primeira aba que a pessoa pode ver.
const grupo = (txt, icon, abas) => ({ txt, icon, abas })

// Abas do topo: tudo o que cada pessoa usa fica junto, mesmo que a tela se repita em outra aba.
// papeis = quem vê a aba (quem vê tudo vê todas). Item = caminho, [caminho, nome nesta aba] ou grupo(...).
// Pendências já abre filtrada pela equipe da aba.
export const AREAS = [
 {id:'financeiro',label:'Financeiro',quem:'Léia',papeis:['financeiro'],grupos:[
  {label:'Dia a dia',itens:[
   grupo('Hoje','home',[['/pendencias?equipe=financeiro','O que fazer']]),
   grupo('Clientes','project',[['/jornada','Jornada do cliente'],['/contratos-todos','Contratos'],['/aditivos','Aditivos'],['/vincular','Gastos por contrato']]),
   grupo('Entradas','receive',[['/recebiveis','Recebimentos'],['/previsibilidade-montagens','Saldos antes da montagem']]),
   grupo('Saídas','pay',[['/pagamentos','Pagamentos'],['/saidas','Saídas do mês'],['/faturas-cartao','Cartões'],['/parcelamentos','Parcelamentos'],['/contas-fixas','Contas fixas'],['/pro-labore','Pró-labore']]),
   grupo('Caixa e bancos','bank',[['/bancos','Bancos'],['/previsibilidade','Previsão de caixa']]),
  ]},
  {label:'Fechamento',itens:[
   grupo('Fechamento do mês','dre',[['/revisao-mensal','Revisão do mês'],['/conferencia-financeira','Conferência e margens'],['/gratificacao','Gratificação'],['/funcionarios','Funcionários']]),
   grupo('Relatórios','report',[['/dre','DRE mensal'],['/relatorios','Relatórios']]),
  ]},
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
  {label:'Comercial',itens:[['/pendencias?equipe=vendedor','Pendências'],'/orcamentos','/vendas','/aditivos','/medicao','/jornada']},
 ]},
 {id:'gestao',label:'Gestão',quem:'Diretoria',papeis:['gestor'],grupos:[
  {label:'Visão geral',itens:['/',['/pendencias','Pendências da equipe'],'/jornada','/relatorios']},
  {label:'Cadastros e consulta',itens:['/planejamento-integrado','/historico-operacional','/projetos','/planilhas-historicas','/funcionarios','/usuarios']},
 ]},
]
export const AREA_INICIAL = { financeiro:'financeiro', logistica:'posvenda', montagem:'posvenda', montador:'posvenda', correcao:'correcao', qualidade:'qualidade', vendedor:'comercial', medidor:'comercial' }

export const caminho = (to) => to.split('?')[0]
const vePode = (papel) => (it) => podeTudo(papel) || (it.roles && it.roles.includes(papel))
const simples = (x) => { const [to, txt] = Array.isArray(x) ? x : [x]; const r = ROTAS[caminho(to)]; return r && { ...r, to, txt: txt || r.txt } }
export const casaRota = (it, path) => { const c = caminho(it.to); return it.end ? path === c : path === c || path.startsWith(c + '/') }
export const casa = (it, path) => (it.abas ? it.abas.some((a) => casaRota(a, path)) : casaRota(it, path))

// Item do menu já filtrado pelo papel (null quando a pessoa não vê nenhuma tela dele).
export function itemDoMenu(x, papel) {
  if (x && x.abas) {
    const abas = x.abas.map(simples).filter(Boolean).filter(vePode(papel))
    if (!abas.length) return null
    return { txt: x.txt, icon: x.icon, to: abas[0].to, abas }
  }
  const it = simples(x)
  return it && vePode(papel)(it) ? it : null
}

export function areasVisiveis(papel) {
  return AREAS.map((a) => ({ ...a, grupos: a.grupos.map((g) => ({ ...g, itens: g.itens.map((x) => itemDoMenu(x, papel)).filter(Boolean) })).filter((g) => g.itens.length) })).filter((a) => a.grupos.length && (podeTudo(papel) || a.papeis.includes(papel)))
}
export const itemDaArea = (area, path) => area?.grupos.flatMap((g) => g.itens).find((it) => casa(it, path))
export const abaAtual = (item, path) => item?.abas?.find((a) => casaRota(a, path))
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
  return Object.entries(ROTAS).some(([to, it]) => it.roles && it.roles.includes(papel) && casaRota({ ...it, to }, path))
}
