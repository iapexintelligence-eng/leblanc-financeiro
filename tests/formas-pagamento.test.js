import test from 'node:test'
import assert from 'node:assert/strict'
import { formaPagamento, FORMAS_PAGAMENTO } from '../src/lib/formasPagamento.js'

test('forma de pagamento gravada sem acento, como o banco aceita', () => {
  assert.equal(formaPagamento('Transferência'), 'Transferencia')
  assert.equal(formaPagamento('Cartão'), 'Cartao')
  assert.equal(formaPagamento('pix'), 'PIX')
  assert.equal(formaPagamento(''), null)
  assert.deepEqual(FORMAS_PAGAMENTO.map(([v]) => v), ['PIX', 'Boleto', 'Transferencia', 'Cartao', 'Dinheiro'])
})
