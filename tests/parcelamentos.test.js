import test from 'node:test'
import assert from 'node:assert/strict'
import { parcelaDoMes, presoApos, projecao, parcelamentosDasFaturas, ultimoMes, somarMeses, parcelasRestantes } from '../src/lib/parcelamentos.js'
import { CARTOES } from '../src/lib/cartoes.js'

const p = { cartao_id: 'santander-2969', descricao: 'Electrolux', valor_parcela: 100, parcelas_total: 10, primeira_parcela: '2026-09' }

test('cada parcela cai na fatura do seu mês, de 1 até o total', () => {
  assert.equal(ultimoMes(p), '2027-06')
  assert.equal(parcelaDoMes(p, '2026-08'), 0)
  assert.equal(parcelaDoMes(p, '2026-09'), 1)
  assert.equal(parcelaDoMes(p, '2026-11'), 3)
  assert.equal(parcelaDoMes(p, '2027-06'), 10)
  assert.equal(parcelaDoMes(p, '2027-07'), 0)
  assert.equal(somarMeses('2026-11', 2), '2027-01')
})

test('o limite preso cai uma parcela a cada fatura paga', () => {
  assert.equal(presoApos(p, '2026-08'), 1000) // comprou, ainda não pagou nenhuma
  assert.equal(presoApos(p, '2026-11'), 700) // pagou set, out e nov
  assert.equal(presoApos(p, '2027-06'), 0)
  assert.equal(parcelasRestantes(p, '2026-11'), 8) // nov (3ª) até jun (10ª)
  // Quitado antes: depois do mês do encerramento não prende mais nada.
  assert.equal(presoApos({ ...p, encerrado_em: '2026-12' }, '2026-12'), 0)
  assert.equal(parcelaDoMes({ ...p, encerrado_em: '2026-12' }, '2027-01'), 0)
})

test('projeção por cartão: fatura de cada mês e limite livre depois de pagá-la', () => {
  const outro = { ...p, descricao: 'Menezes', valor_parcela: 6666.68, parcelas_total: 3, primeira_parcela: '2026-10' }
  const [s] = projecao({ parcelamentos: [p, outro], limites: { 'santander-2969': 30000 }, cartoes: [CARTOES[1]], inicio: '2026-11', meses: 3 })
  assert.equal(s.limite, 30000)
  assert.equal(Math.round(s.presoHoje * 100) / 100, 800 + 2 * 6666.68) // antes da fatura de nov
  assert.deepEqual(s.meses.map((m) => m.ym), ['2026-11', '2026-12', '2027-01'])
  assert.equal(Math.round(s.meses[0].fatura * 100) / 100, 6766.68)
  assert.equal(Math.round(s.meses[0].livre * 100) / 100, 30000 - 700 - 6666.68)
  assert.equal(s.meses[1].livre, 30000 - 600) // Menezes terminou em dez
  const [semLimite] = projecao({ parcelamentos: [p], limites: {}, cartoes: [CARTOES[1]], inicio: '2026-11', meses: 1 })
  assert.equal(semLimite.meses[0].livre, null)
})

test('parcelamentos lidos das faturas: uma compra só, mesmo aparecendo em várias faturas', () => {
  const itens = [
    { cartao: 'Mastercard final 2969', mes_ref: '2026-09', descricao: 'HBKSOLUCOES CURITIBA', parcela: '02/04', valor: 273.11 },
    { cartao: 'Mastercard final 2969', mes_ref: '2026-10', descricao: 'HBKSOLUCOES CURITIBA', parcela: '03/04', valor: 273.08 },
    { cartao: 'Mastercard final 2969', mes_ref: '2026-09', descricao: 'JAMES SHELDON', parcela: '02/02', valor: 147.5 },
    { cartao: 'Mastercard final 3553', mes_ref: '2026-10', descricao: 'MENEZES INDUSTRIA DE', parcela: '01/03', valor: 10000 },
    { cartao: 'Mastercard final 3671', mes_ref: '2026-10', descricao: 'Estorno', parcela: '01/02', valor: -50 },
    { cartao: 'Cartão desconhecido 1234', mes_ref: '2026-10', descricao: 'X', parcela: '01/02', valor: 50 },
  ]
  const ps = parcelamentosDasFaturas(itens, { aPartirDe: '2026-11' })
  assert.equal(ps.length, 2, 'James Sheldon já terminou; crédito e cartão desconhecido ficam de fora')
  const hbk = ps.find((x) => x.descricao.startsWith('HBK'))
  assert.equal(hbk.primeira_parcela, '2026-08')
  assert.equal(hbk.parcelas_total, 4)
  assert.equal(hbk.valor_parcela, 273.08, 'valor da fatura mais recente')
  assert.equal(hbk.cartao_id, 'santander-2969')
  const men = ps.find((x) => x.cartao_id === 'viacredi')
  assert.equal(men.primeira_parcela, '2026-10')
  assert.ok(hbk.chave && men.chave)
})
