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
