import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseFaturaCartao } from '../src/lib/faturaCartao.js'

test('fatura Viacredi/Ailos lê só os lançamentos, não os quadros de limite e categorias', () => {
  const linhas = JSON.parse(fs.readFileSync(new URL('./fixtures/fatura-ailos.json', import.meta.url)))
  const r = parseFaturaCartao(linhas)
  assert.equal(r.mesRef, '2026-10')
  assert.equal(r.cartao, 'Mastercard final 3553')
  assert.equal(r.totalFatura, 10000)
  assert.deepEqual(r.itens.map((i) => [i.data_compra, i.descricao, i.parcela, i.valor]), [['2026-09-21', 'MENEZES INDUSTRIA DE', '01/03', 10000]])
})

test('PDF de banco desconhecido não vira compra qualquer linha com R$', () => {
  const r = parseFaturaCartao(['LIMITE R$ 30.000,00', 'TRANSPORTES R$ 0,00', 'CONSTRUÇÃO E REFORMA R$ 10.000,00'])
  assert.equal(r.itens.length, 0)
})

test('quadro de cartões mostra qual fatura já foi lançada no mês e qual falta', async () => {
  const { situacaoCartoes, cartaoDe } = await import('../src/lib/cartoes.js')
  const rows = [
    { cartao: 'Mastercard final 2969', mes_ref: '2026-10-01', valor: 100 },
    { cartao: 'Mastercard final 2969', mes_ref: '2026-10-01', valor: 50 },
    { cartao: 'Visa final 9514', mes_ref: '2026-10-01', valor: 10 },
    { cartao: 'Mastercard final 3671', mes_ref: '2026-09-01', valor: 70 },
    { cartao: 'Cartão estranho', mes_ref: '2026-10-01', valor: 1 },
  ]
  const s = situacaoCartoes(rows, '2026-10')
  const por = Object.fromEntries(s.lista.map((c) => [c.id, [c.itens, c.total]]))
  assert.deepEqual(por['santander-2969'], [2, 150])
  assert.deepEqual(por.sicredi, [1, 10])
  assert.deepEqual(por['santander-3671'], [0, 0])
  assert.equal(s.faltam, 4)
  assert.deepEqual(s.outros, ['Cartão estranho'])
  assert.equal(cartaoDe('Mastercard final 3553').banco, 'Viacredi')
})
