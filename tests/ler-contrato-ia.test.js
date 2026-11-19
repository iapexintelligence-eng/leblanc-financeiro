import test from 'node:test'
import assert from 'node:assert/strict'
import { dadosDaIA, valorDaIA, dataDaIA, juntarLeituras } from '../src/lib/dadosIA.js'

test('valores e datas que a IA devolve em formatos diferentes', () => {
  assert.equal(valorDaIA('R$ 21.700,00'), 21700)
  assert.equal(valorDaIA('21700.5'), 21700.5)
  assert.equal(valorDaIA(18000), 18000)
  assert.equal(valorDaIA(''), null)
  assert.equal(valorDaIA(null), null)
  assert.equal(dataDaIA('2026-11-19'), '2026-11-19')
  assert.equal(dataDaIA('9/1/2026'), '2026-01-09')
  assert.equal(dataDaIA('novembro'), '')
})

test('dados da IA valem mais que o OCR, e o OCR completa o que faltou', () => {
  const ia = dadosDaIA({ cliente_nome: 'Fulano de Tal', cliente_cpf: null, data_contrato: '19/11/2026', valor_total: '30.000,00', legivel: true })
  const ocr = { cliente: 'WhatsApp Image', cpf: '000.000.000-00', valor: 5, data: '', vendedor: '', telefone: '', endereco: '' }
  const p = juntarLeituras(ia, ocr)
  assert.equal(p.cliente, 'Fulano de Tal')
  assert.equal(p.cpf, '000.000.000-00')
  assert.equal(p.valor, 30000)
  assert.equal(p.data, '2026-11-19')
  assert.equal(juntarLeituras(null, ocr), ocr)
})
