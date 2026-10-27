// Contrato assinado subido na "Novo registro" da jornada: o que ler do texto e a que venda/contrato ligar,
// para não duplicar a venda quando ela já foi lançada no Histórico de vendas.
import { mesmoCliente, tokensNome } from './recebimentos.js'

// Vendedor citado no contrato ("Vendedor: Murilo", "Consultora: Tayne"), conferido contra a equipe.
export function acharVendedor(texto, nomes = []) {
  const t = String(texto || '').replace(/\s+/g, ' ')
  const m = t.match(/\b(?:vendedora|vendedor|consultora|consultor|vendido por)\b\s*[:\-]?\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i)
  if (!m) return ''
  const achado = tokensNome(m[1])[0]
  if (!achado) return ''
  const daEquipe = nomes.find((n) => tokensNome(n)[0] === achado)
  return daEquipe || m[1].split(/\s+/)[0].replace(/^./, (c) => c.toUpperCase())
}

// Venda (le_admin.vendas) que um contrato já usa: HIST-V12 / CTR-V12, ou venda_id gravado no contrato.
export const vendaDoContrato = (c) => {
  const id = c?.venda_id ?? String(c?.numero || '').match(/^(?:HIST|CTR)-V(\d+)$/i)?.[1]
  return id == null || id === '' ? null : Number(id)
}

const dias = (a, b) => Math.abs((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / 86400000)

// O que já existe para este cliente. Contrato sem ficha é o vínculo mais seguro; depois, venda
// lançada sem contrato. Só sugere sozinho quando há exatamente uma opção.
export function sugerirVinculo({ cliente, data, contratos = [], comFicha = new Set(), vendas = [] }) {
  const nome = String(cliente || '').trim()
  if (tokensNome(nome).length < 2) return { contratos: [], vendas: [], padrao: { tipo: 'nova' } }
  const usadas = new Set(contratos.map(vendaDoContrato).filter((x) => x != null))
  const cs = contratos.filter((c) => mesmoCliente(c.cliente_nome, nome))
    .map((c) => ({ ...c, temFicha: comFicha.has(String(c.id)) }))
  const vs = vendas.filter((v) => mesmoCliente(v.cliente_nome, nome) && !usadas.has(Number(v.id)))
    .sort((a, b) => (data && a.data_venda && b.data_venda ? dias(a.data_venda, data) - dias(b.data_venda, data) : 0))
  const livres = cs.filter((c) => !c.temFicha)
  let padrao = { tipo: 'nova' }
  if (livres.length === 1) padrao = { tipo: 'contrato', id: String(livres[0].id) }
  else if (!livres.length && vs.length === 1) padrao = { tipo: 'venda', id: Number(vs[0].id) }
  return { contratos: cs, vendas: vs, padrao }
}
