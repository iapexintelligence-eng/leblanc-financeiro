import test from 'node:test'
import assert from 'node:assert/strict'
import { parseContrato, nomeDoArquivo, pareceNome } from '../src/lib/lerContrato.js'

// Texto sintético no formato do contrato emitido pelo sistema (dados fictícios).
const MODELO = 'LE BLANC MÓVEIS PLANEJADOS Contrato de compra e venda DE PRODUTO E DE PRESTAÇÃO DE SERVIÇO Data do contrato 24/10/2026 Responsável pela venda MURILO TESTE Loja Curitiba 01 · Cliente e entrega Cliente FULANO DE TAL EXEMPLO CPF / CNPJ 000.000.000-00 Telefone (41) 90000-0000 Endereço do cliente Rua Exemplo, 1234 - Apartamento 12, Curitiba Endereço de instalação Rua Exemplo, 1234 - Apartamento 12 VALOR DOS MÓVEIS R$ 20.000,00 02 · Condições de pagamento Total a ser pago conforme parcelas: R$ 21.700,00.'

test('lê o contrato do modelo do sistema sem confundir o endereço com o nome', () => {
  const p = parseContrato(MODELO)
  assert.equal(p.cliente, 'FULANO DE TAL EXEMPLO')
  assert.equal(p.cpf, '000.000.000-00')
  assert.equal(p.data, '2026-10-24')
  assert.equal(p.valor, 21700)
  assert.equal(p.vendedor, 'MURILO TESTE')
  assert.equal(p.telefone, '(41) 90000-0000')
  assert.match(p.endereco, /^Rua Exemplo, 1234/)
})

test('contrato em texto corrido e endereço com código não viram nome', () => {
  assert.equal(parseContrato('CONTRATANTE: CICLANA MODELO SOUZA, brasileira, portadora do CPF 111.111.111-11').cliente, 'CICLANA MODELO SOUZA')
  assert.equal(parseContrato('Rua X 1234 - Apartamento 5 CPF 111.111.111-11').cliente, '')
  assert.equal(parseContrato('Pedido 1058 - BELTRANO TESTE CPF 111.111.111-11').cliente, 'BELTRANO TESTE')
})

test('nome pelo arquivo quando o texto não traz', () => {
  assert.equal(nomeDoArquivo('CONTRATO_LE_BLANC_Fulano_de_Tal_Exemplo.pdf'), 'Fulano de Tal Exemplo')
  assert.equal(nomeDoArquivo('contrato assinado - Beltrano Teste (2).pdf'), 'Beltrano Teste')
  assert.equal(nomeDoArquivo('scan_0012.pdf'), '')
  assert.ok(!pareceNome('Apartamento'))
  assert.ok(!pareceNome('Apartamento 12 Bloco B'))
  assert.ok(pareceNome('Fulano Tal'))
})
