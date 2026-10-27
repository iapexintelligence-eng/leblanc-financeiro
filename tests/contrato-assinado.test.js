import test from 'node:test'
import assert from 'node:assert/strict'
import { acharVendedor, sugerirVinculo, vendaDoContrato } from '../src/lib/contratoAssinado.js'
import { projetoDoContrato } from '../src/lib/recebimentos.js'

test('vendedor do contrato conferido contra a equipe', () => {
  const equipe = ['Murilo Teste', 'Tayne Exemplo']
  assert.equal(acharVendedor('... Vendedor: MURILO  Data 01/10/2026', equipe), 'Murilo Teste')
  assert.equal(acharVendedor('Consultora - tayne', equipe), 'Tayne Exemplo')
  assert.equal(acharVendedor('Vendedor: Fulano', equipe), 'Fulano')
  assert.equal(acharVendedor('sem campo de vendedor', equipe), '')
})

test('venda e projeto ligados ao contrato pelo número', () => {
  assert.equal(vendaDoContrato({ numero: 'HIST-V12' }), 12)
  assert.equal(vendaDoContrato({ numero: 'CTR-V130' }), 130)
  assert.equal(vendaDoContrato({ numero: 'CRM-abc' }), null)
  assert.equal(projetoDoContrato('CTR-V130'), 'PROJ-V130')
  assert.equal(projetoDoContrato('HIST-V7'), 'PROJ-V7')
})

test('não duplica: usa contrato sem ficha, depois venda sem contrato; senão cria nova', () => {
  const contratos = [
    { id: 'c1', numero: 'HIST-V5', cliente_nome: 'CLIENTE EXEMPLO SILVA' },
    { id: 'c2', numero: 'HIST-V6', cliente_nome: 'OUTRA PESSOA TESTE' },
  ]
  const vendas = [
    { id: 5, cliente_nome: 'Cliente Exemplo Silva', data_venda: '2026-09-01' },
    { id: 9, cliente_nome: 'Fulana Modelo', data_venda: '2026-10-20' },
  ]
  let s = sugerirVinculo({ cliente: 'Cliente Exemplo', contratos, vendas })
  assert.deepEqual(s.padrao, { tipo: 'contrato', id: 'c1' })
  assert.equal(s.vendas.length, 0, 'venda 5 já tem contrato (HIST-V5)')
  s = sugerirVinculo({ cliente: 'Cliente Exemplo', contratos, vendas, comFicha: new Set(['c1']) })
  assert.deepEqual(s.padrao, { tipo: 'nova' }, 'contrato já com ficha não é reaproveitado')
  assert.equal(s.contratos[0].temFicha, true)
  s = sugerirVinculo({ cliente: 'FULANA MODELO', data: '2026-10-21', contratos, vendas })
  assert.deepEqual(s.padrao, { tipo: 'venda', id: 9 })
  s = sugerirVinculo({ cliente: 'Pessoa Nova Aqui', contratos, vendas })
  assert.deepEqual(s.padrao, { tipo: 'nova' })
  assert.deepEqual(sugerirVinculo({ cliente: 'Ana', contratos, vendas }).padrao, { tipo: 'nova' })
})
