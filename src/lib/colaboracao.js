import { supabase } from './supabase.js'
import { todas } from './jornada.js'
export const listarItens=registro=>todas(()=>{let q=supabase.from('jornada_itens').select('*').order('id');return Array.isArray(registro)?q.in('registro_id',registro):registro?q.eq('registro_id',registro):q})
export async function salvarItem(registro,tipo,dados,item=null){
 const {data,error}=await supabase.rpc('colaboracao_salvar',{p_registro:registro,p_tipo:tipo,p_dados:dados,p_id:item?.id||null,p_versao:item?.versao||0});if(error)throw error;return data
}
export async function uploadColaboracao(file){
 if(!file||file.size>50*1024*1024)throw Error('Escolha um arquivo de até 50 MB.')
 const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw Error('Entre no sistema para anexar.')
 const path=`${data.user.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
 const r=await supabase.storage.from('jornada-anexos').upload(path,file,{upsert:false});if(r.error)throw r.error;return path
}
export async function abrirAnexo(path){
 const {data,error}=await supabase.storage.from('jornada-anexos').createSignedUrl(path,60);if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer')
}
