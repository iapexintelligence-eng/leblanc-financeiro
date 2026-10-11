import test from 'node:test'
import assert from 'node:assert/strict'
import { metaDoMes, vendasConsolidadas } from '../src/lib/metas.js'

test('meta respeita a vigência e não altera meses anteriores', () => {
  const cfg = [{ chave: 'meta_mensal', valor: 700000 }, { chave: 'meta_mensal:2026-10', valor: 700000 }, { chave: 'meta_mensal:2026-01', valor: 650000 }]
  assert.equal(metaDoMes(cfg, '2026-09'), 650000)
  assert.equal(metaDoMes(cfg, '2026-10'), 700000)
  assert.equal(metaDoMes(cfg, '2027-02'), 700000)
  assert.equal(metaDoMes(cfg, '2025-12'), 700000)
  assert.equal(metaDoMes([], '2026-10'), 0)
})

test('contrato novo entra no vendido uma única vez', () => {
  const vendas = [{ valor_vendido: 100, data_venda: '2026-10-01', vendedor: 'Tayne' }]
  const contratos = [
    { status: 'Emitido', vendor: 'Murilo', valor_final: 60, created_at: '2026-10-03T10:00:00Z', dados_json: { regras_versao: '2026-09-28', valor_negociado: 50 } },
    { status: 'Emitido', valor_final: 80, dados_json: { regras_versao: '2026-09-28', venda_id: 9 } },
    { status: 'Aguardando aprovação', valor_final: 70, dados_json: { regras_versao: '2026-09-28' } },
    { status: 'rascunho', valor_final: 90, dados_json: { regras_versao: 'historico-documental' } },
  ]
  const r = vendasConsolidadas(vendas, contratos)
  assert.equal(r.length, 2)
  assert.deepEqual(r[1], { valor_vendido: 50, data_venda: '2026-10-03', vendedor: 'Murilo', origem: 'contrato' })
})
