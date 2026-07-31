import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'

const crm = supabase.schema('leblanc')

const EMPRESA = {
  nome: 'LE BLANC MOVEIS E INTERIORES LTDA',
  cnpj: '33.834.316/0001-38',
  end: 'Rua Camões, 556 · Alto da Rua XV · Curitiba-PR',
  tel: '41 99796-9618 · 41 3253-9983',
  site: 'www.leblancinteriores.com',
  email: 'gerencia@leblancinteriores.com',
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

export default function ContratoPDF({ contrato, parcelas }) {
  const [busy, setBusy] = useState(false)

  const gerar = async () => {
    setBusy(true)
    let corpo = ''
    try {
      const { data } = await crm.from('contrato_modelos').select('corpo').eq('nome', contrato.modelo_contrato).maybeSingle()
      corpo = data?.corpo || ''
    } catch (_) {}
    setBusy(false)

    const linhasParc = (parcelas || []).map((p) =>
      `<tr><td>${p.numero}</td><td style="text-align:right">${brl(p.valor)}</td><td>${fmtDate(p.vencimento)}</td></tr>`
    ).join('')

    const clausulas = corpo
      ? corpo.split(/\n\n+/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
      : '<p class="muted">Modelo de cláusulas não encontrado para este contrato.</p>'

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Contrato ${esc(contrato.numero)} — ${esc(contrato.cliente_nome)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .head .co { text-align: center; flex: 1; }
  .head .co b { font-size: 13px; }
  .head .co div { font-size: 10.5px; color: #333; }
  .logo { font-family: Georgia, serif; font-size: 22px; letter-spacing: 2px; }
  .num { text-align: right; font-size: 12px; }
  .num b { font-size: 15px; }
  h1 { font-size: 15px; text-align: center; margin: 8px 0 14px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
  th, td { border: 1px solid #999; padding: 5px 7px; font-size: 11px; text-align: left; }
  th { background: #f0f0f0; }
  .box { border: 1px solid #999; padding: 8px 10px; margin-bottom: 12px; font-size: 11.5px; }
  .box b { display: inline-block; min-width: 90px; color: #333; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
  .clauses p { margin: 0 0 7px; text-align: justify; font-size: 11px; }
  .sign { display: flex; justify-content: space-between; margin-top: 40px; }
  .sign div { width: 45%; border-top: 1px solid #111; padding-top: 6px; text-align: center; font-size: 10.5px; }
  .muted { color: #888; }
  @media print { .noprint { display: none; } }
</style></head><body>
  <div class="head">
    <div class="logo">LB</div>
    <div class="co"><b>${EMPRESA.nome}</b><div>CNPJ: ${EMPRESA.cnpj}</div><div>${EMPRESA.end}</div><div>Tel: ${EMPRESA.tel}</div><div>${EMPRESA.site} · ${EMPRESA.email}</div></div>
    <div class="num">CONTRATO N.º<br><b>${esc(contrato.numero)}</b></div>
  </div>

  <div class="box grid2">
    <div><b>Cliente:</b> ${esc(contrato.cliente_nome)}</div>
    <div><b>CPF/CNPJ:</b> ${esc(contrato.cliente_cpf) || '—'}</div>
    <div><b>Telefone:</b> ${esc(contrato.cliente_telefone) || '—'}</div>
    <div><b>Vendedor:</b> ${esc(contrato.vendor) || '—'}</div>
    <div style="grid-column:1/3"><b>Endereço:</b> ${esc(contrato.cliente_endereco) || '—'}</div>
  </div>

  <div class="box"><b>Ambientes / Projeto:</b><br>${esc(contrato.projeto_ambientes) || '—'}</div>

  <table>
    <tr><th>Valor de tabela</th><th>Desconto</th><th>Valor final</th><th>Forma de pagamento</th><th>Parcelas</th></tr>
    <tr>
      <td>${brl(contrato.valor_tabela)}</td>
      <td>${brl(contrato.valor_desconto)}</td>
      <td><b>${brl(contrato.valor_final)}</b></td>
      <td>${esc(contrato.forma_pagamento)}</td>
      <td>${contrato.parcelas}x</td>
    </tr>
  </table>

  <table>
    <tr><th>Parcela</th><th style="text-align:right">Valor</th><th>Vencimento</th></tr>
    ${linhasParc}
  </table>

  <h1>CONTRATO DE COMPRA E VENDA DE PRODUTO E DE PRESTAÇÃO DE SERVIÇO</h1>
  <div class="clauses">${clausulas}</div>

  <div class="sign">
    <div>CONTRATADA: ${EMPRESA.nome}</div>
    <div>CONTRATANTE: ${esc(contrato.cliente_nome)}</div>
  </div>

  <div class="noprint" style="text-align:center;margin-top:24px">
    <button onclick="window.print()" style="padding:10px 20px;font-size:14px;cursor:pointer">Imprimir / Salvar como PDF</button>
  </div>
</body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return <button className="btn" onClick={gerar} disabled={busy}>{busy ? 'Gerando…' : 'Gerar contrato (PDF)'}</button>
}
