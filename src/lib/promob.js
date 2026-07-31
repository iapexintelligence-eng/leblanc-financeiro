// Leitor do XML de orçamento do Promob (Bartzen/K1 etc.).
// Extrai os dados do cliente, os ambientes com o valor de venda (BUDGET) e a indústria.

const attr = (el, name) => (el && el.getAttribute(name)) || ''

export function parsePromobXML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Arquivo XML inválido ou corrompido.')
  const listing = doc.querySelector('LISTING') || doc.documentElement
  if (!listing) throw new Error('Não parece um orçamento do Promob (sem LISTING).')

  // Dados do cliente (CUSTOMERSDATA > DATA[ID][VALUE])
  const dm = {}
  doc.querySelectorAll('CUSTOMERSDATA > DATA').forEach((d) => { dm[attr(d, 'ID')] = attr(d, 'VALUE') })

  // Indústria pela biblioteca (ex.: "Bartzen_2025" -> "Bartzen")
  const versoes = [...doc.querySelectorAll('LIBRARIES > LIBRARY')].map((l) => attr(l, 'VERSION')).filter(Boolean)
  const versao = versoes.find((v) => v && !/^\d+$/.test(v)) || ''
  const fornecedor = versao ? versao.split('_')[0] : ''

  // Ambientes de topo (ignora sub-ambientes aninhados para não somar valor duas vezes)
  const ambientes = [...doc.querySelectorAll('AMBIENT')]
    .filter((a) => !(a.parentElement && a.parentElement.closest('AMBIENT')))
    .map((a) => {
      const desc = attr(a, 'DESCRIPTION').replace(/^\s*projeto\s*[-–]\s*/i, '').trim()
      const b = a.querySelector(':scope > TOTALPRICES > MARGINS > BUDGET')
      const valor = b ? Number(attr(b, 'VALUE')) || 0 : 0
      return { descricao: desc, valor, fornecedor }
    })
    .filter((x) => x.descricao || x.valor)

  // Valor total: soma dos ambientes; fallback no BUDGET geral do orçamento
  let total = ambientes.reduce((s, x) => s + x.valor, 0)
  if (!total) {
    const bGeral = doc.querySelector('LISTING > TOTALPRICES > MARGINS > BUDGET') || doc.querySelector('BUDGET[VALUE]')
    total = bGeral ? Number(attr(bGeral, 'VALUE')) || 0 : 0
  }

  const telefone = (dm.celular || (dm.phone_Mobile_0 || '').split('|').pop() || '').trim()
  const cliente = {
    cliente_nome: dm.nomecliente || dm.nickName || dm.corporateName || '',
    cliente_cpf: dm.cpfcnpj || dm.document_Cpf_0 || '',
    cliente_email: dm.email || dm.email_Private_0 || '',
    cliente_telefone: telefone,
    endereco: dm.endereco || '',
    bairro: dm.bairro || '',
    cidade: dm.cidade || '',
    uf: dm.uf || '',
    cep: dm.cep || '',
  }

  return { cliente, ambientes, fornecedor, total, dataOrcamento: attr(listing, 'DATE'), codCliente: dm.codcliente || '' }
}
