import {pendenciasLiberacao,mesmaCondicaoComercial} from '../lib/pendenciasContrato.js'
import LiberacaoContrato from './LiberacaoContrato.jsx'
export default function PendenciasContrato({dados,formas,salvo,aprovacoes,podeAutorizar,aprovadora,onConcluido}) {
 const lista=pendenciasLiberacao(dados,formas)
 const mesma=mesmaCondicaoComercial(dados,formas,salvo)
 const liberado=mesma&&salvo?.status==='Emitido'
 const pendente=mesma&&salvo?.status==='Aguardando aprovação'
 const solicitacao=aprovacoes.find(a=>a.versao_atual&&!a.aprovado_em)
 const ir=campo=>document.getElementById(campo)?.scrollIntoView({behavior:'smooth',block:'start'})
 return <section aria-label="Liberação do contrato" style={{margin:'16px 0',padding:18,border:`1px solid ${liberado?'#94b8a0':'#d6a24d'}`,borderRadius:10,background:liberado?'#f0f7f2':'#fff8eb'}}>
 <h3 style={{marginTop:0}}>{liberado?'Contrato liberado para emissão':'O que falta para liberar o contrato'}</h3>
 {liberado?<p>As condições comerciais desta versão estão liberadas. Você já pode abrir o documento para conferência e assinatura.</p>:<>
 {lista.map(p=><div key={p.titulo} style={{padding:'10px 0',borderBottom:'1px solid #e9d9bb'}}><strong>{p.titulo}</strong><p style={{margin:'5px 0'}}>{p.texto}</p><button className="btn ghost sm" onClick={()=>ir(p.campo)}>Ir para corrigir</button></div>)}
 {pendente&&solicitacao&&<p><b>Motivo registrado na versão salva:</b> {solicitacao.resumo}</p>}
 {!mesma?<p><b>Depois de conferir ou corrigir, clique em Atualizar contrato.</b> O sistema verificará novamente os valores e as condições. Alterações ainda não salvas não estão liberadas.</p>:pendente?<p>Para manter uma condição excepcional, Priscila, Andressa ou Catelli precisa autorizar esta versão. Se corrigir os campos, atualize o contrato para recalcular a liberação.</p>:<p>Confira os dados e salve o contrato para verificar a liberação.</p>}
 </>}
 <LiberacaoContrato key={salvo?.id||'pendente'} solicitacao={pendente?solicitacao:null} aprovacoes={aprovacoes} pode={podeAutorizar} aprovadora={aprovadora} onConcluido={onConcluido}/>
 </section>
}
