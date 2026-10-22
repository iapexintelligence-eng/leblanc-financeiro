import test from 'node:test'
import assert from 'node:assert/strict'
import { mesmoCliente, parcelasDoCliente, projetoDoContrato } from '../src/lib/recebimentos.js'

test('liga a parcela ao cliente mesmo com nome mais curto ou sem acento', () => {
  assert.ok(mesmoCliente('Luiz Felipe Russo', 'LUIZ FELIPE RUSSO SCHMIDT'))
  assert.ok(mesmoCliente('Jéssica Lima', 'JESSICA LIMA'))
  assert.ok(mesmoCliente('Henrique Daga', 'HENRIQUE DAGA'))
  assert.ok(!mesmoCliente('Henrique Daga', 'HENRIQUE AUGUSTO S GAETNER'), 'mesmo primeiro nome não basta')
  assert.ok(!mesmoCliente('Ana', 'ANA PAULA WOLF'), 'só o primeiro nome não liga')
  assert.ok(!mesmoCliente('Paula Wolf', 'ANA PAULA WOLF'), 'tem de começar pelo mesmo nome')
})

test('parcelas do cliente: pelo projeto do contrato ou pelo nome, em ordem de vencimento', () => {
  const rows = [
    { id: 1, cliente_nome: 'Cliente Teste', data_prevista: '2026-11-01', projeto_uid: null },
    { id: 2, cliente_nome: 'Outro Nome', data_prevista: '2026-10-01', projeto_uid: 'PROJ-V116' },
    { id: 3, cliente_nome: 'Cliente Teste Silva', data_prevista: '2026-09-01', projeto_uid: null },
    { id: 4, cliente_nome: 'Fulano Beltrano', data_prevista: '2026-08-01', projeto_uid: null },
  ]
  assert.equal(projetoDoContrato('HIST-V116'), 'PROJ-V116')
  assert.deepEqual(parcelasDoCliente(rows, { nome: 'CLIENTE TESTE SILVA', projeto: 'PROJ-V116' }).map((r) => r.id), [3, 2, 1])
})
