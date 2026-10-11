import {documentoLeBlanc,esc,assinaturas,enderecoCliente,EMPRESA_CONTRATO,ENDERECO_CONTRATO} from './contratoHtml.js'
import {brl,fmtDate} from './format.js'
export function gerarHtmlAditivo(contrato,adendo) {
 const d={...contrato.dados_json,numero:contrato.numero,cliente_nome:contrato.cliente_nome,cliente_cpf:contrato.cliente_cpf}
 if(!d.numero||!d.cliente_nome)throw Error('Selecione um contrato salvo.')
 if(!adendo.data||!adendo.objeto?.trim()||!adendo.pagamento?.trim())throw Error('Preencha a data, o objeto e as condições de pagamento do documento.')
 const acrescimo=adendo.tipo==='acrescimo'
 const anterior=Number(adendo.valor_anterior),adicional=Number(adendo.valor_adicional)
 if(acrescimo&&(!Number.isFinite(anterior)||!Number.isFinite(adicional)||anterior<0||adicional<=0||adendo.valor_anterior===''))throw Error('Informe o valor anterior e o valor adicional do adendo.')
 const txt=s=>esc(s).replace(/\n/g,'<br>')
 const texto=`<h1>${acrescimo?'Termo aditivo (adendo)':'Aditivo ao contrato'}</h1><p><b>${acrescimo?'Acréscimos ao projeto':'Alteração da forma de pagamento'}</b></p><p>Referente ao contrato nº <b>${esc(d.numero)}</b>${d.data_contrato?`, firmado em ${fmtDate(d.data_contrato)}`:''}.</p><p><b>CONTRATANTE:</b> ${esc(d.cliente_nome)}, CPF/CNPJ ${esc(d.cliente_cpf)}, com endereço ${esc(enderecoCliente(d)||contrato.cliente_endereco)}.</p><p><b>CONTRATADA:</b> ${EMPRESA_CONTRATO}, CNPJ 33.834.316/0001-38, com endereço atual na ${ENDERECO_CONTRATO}.</p><h2>1. ${acrescimo?'Objeto do adendo':'Alteração do pagamento'}</h2><p>${txt(adendo.objeto)}</p><h2>2. Valor e forma de pagamento</h2><p>${txt(adendo.pagamento)}</p>${acrescimo?`<p>O valor total adicional deste adendo é de <b>${brl(adicional)}</b>, elevando o valor do contrato de <b>${brl(anterior)}</b> para <b>${brl(Math.round((anterior+adicional)*100)/100)}</b>.</p>`:''}<h2>3. Ratificação</h2><p>Permanecem inalteradas as demais cláusulas e condições do contrato original nº ${esc(d.numero)} não expressamente modificadas por este instrumento. Este aditivo integra o contrato para todos os fins.</p>${acrescimo?'<h2>4. Foro</h2><p>Fica mantido o foro estabelecido no contrato original para dirimir eventuais dúvidas ou controvérsias decorrentes deste adendo.</p>':''}<p>Curitiba/PR, ${fmtDate(adendo.data)}.</p>`
 return documentoLeBlanc(d,[texto,assinaturas(d)],{titulo:acrescimo?'Adendo ao contrato':'Aditivo ao contrato',pendente:true,aviso:'MINUTA PARA CONFERÊNCIA — a geração não confirma pagamentos nem altera o contrato. Após aprovação e assinatura, anexe o documento ao contrato.'})
}
