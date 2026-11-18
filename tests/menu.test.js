import test from 'node:test'
import assert from 'node:assert/strict'
import { areasVisiveis, itemDaArea, abaAtual, areaDaRota, podeVerRota, ROTAS, AREAS } from '../src/lib/menu.js'

const financeiro = (papel) => areasVisiveis(papel).find((a) => a.id === 'financeiro')

test('Financeiro da Léia tem 7 itens, agrupando as 20 telas em abas', () => {
  const area = financeiro('administrativo')
  const itens = area.grupos.flatMap((g) => g.itens)
  assert.deepEqual(itens.map((i) => i.txt), ['Hoje', 'Clientes', 'Entradas', 'Saídas', 'Caixa e bancos', 'Fechamento do mês', 'Relatórios'])
  const saidas = itens.find((i) => i.txt === 'Saídas')
  assert.equal(saidas.to, '/pagamentos')
  assert.deepEqual(saidas.abas.map((a) => a.txt), ['Pagamentos', 'Saídas do mês', 'Cartões', 'Parcelamentos', 'Contas fixas', 'Pró-labore'])
})

test('cada tela do grupo marca o mesmo item do menu e a aba certa', () => {
  const area = financeiro('administrativo')
  for (const path of ['/pagamentos', '/saidas', '/faturas-cartao', '/parcelamentos', '/contas-fixas', '/pro-labore']) {
    const it = itemDaArea(area, path)
    assert.equal(it?.txt, 'Saídas', path)
    assert.equal(abaAtual(it, path)?.to, path)
  }
  // Previsão de caixa não pode ser confundida com a previsibilidade de montagens.
  assert.equal(itemDaArea(area, '/previsibilidade')?.txt, 'Caixa e bancos')
  assert.equal(itemDaArea(area, '/previsibilidade-montagens')?.txt, 'Entradas')
})

test('telas que saíram do menu do financeiro continuam abrindo', () => {
  assert.ok(ROTAS['/custos'])
  assert.ok(podeVerRota('/custos', 'administrativo'))
  assert.ok(podeVerRota('/orcamentos', 'financeiro'))
  const area = financeiro('administrativo')
  assert.equal(itemDaArea(area, '/custos'), undefined)
  // Planilhas históricas foram para a Gestão.
  const areas = areasVisiveis('administrativo')
  assert.equal(areaDaRota(areas, '/planilhas-historicas', 'financeiro', 'administrativo'), 'gestao')
})

test('toda tela citada no menu existe e as outras áreas não mudaram de acesso', () => {
  for (const a of AREAS) for (const g of a.grupos) for (const x of g.itens) {
    const abas = x.abas || [Array.isArray(x) ? x : [x]]
    for (const [to] of abas) assert.ok(ROTAS[to.split('?')[0]], `${a.id}: ${to}`)
  }
  const montagem = areasVisiveis('montagem')
  assert.deepEqual(montagem.map((a) => a.id), ['posvenda'])
  assert.deepEqual(montagem[0].grupos.flatMap((g) => g.itens).map((i) => i.to), ['/montagem', '/agenda-operacional', '/agenda'])
  assert.equal(podeVerRota('/pagamentos', 'vendedor'), false)
})
