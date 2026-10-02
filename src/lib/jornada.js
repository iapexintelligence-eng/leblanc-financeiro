import { supabase } from './supabase.js'
export async function todas(consulta) {
  const out=[]
  for(let inicio=0;;inicio+=500) {
    const {data,error}=await consulta().range(inicio,inicio+499)
    if(error) throw error
    out.push(...data)
    if(data.length<500) return out
  }
}
export async function carregarJornada() {
  const [registros,config,acesso,pessoas] = await Promise.all([
    todas(()=>supabase.from('jornada_registros').select('*').order('id')),
    supabase.from('jornada_config').select('*').single(),
    supabase.auth.getUser(),
    supabase.from('jornada_acessos').select('*').eq('ativo',true).order('nome'),
  ])
  if(config.error) throw config.error
  if(pessoas.error) throw pessoas.error
  const eu=pessoas.data.find(p=>p.usuario_id===acesso.data?.user?.id)
  return {registros,config:config.data,pessoas:pessoas.data,eu}
}
export async function salvarRegistro(registro) {
  const {data,error}=await supabase.rpc('jornada_salvar',{p_tipo:registro.tipo,p_contrato:registro.contrato_id,p_dados:registro.dados,p_id:registro.id||null,p_versao:registro.versao||0})
  if(error) throw error
  return data
}
export async function anexarJornada(file) {
  if(file.size>50*1024*1024) throw new Error('O limite do arquivo é 50 MB.')
  const {data,error}=await supabase.auth.getUser()
  if(error||!data.user) throw new Error('Entre no sistema para anexar documentos.')
  const path=`${data.user.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
  const up=await supabase.storage.from('jornada-documentos').upload(path,file,{upsert:false})
  if(up.error) throw up.error
  return path
}
export async function abrirDocumento(path) {
  const {data,error}=await supabase.storage.from('jornada-documentos').createSignedUrl(path,60)
  if(error) throw error
  window.open(data.signedUrl,'_blank','noopener,noreferrer')
}
