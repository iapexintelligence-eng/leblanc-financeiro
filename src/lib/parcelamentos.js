// Parcelamentos nos cartões: em que fatura cai cada parcela e quanto do limite ainda está preso.
// Meses = mês da fatura, "AAAA-MM". Uma compra parcelada prende no limite o valor de todas as
// parcelas que ainda vão cair; cada fatura paga devolve uma parcela ao limite.
import { cartaoDe } from './cartoes.js'

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export const rotuloMes = (ym) => { if (!ym) return '—'; const [a, m] = String(ym).split('-'); return `${MESES_PT[Number(m) - 1]}/${a.slice(2)}` }

const idx = (ym) => { const [a, m] = String(ym).slice(0, 7).split('-').map(Number); return a * 12 + (m - 1) }
const deIdx = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
export const somarMeses = (ym, n) => deIdx(idx(ym) + n)
export const mesesEntre = (de, ate) => idx(ate) - idx(de)

// Último mês com parcela (ou o mês em que foi quitado antes, se encerrado).
export const ultimoMes = (p) => somarMeses(p.primeira_parcela, Number(p.parcelas_total) - 1)
const fimEfetivo = (p) => (p.encerrado_em && mesesEntre(p.encerrado_em, ultimoMes(p)) > 0 ? p.encerrado_em : ultimoMes(p))

// Número da parcela que cai na fatura do mês (0 = nenhuma).
export function parcelaDoMes(p, ym) {
  const k = mesesEntre(p.primeira_parcela, ym) + 1
  if (k < 1 || k > Number(p.parcelas_total) || mesesEntre(fimEfetivo(p), ym) > 0) return 0
  return k
}
export const valorNoMes = (p, ym) => (parcelaDoMes(p, ym) ? Number(p.valor_parcela) || 0 : 0)

// Quanto do limite este parcelamento ainda prende depois de paga a fatura do mês.
export function presoApos(p, ym) {
  if (p.encerrado_em && mesesEntre(p.encerrado_em, ym) >= 0) return 0
  const total = Number(p.parcelas_total) || 0
  const pagas = Math.min(total, Math.max(0, mesesEntre(p.primeira_parcela, ym) + 1))
  return Math.max(0, total - pagas) * (Number(p.valor_parcela) || 0)
}
export const parcelasRestantes = (p, ym) => (Number(p.valor_parcela) ? Math.round(presoApos(p, somarMeses(ym, -1)) / Number(p.valor_parcela)) : 0)

// Por cartão e mês: soma das parcelas na fatura e limite livre depois de pagá-la.
export function projecao({ parcelamentos = [], limites = {}, cartoes = [], inicio, meses = 6 }) {
  const lista = Array.from({ length: meses }, (_, i) => somarMeses(inicio, i))
  return cartoes.map((c) => {
    const ps = parcelamentos.filter((p) => p.cartao_id === c.id)
    const limite = limites[c.id] == null || limites[c.id] === '' ? null : Number(limites[c.id])
    return {
      ...c, limite,
      presoHoje: ps.reduce((s, p) => s + presoApos(p, somarMeses(inicio, -1)), 0),
      meses: lista.map((ym) => {
        const fatura = ps.reduce((s, p) => s + valorNoMes(p, ym), 0)
        const preso = ps.reduce((s, p) => s + presoApos(p, ym), 0)
        return { ym, fatura, preso, livre: limite == null ? null : limite - preso }
      }),
    }
  })
}

const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()
export const chaveParcelamento = ({ descricao, primeira_parcela, parcelas_total, valor_parcela }) =>
  `${norm(descricao)}|${primeira_parcela}|${parcelas_total}|${Math.round(Number(valor_parcela) || 0)}`

// Compras parceladas lidas das faturas já importadas ("03/06" na fatura de out/26 → começou em ago/26).
// A mesma compra aparece em várias faturas: fica uma só, com o valor da fatura mais recente.
export function parcelamentosDasFaturas(itens = [], { aPartirDe } = {}) {
  const mapa = new Map()
  for (const it of itens) {
    const m = String(it.parcela || '').match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/)
    const valor = Number(it.valor) || 0
    const mes = String(it.mes_ref || '').slice(0, 7)
    const cartao = cartaoDe(it.cartao)
    if (!m || valor <= 0 || !/^\d{4}-\d{2}$/.test(mes) || !cartao) continue
    const atual = Number(m[1]), total = Number(m[2])
    if (!total || atual < 1 || atual > total || total > 120) continue
    const p = { cartao_id: cartao.id, descricao: String(it.descricao || '').trim(), valor_parcela: valor, parcelas_total: total, primeira_parcela: somarMeses(mes, -(atual - 1)), origem: 'fatura' }
    if (aPartirDe && mesesEntre(aPartirDe, ultimoMes(p)) < 0) continue // já terminou
    p.chave = chaveParcelamento(p)
    const k = p.cartao_id + '#' + p.chave
    const ja = mapa.get(k)
    if (!ja || mes > ja._mes) mapa.set(k, { ...p, _mes: mes })
  }
  return [...mapa.values()].map(({ _mes, ...p }) => p)
}
