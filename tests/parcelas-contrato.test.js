import test from 'node:test'
import assert from 'node:assert/strict'
import { sugerirParcelas, addMeses } from '../src/lib/parcelasContrato.js'

test('entrada + montagem + finalização, com "e mais"', () => {
  const r = sugerirParcelas('160.000,00+100.000,00 NO agendamento da montagem e mais 7.000 na finalização  da montagem', 267000, '2026-11-10')
  assert.deepEqual(r.linhas.map((l) => l.valor), [160000, 100000, 7000])
  assert.equal(r.linhas[0].data_prevista, '2026-11-10')
  assert.equal(r.linhas[1].data_prevista, '')
  assert.match(r.linhas[1].descricao, /agendamento da montagem/i)
  assert.equal(r.diferenca, 0)
})

test('pedaço sem valor recebe a diferença para o total', () => {
  const r = sugerirParcelas('entrada 65.000+18.000 2 dias antes da 1 entrega+18.000 2 dias antes da 2 entrega+6.000 ate 5 dias corrido apos  a finalização da montagem da 1 etapa +finalização da montagem da 2etapa', 113000, '2026-10-28')
  assert.deepEqual(r.linhas.map((l) => l.valor), [65000, 18000, 18000, 6000, 6000])
  assert.equal(r.diferenca, 0)
})

test('boleto em 24x vira 24 linhas mensais; cartão fica numa linha só', () => {
  const r = sugerirParcelas('1/2 entrada na assinatura  9348,58+2/2 9348,58 e dias antes da entrega+69.000,00 boleto  24x 2.875+25166,61cartão de credito 21x', 112869.77, '2026-08-18')
  assert.equal(r.linhas[0].valor, 9348.58)
  assert.equal(r.linhas[1].valor, 9348.58)
  const boletos = r.linhas.filter((l) => l.forma === 'Boleto')
  assert.equal(boletos.length, 24)
  assert.equal(boletos[0].valor, 2875)
  assert.equal(boletos[0].data_prevista, '2026-09-17')
  assert.equal(boletos[23].data_prevista, addMeses('2026-09-17', 23))
  const cartao = r.linhas.filter((l) => l.forma === 'Cartão de crédito')
  assert.equal(cartao.length, 1); assert.equal(cartao[0].valor, 25166.61)
  assert.equal(r.diferenca, 6, 'a soma escrita no contrato dá R$ 6 a menos que o total: a tela mostra a diferença')
})

test('sem forma de pagamento: parcela única com o total', () => {
  const r = sugerirParcelas('', 21700, '2026-10-24')
  assert.deepEqual(r.linhas, [{ descricao: 'Valor do contrato', valor: 21700, data_prevista: '2026-10-24', forma: 'Pix' }])
})
