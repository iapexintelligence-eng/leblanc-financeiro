import {calcularProposta,LIMITES_DESCONTO} from './regras.js'
import {brl} from './format.js'
export function pendenciasLiberacao(d,formas=d.formas_pagamento||[]) {
 const lista=[]
 const falta=(d.itens||[]).filter(i=>Number(i.valor)>0&&!Object.hasOwn(LIMITES_DESCONTO,i.fornecedor))
 if(falta.length)lista.push({campo:'ambientes-contrato',titulo:'Informe o fornecedor dos ambientes',texto:`Selecione Bartzen ou Menezes em: ${falta.map(i=>i.descricao||'ambiente sem descrição').join(', ')}. Isso permite conferir o limite de desconto. Se for outra indústria, a condição precisa de análise da diretoria.`})
 let c
 try{c=calcularProposta(d.itens||[],d.desconto_valor||0,d.desconto_tipo)}catch(e){lista.push({campo:'desconto-contrato',titulo:'Corrija os valores da proposta',texto:e.message});return lista}
 if(c.exigeAutorizacao&&!falta.length)lista.push({campo:'desconto-contrato',titulo:'Desconto acima do limite',texto:`Desconto aplicado: ${c.percentual.toFixed(2)}%. Limite: ${c.limite}%. Ajuste o desconto ao limite ou solicite autorização de Priscila, Andressa ou Catelli.`})
 const entrada=Number(d.entrada_percentual??60)
 if(entrada!==60)lista.push({campo:'pagamento-contrato',titulo:'Entrada diferente de 60%',texto:`Entrada informada: ${entrada}%. Ajuste para 60% ou solicite autorização da diretoria para manter a negociação.`})
 const parcelas=d.parcelas||[]
 if(formas.length&&formas.every(f=>f.forma==='Pix / À vista')&&(parcelas.length!==2||Math.abs(Number(parcelas[0]?.valor||0)-Math.round(c.final*60)/100)>0.01||parcelas[1]?.marco!=='dois_dias_antes_entrega'))lista.push({campo:'pagamento-contrato',titulo:'Pagamento à vista fora do padrão 60% + 40%',texto:`O padrão desta venda é ${brl(Math.round(c.final*60)/100)} de entrada e ${brl(c.final-Math.round(c.final*60)/100)} dois dias corridos antes da entrega. Há ${parcelas.length} parcela(s) cadastrada(s). Ajuste a simulação e as parcelas ou solicite autorização para manter essa condição.`})
 if(formas.some(f=>f.absorver))lista.push({campo:'pagamento-contrato',titulo:'Taxas assumidas pela loja',texto:'O padrão é o cliente pagar as taxas. Ajuste a simulação ou solicite autorização da diretoria para a loja absorvê-las.'})
 return lista
}
export function mesmaCondicaoComercial(d,formas,salvo) {
 if(!salvo)return false
 const campos=['itens','desconto_valor','desconto_tipo','entrada_percentual','parcelas']
 return campos.every(k=>JSON.stringify(d[k])===JSON.stringify(salvo[k]))&&JSON.stringify(formas)===JSON.stringify(salvo.formas_pagamento)
}
