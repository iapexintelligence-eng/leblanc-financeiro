// Leitura dos dados de um contrato Le Blanc a partir do texto do PDF (ou da foto, via OCR).
// Retorna o que conseguir; o resto fica vazio para preencher à mão.

const ENDERECO = /^(?:apartamento|apto|ap|casa|rua|r|avenida|av|alameda|travessa|rodovia|estrada|sala|bloco|bl|condom[ií]nio|edif[ií]cio|ed|residencial|lote|quadra|torre|cozinha|dormit[óo]rio|ambiente|loja|centro|bairro|cep)\b/i

// Nome de pessoa ou empresa: ao menos duas palavras, sem números e sem começar por termo de endereço/ambiente.
export function pareceNome(s) {
  const t = String(s || '').trim()
  if (!t || /\d/.test(t) || ENDERECO.test(t)) return false
  // "Alto da Glória - Curitiba" é bairro - cidade, não nome.
  if (/\s[-–]\s/.test(t)) return false
  return t.split(/\s+/).filter((w) => w.replace(/[^A-Za-zÀ-ÿ]/g, '').length > 1).length >= 2
}

const tokens = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2)

// Nome do cliente: o arquivo do contrato da loja já vem como "CONTRATO_LE_BLANC_<cliente>.pdf",
// então ele vale mais que o texto; o texto só ganha quando confirma o mesmo nome (e traz acentos).
export function escolherNome(lido, arquivo) {
  const doArquivo = nomeDoArquivo(arquivo)
  if (!doArquivo) return lido || ''
  if (!lido) return doArquivo
  const a = new Set(tokens(doArquivo))
  return tokens(lido).filter((w) => a.has(w)).length >= 2 ? lido : doArquivo
}

// "CONTRATO_LE_BLANC_Fulano_de_Tal.pdf" → "Fulano de Tal".
export function nomeDoArquivo(arquivo) {
  const base = String(arquivo || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-.()\[\]]+/g, ' ')
  const nome = base.replace(/\b(?:contrato|contratos|assinado|assinada|le\s+blanc|leblanc|m[óo]veis|planejados|final|vers[aã]o|v\d+|digitalizado|scan|pdf|copia|c[óo]pia)\b/gi, ' ')
    .replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim()
  return pareceNome(nome) ? nome : ''
}

const limpaNome = (s) => String(s || '').split(/\s+(?:CPF|CNPJ|Normal|Especial|R\.?G|Nasc|Nascimento|Tipo|Telefone|Endere|Profiss|F[íi]sica|Jur[íi]dica|brasileir|portador|inscrit|residente|casad|solteir|divorciad|vi[uú]v)/i)[0].replace(/[,;:]+$/, '').trim()

export function parseContrato(txt) {
  const t = (txt || '').replace(/\s+/g, ' ')
  const pick = (re) => { const m = t.match(re); return m ? (m[1] || '').trim() : '' }

  // 1) Modelo do sistema: "01 · Cliente e entrega Cliente FULANO CPF / CNPJ ..."
  // 2) Contrato em texto corrido: "CONTRATANTE: FULANO, brasileiro, ... CPF ..."
  // 3) Ficha do Promob: "1058 - FULANO" (código - nome), ignorando endereço ("123 - Apartamento 4").
  const candidatos = [
    pick(/Cliente e entrega\s+Cliente\s+(.+?)\s+CPF\s*\/?\s*CNPJ/i),
    pick(/\bCONTRATANTE\s*:\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.\-]{4,80}?)(?=\s*[,;]|\s+(?:CPF|CNPJ|brasileir|portador|inscrit|residente))/i),
    pick(/\bCliente\s*:\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.\-]{4,80}?)\s*(?:CPF|CNPJ|R\.?G|NASC|Telefone)/i),
    ...[...t.matchAll(/\b\d{3,6}\s*-\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.\-]{4,60})/g)].map((m) => m[1]),
    pick(/CLIENTE\b[:\s]*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.\-]{4,60}?)\s*(?:CPF|CNPJ|R\.?G|NASC)/i),
  ].map(limpaNome)
  const cliente = candidatos.find(pareceNome) || ''

  let cpf = pick(/CPF\s*\/?\s*C?N?P?J?\b[:\s]*([\d.\-\/]{11,18})/i)
  // Qualquer CPF no texto (tolera vírgula no lugar do ponto por causa de OCR)
  if (!/\d{3}[.,]\d{3}[.,]\d{3}-\d{2}/.test(cpf)) {
    const mcpf = t.match(/\b(\d{3}[.,]\d{3}[.,]\d{3}-\d{2})\b/)
    if (mcpf) cpf = mcpf[1].replace(/,/g, '.')
  }

  const vendedor = limpaNome(pick(/Respons[áa]vel pela venda\s+(.+?)\s+Loja\b/i))
  const telefone = pick(/\bTelefone\s+(\(?\d[\d\s()\-.]{7,18}\d)/i)
  const endereco = pick(/Endere[çc]o do cliente\s+(.+?)\s+Endere[çc]o de instala/i)

  const dataStr = pick(/DATA DO CONTRATO[^\d]*(\d{2}\/\d{2}\/\d{4})/i) || pick(/(\d{2}\/\d{2}\/\d{4})/)
  const valorStr = pick(/Total (?:a ser pago conforme parcelas|contratado)[:\s]*R?\$?\s*([\d.]+,\d{2})/i)
    || pick(/TOTAL A (?:PRAZO|SER PAGO)[^\d]*([\d.]+,\d{2})/i)
    || pick(/Total (?:do pedido|a ser pago)[:\s]*R?\$?\s*([\d.]+,\d{2})/i)
    || pick(/VALOR TOTAL\s*R?\$?\s*([\d.]+,\d{2})/i)

  let data = ''
  if (dataStr) { const [d, m, a] = dataStr.split('/'); data = `${a}-${m}-${d}` }
  let valor = valorStr ? Number(valorStr.replace(/\./g, '').replace(',', '.')) : null
  // Sem o rótulo "Total" (fotos/OCR): o maior valor monetário da página, já que o total é >= qualquer item.
  if (valor === null) {
    const toks = t.match(/[\d.]+,\d{2}(?![\d-])/g) || [] // ignora fragmentos de CPF (…,429-23)
    const nums = toks.map((s) => Number(s.replace(/\./g, '').replace(',', '.'))).filter((x) => !isNaN(x) && x > 0)
    if (nums.length) valor = Math.max(...nums)
  }
  return { cliente, cpf, valor, data, vendedor, telefone, endereco }
}
