import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'

const crm = supabase.schema('leblanc')

const EMPRESA = {
  nome: 'LE BLANC MOVEIS E INTERIORES LTDA', cnpj: '33.834.316/0001-38',
  end: 'Rua Camões, 556 · Alto da Rua XV · Curitiba-PR', tel: '41 99796-9618 · 41 3253-9983',
  site: 'www.leblancinteriores.com', email: 'gerencia@leblancinteriores.com',
}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const or = (v) => esc(v) || '—'

export async function imprimirContrato(d) {
  let corpo = ''
  try {
    const { data } = await crm.from('contrato_modelos').select('corpo').eq('nome', d.modelo_contrato).maybeSingle()
    corpo = data?.corpo || ''
  } catch (_) {}

  const total = d.total_pedido || (d.itens || []).reduce((s, it) => s + (Number(it.valor) || 0), 0)
  const descontoValor = d.desconto_tipo === '%' ? total * (Number(d.desconto_valor) || 0) / 100 : (Number(d.desconto_valor) || 0)
  const somaParcelas = (d.parcelas || []).reduce((s, p) => s + (Number(p.valor) || 0), 0)
  const totalPagar = somaParcelas > 0 ? somaParcelas : Math.max(0, total - descontoValor)
  const endCliente = [d.endereco, d.bairro, d.cidade, d.uf].filter(Boolean).join(', ')
  const ambientesTxt = (d.itens || []).filter((it) => it.descricao).map((it) => it.descricao).join('; ')
  const eAvista = /vista|pix/i.test(d.forma_pagamento || '') || /vista/i.test(d.condicao_pagamento || '')
  const preencher = (t) => (t || '')
    .replace(/\{\{\s*cliente_nome\s*\}\}/gi, d.cliente_nome || '')
    .replace(/\{\{\s*cliente_cpf\s*\}\}/gi, d.cliente_cpf || '')
    .replace(/\{\{\s*cliente_telefone\s*\}\}/gi, d.cliente_telefone || '')
    .replace(/\{\{\s*cliente_endereco\s*\}\}/gi, endCliente)
    .replace(/\{\{\s*projeto_ambientes\s*\}\}/gi, ambientesTxt)
  const itens = (d.itens || []).filter((it) => it.descricao || Number(it.valor) > 0)
  const linhasItens = itens.map((it, i) => `<tr>
    <td>${i + 1}</td><td>${Number(it.qtd) || 1}</td><td>${esc(it.descricao)}</td>
    <td>${or(it.fornecedor)}</td><td>${or(it.linha)}</td><td>${or(it.prazo)}</td>
    <td style="text-align:right">${brl(it.valor)}</td></tr>`).join('')
  const parcelas = (d.parcelas || []).filter((p) => Number(p.valor) > 0)
  const linhasParc = parcelas.map((p) => `<tr><td>${p.numero}</td><td>${fmtDate(p.vencimento)}</td><td style="text-align:right">${brl(p.valor)}</td></tr>`).join('')
  const clausulas = corpo
    ? preencher(corpo).split(/\n\n+/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
    : '<p class="muted">Cláusulas do modelo não cadastradas.</p>'

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Contrato ${esc(d.numero)} — ${esc(d.cliente_nome)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: center; border: 1px solid #111; padding: 8px 12px; }
  .head .logo { font-family: Georgia, serif; font-size: 20px; letter-spacing: 2px; border: 1px solid #111; padding: 6px 12px; }
  .head .co { text-align: center; flex: 1; }
  .head .co b { font-size: 12px; } .head .co div { font-size: 10px; color: #333; }
  .head .num { text-align: right; font-size: 11px; } .head .num b { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin: 0; }
  th, td { border: 1px solid #888; padding: 4px 6px; font-size: 10.5px; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 9.5px; text-transform: uppercase; letter-spacing: .5px; }
  .kv td { padding: 4px 6px; } .kv b { color: #333; }
  h1 { font-size: 13px; text-align: center; margin: 16px 0 10px; }
  .clauses p { margin: 0 0 6px; text-align: justify; font-size: 10.5px; }
  .sign { display: flex; justify-content: space-between; margin-top: 44px; }
  .sign div { width: 45%; border-top: 1px solid #111; padding-top: 5px; text-align: center; font-size: 10px; }
  .note { text-align: center; font-weight: bold; font-size: 10.5px; margin-top: 16px; }
  .muted { color: #999; } .mt { margin-top: 8px; }
  @media print { .noprint { display: none; } }
</style></head><body>
  <div class="head">
    <div class="logo">LB</div>
    <div class="co"><b>${EMPRESA.nome}</b><div>CNPJ: ${EMPRESA.cnpj}</div><div>${EMPRESA.end}</div><div>Tel: ${EMPRESA.tel}</div><div>${EMPRESA.site} · ${EMPRESA.email}</div></div>
    <div class="num">CONTRATO N.º<br><b>${esc(d.numero)}</b></div>
  </div>

  <table class="kv mt"><tr>
    <td><b>Responsável pela venda:</b> ${or(d.vendedor)}</td>
    <td><b>Loja:</b> ${or(d.loja)}</td>
    <td><b>Data:</b> ${fmtDate(d.data_contrato)}</td>
    <td><b>Tipo:</b> ${or(d.tipo_contrato)}</td>
  </tr></table>

  <table class="kv">
    <tr><td colspan="2"><b>Cliente:</b> ${or(d.cliente_nome)}</td><td><b>CPF/CNPJ:</b> ${or(d.cliente_cpf)}</td><td><b>Nasc.:</b> ${d.cliente_nascimento ? fmtDate(d.cliente_nascimento) : '—'}</td></tr>
    <tr><td><b>RG/Insc.:</b> ${or(d.cliente_rg)}</td><td><b>Telefone:</b> ${or(d.cliente_telefone)}</td><td><b>E-mail:</b> ${or(d.cliente_email)}</td><td><b>Profissão:</b> ${or(d.cliente_profissao)}</td></tr>
    <tr><td colspan="3"><b>Endereço:</b> ${or(d.endereco)} · ${or(d.bairro)}</td><td><b>${or(d.cidade)}/${or(d.uf)}</b> ${esc(d.cep)}</td></tr>
    <tr><td colspan="3"><b>Entrega:</b> ${or(d.entrega_endereco || d.endereco)}</td><td><b>Prazo:</b> ${or(d.prazo_entrega)}</td></tr>
  </table>

  <table class="mt">
    <tr><th>Item</th><th>Qtd</th><th>Descrição / Ambiente</th><th>Fornecedor</th><th>Linha</th><th>Prazo</th><th style="text-align:right">Valor</th></tr>
    ${linhasItens || '<tr><td colspan="7" class="muted">Sem itens.</td></tr>'}
    <tr><td colspan="6" style="text-align:right"><b>Total do pedido</b></td><td style="text-align:right"><b>${brl(total)}</b></td></tr>
  </table>

  <table class="kv mt"><tr><td><b>Observação:</b> ${[esc(d.led_incluso), esc(d.observacao_ambientes)].filter(Boolean).join(' · ') || '—'}</td></tr></table>

  <table class="kv mt"><tr>
    <td><b>Total a ser pago:</b> ${brl(totalPagar)}</td>
    <td><b>Data da entrada:</b> ${d.data_entrada ? fmtDate(d.data_entrada) : '—'}</td>
    <td><b>Condição de pagamento:</b> ${or(d.condicao_pagamento)}</td>
    <td><b>Forma de pagamento:</b> ${or(d.forma_pagamento)}</td>
  </tr></table>
  ${eAvista ? '<table class="kv"><tr><td><b>Pagamento à vista:</b> o saldo restante deverá ser quitado até 2 (dois) dias antes da data prevista para a entrega dos móveis.</td></tr></table>' : ''}

  <table class="mt">
    <tr><th>Parcela</th><th>Vencimento</th><th style="text-align:right">Valor</th></tr>
    ${linhasParc || '<tr><td colspan="3" class="muted">Sem parcelas.</td></tr>'}
  </table>

  <h1>CONTRATO DE COMPRA E VENDA DE PRODUTO E DE PRESTAÇÃO DE SERVIÇO</h1>
  <div class="clauses">${clausulas}</div>

  <div class="note">PARA PAGAMENTOS À VISTA, A SEGUNDA PARCELA DEVERÁ SER QUITADA ATÉ 2 (DOIS) DIAS ANTES DA DATA PREVISTA PARA A ENTREGA DOS MÓVEIS, CONDIÇÃO INDISPENSÁVEL PARA O INÍCIO DA MONTAGEM.</div>

  <div class="sign">
    <div>CONTRATADA: ${EMPRESA.nome}</div>
    <div>CONTRATANTE: ${or(d.cliente_nome)}</div>
  </div>

  <div class="noprint" style="text-align:center;margin-top:22px">
    <button onclick="window.print()" style="padding:10px 22px;font-size:14px;cursor:pointer">Imprimir / Salvar como PDF</button>
  </div>
</body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}
