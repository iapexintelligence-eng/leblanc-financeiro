import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

test('migrações e travas operacionais no PostgreSQL isolado',async()=>{
 const db=new PGlite()
 try {
 await db.exec(`create role authenticated; create role anon; create schema auth; create schema storage; create schema leblanc; create schema le_admin; create table le_admin.usuarios_sistema(nome text,email text,papel text,ativo boolean); create table le_admin.pagamentos(id integer primary key,data date,data_vencimento date,data_pagamento date,valor numeric);
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email','teste@example.test')$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create table leblanc.contratos(id uuid primary key default gen_random_uuid(),numero text,cliente_nome text,cliente_cpf text,cliente_telefone text,cliente_endereco text,projeto_ambientes text,vendor text,modelo_contrato text,valor_tabela numeric,desconto_tipo text,desconto_entrada numeric,valor_desconto numeric,valor_final numeric,forma_pagamento text,parcelas integer,status text,observacoes text,dados_json jsonb);
 create table leblanc.contrato_anexos(id bigint generated always as identity,contrato_id uuid,tipo text,nome_arquivo text,path text,tamanho bigint,enviado_por text);
 alter table leblanc.contratos add constraint contratos_status_check check(status in ('rascunho','ativo','quitado','cancelado'));
 alter table leblanc.contratos add constraint contratos_modelo_contrato_check check(modelo_contrato in ('leblanc','bartzen'));
 alter table leblanc.contratos add constraint contratos_forma_pagamento_check check(forma_pagamento in ('avista','cartao'));
 create table leblanc.contrato_historico(contrato_id uuid,numero text,acao text,descricao text,editado_por text,alteracoes jsonb);`)
 for(const name of ['20261002144759_jornada.sql','20261002144808_taxas.sql','20261002144904_comercial.sql','20261002144921_integracao.sql','20261002144930_colaboracao_e_revisao_mensal.sql','20261002144940_ativacao_compatibilidade_e_acessos.sql','20261002145427_aditivos_contratuais.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
 const gestor='00000000-0000-4000-8000-000000000001',vendedor='00000000-0000-4000-8000-000000000002',cid='00000000-0000-4000-8000-000000000010'
 await db.exec(`insert into auth.users(id) values('${gestor}'),('${vendedor}');
 insert into le_admin.jornada_acessos values('${gestor}','Gestão','gestor','Priscila',true),('${vendedor}','Venda','vendedor',null,true);
 insert into leblanc.contratos(id,numero,cliente_nome) values('${cid}','TESTE','Cliente sintético');
 update le_admin.jornada_config set calendario_de='2026-01-01',calendario_ate='2028-12-31',feriados=array['2026-09-28'::date];
 select set_config('test.uid','${gestor}',false);`)
 const save=async(tipo,d,id=null,v=0)=>{const q=await db.query('select * from le_admin.jornada_salvar($1,$2,$3,$4,$5)',[tipo,cid,JSON.stringify(d),id,v]);return q.rows[0]}
 const pedido=await save('pedido',{venda_data:'2026-09-25',tipo_venda:'Normal'})
 assert.equal(pedido.dados.planta_prazo,'2026-09-30')
 await assert.rejects(save('pedido',{...pedido.dados,entrada_confirmada:true},pedido.id,pedido.versao),/comprovante/)
 await assert.rejects(save('pedido',{...pedido.dados,liberacao_em:'2026-09-26'},pedido.id,pedido.versao),/checklist/)
 await assert.rejects(save('pedido',pedido.dados,pedido.id,99),/outra pessoa/)
 const assist=await save('assistencia',{identificada:'2026-09-01',descricao:'Teste',status:'Identificada'})
 assert.ok(assist.dados.vencimento)
 await assert.rejects(save('assistencia',{...assist.dados,status:'Resolvida'},assist.id,assist.versao),/Confirme/)
 await assert.rejects(save('assistencia',{...assist.dados,identificada:'2026-09-02'},assist.id,assist.versao),/reiniciar/)
 await db.exec(`select set_config('test.uid','${vendedor}',false)`)
 await assert.rejects(save('assistencia',{identificada:'2026-09-01',descricao:'Teste',status:'Identificada'}),/logística/)
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 const proposta={modelo_contrato:'Le Blanc',forma_pagamento:'Pix / À vista',regras_versao:'2026-09-28',numero:'COMERCIAL',cliente_nome:'Sintético',itens:[{valor:50000,qtd:1,fornecedor:'Bartzen'}],desconto_tipo:'pct',desconto_valor:40,formas_pagamento:[{forma:'Pix / À vista',valor:34500}],parcelas:[{numero:1,valor:20700,vencimento:'2026-09-28'},{numero:2,valor:13800,marco:'dois_dias_antes_entrega'}]}
 const novo=await db.query('select le_admin.comercial_salvar(null,$1) as c',[JSON.stringify(proposta)])
 assert.equal(Number(novo.rows[0].c.valor_final),34500)
 const alta={...proposta,numero:'ALTA',desconto_valor:45,formas_pagamento:[{forma:'Pix / À vista',valor:31625}],parcelas:[{numero:1,valor:31625,vencimento:'2026-09-28'}]}
 const pend=await db.query('select le_admin.comercial_salvar(null,$1) as c',[JSON.stringify(alta)])
 assert.equal(pend.rows[0].c.status,'Aguardando aprovação')
 const ap=await db.query('select id from le_admin.comercial_aprovacoes where contrato_id=$1',[pend.rows[0].c.id])
 await db.query('select le_admin.comercial_aprovar($1)',[ap.rows[0].id])
 const aprovado=await db.query('select status from leblanc.contratos where id=$1',[pend.rows[0].c.id])
 assert.equal(aprovado.rows[0].status,'Emitido')
 // Segurança e trilha completa com pessoas/arquivos sintéticos.
 const montador='00000000-0000-4000-8000-000000000003'
 await db.exec(`insert into auth.users(id) values('${montador}');insert into le_admin.jornada_acessos values('${montador}','Montador teste','montador',null,true);insert into storage.objects(bucket_id,name) values('jornada-documentos','teste/comprovante');`)
 let j=await save('pedido',{...pedido.dados,grupo_criado:true,imagens_enviadas:true,grupo_arquivo:'teste/comprovante',imagens_arquivo:'teste/comprovante',planta_arquivo:'teste/comprovante',planta_enviada_em:'2026-09-25',entrada_confirmada_arquivo:'teste/comprovante',entrada_confirmada:true,liberacao_em:'2026-09-25'},pedido.id,pedido.versao)
 assert.equal(j.dados.medicao_prazo,'2026-09-30')
 j=await save('pedido',{...j.dados,medicao_em:'2026-09-25',correcao_em:'2026-09-25',aprovacao_em:'2026-09-25',guias_arquivo:'teste/comprovante',implantacao_em:'2026-09-25',pedido_fabrica:'F-1'},j.id,j.versao)
 const entrega=j.dados.entrega_prazo
 j=await save('pedido',{...j.dados,fabrica_paga:true,fabrica_paga_arquivo:'teste/comprovante',carregamento_em:'2026-09-25',cliente_recebe_em:'2026-09-25',aceite_arquivo:'teste/comprovante'},j.id,j.versao)
 assert.equal(j.dados.entrega_prazo,entrega)
 const reserva=await save('agenda',{montador_id:montador,inicio:'2026-10-01',fim:'2026-10-03'})
 await assert.rejects(save('agenda',{...reserva.dados,confirmada:true},reserva.id,reserva.versao),/quitação/)
 await assert.rejects(save('agenda',{montador_id:montador,inicio:'2026-10-02',fim:'2026-10-04'}),/reservado/)
 j=await save('pedido',{...j.dados,saldo_confirmado:true,saldo_confirmado_arquivo:'teste/comprovante'},j.id,j.versao)
 await save('agenda',{...reserva.dados,confirmada:true},reserva.id,reserva.versao)
 await assert.rejects(save('pedido',{...j.dados,saldo_confirmado:false},j.id,j.versao),/estorno/)
 let frete=await save('frete',{origem:'A',destino:'B',prestador:'Teste',motivo:'Retirada',valor:'100',status:'Solicitado',excecao_motivo:'Rota sem tabela',excecao_valor:'100'})
 await assert.rejects(save('frete',{...frete.dados,status:'Liberado para pagamento',evidencia_arquivo:'teste/comprovante'},frete.id,frete.versao),/autorizado/)
 frete=await save('frete',{...frete.dados,autorizar:true},frete.id,frete.versao)
 assert.equal(frete.dados.autorizado_por,'Priscila')
 frete=await save('frete',{...frete.dados,status:'Pago',evidencia_arquivo:'teste/comprovante',pagamento_arquivo:'teste/comprovante'},frete.id,frete.versao)
 await assert.rejects(save('frete',{...frete.dados,valor:'150'},frete.id,frete.versao),/autorizado|imutável/)
 await assert.rejects(db.query('select le_admin.comercial_salvar(null,$1)',[JSON.stringify({...proposta,numero:'FORJADO',parcelas:[{numero:1,valor:40000,vencimento:'2026-09-28'}]})]),/divergem/)
 await db.exec('select le_admin.jornada_gerar_alertas();select le_admin.jornada_gerar_alertas();')
 // Complementos: controle de autoria, versões, bloqueios e fechamento mensal.
 const item=async(tipo,d,id=null,v=0)=>(await db.query('select * from le_admin.colaboracao_salvar($1,$2,$3,$4,$5)',[j.id,tipo,JSON.stringify(d),id,v])).rows[0]
 const tarefaDados={setor:'correcao',titulo:'Devolução técnica',descricao:'Corrigir planta antes da entrega',prazo:'2026-10-02',responsavel_papel:'correcao',bloqueia:'entrega_em'}
 const tarefa=await item('tarefa',tarefaDados)
 await assert.rejects(save('pedido',{...j.dados,entrega_em:'2026-09-26'},j.id,j.versao),/pendência bloqueante/)
 await assert.rejects(item('tarefa',{...tarefaDados,prazo:'2026-10-03',concluida:true,conclusao:'Corrigida'},tarefa.id,tarefa.versao),/Prazo e atribuição/)
 const feita=await item('tarefa',{...tarefaDados,concluida:true,conclusao:'Nova planta conferida'},tarefa.id,tarefa.versao)
 assert.equal(feita.dados.concluida,true)
 await assert.rejects(item('tarefa',{...tarefaDados,concluida:false},feita.id,feita.versao),/concluída é preservada/)
 await db.query("insert into storage.objects(bucket_id,name) values('jornada-anexos',$1)",[gestor+'/guia.pdf'])
 const doc=await item('documento',{setor:'correcao',titulo:'Guias',arquivo:gestor+'/guia.pdf',nome:'guia.pdf'})
 const doc2=await item('documento',{setor:'correcao',titulo:'Guias revisadas',arquivo:gestor+'/guia.pdf',nome:'guia.pdf',grupo:doc.dados.grupo})
 assert.equal(doc2.dados.revisao,2)
 await assert.rejects(item('documento',{setor:'correcao',titulo:'Guias',arquivo:'outro/arquivo'}),/arquivo privado próprio/)
 await assert.rejects(item('documento',{setor:'correcao',titulo:'Alterado'},doc.id,1),/preservado/)
 const exc=await item('excecao',{setor:'financeiro',titulo:'Pagamento parcial',categoria:'Pagamento parcial',descricao:'Solicitação para análise'})
 assert.equal(exc.dados.status,'Em análise')
 const decisao=await db.query('select * from le_admin.colaboracao_excecao_decidir($1,$2,$3,$4)',[exc.id,'Em tratamento','Conferir valores com Leia',exc.versao])
 assert.equal(decisao.rows[0].dados.decidido_por,'Priscila')
 await assert.rejects(db.query('select le_admin.colaboracao_excecao_decidir($1,$2,$3,$4)',[exc.id,'Resolvida','',decisao.rows[0].versao]),/providências/)
 await db.query('select le_admin.colaboracao_excecao_decidir($1,$2,$3,$4)',[exc.id,'Resolvida','Tratamento documentado',decisao.rows[0].versao])
 // Alterações da operação não reiniciam o prazo contratual.
 assert.equal((await db.query('select dados from le_admin.jornada_registros where id=$1',[j.id])).rows[0].dados.entrega_prazo,entrega)
 const ausencia=(await db.query('select * from le_admin.montador_indisponivel($1,$2,$3,$4)',[montador,'2026-11-10','2026-11-15','Férias'])).rows[0]
 await assert.rejects(save('agenda',{montador_id:montador,inicio:'2026-11-12',fim:'2026-11-13'}),/indisponível/)
 await assert.rejects(db.query('select le_admin.montador_cancelar_indisponibilidade($1,$2)',[ausencia.id,'']),/motivo/)
 await db.query('select le_admin.montador_cancelar_indisponibilidade($1,$2)',[ausencia.id,'Férias remarcadas'])
 await save('agenda',{montador_id:montador,inicio:'2026-11-12',fim:'2026-11-13',dias_estimados:2})
 await assert.rejects(save('agenda',{montador_id:montador,inicio:'2026-11-20',fim:'2026-11-21',dias_estimados:-1}),/positiva/)
 await assert.rejects(db.query('select le_admin.montador_indisponivel($1,$2,$3,$4)',[montador,'2026-10-01','2026-10-03','Conflito']),/reservada/)
 const checks={obrigacoes:true,documentos:true,pagamentos:true,recebimentos:true,conciliacao:true,duplicidades:true,rateios:true}
 const revisar=async(c,v=0,fechar=false,reabrir=false,motivo='')=>(await db.query('select * from le_admin.revisao_mensal_salvar($1,$2,$3,$4,$5,$6,$7)',['2026-08-01',JSON.stringify(c),'Revisão de teste',v,fechar,reabrir,motivo])).rows[0]
 await db.exec("insert into le_admin.pagamentos values(1,'2026-08-01','2026-08-05',null,100)")
 await assert.rejects(revisar({},0,true),/todas as conferências/)
 const revisao=await revisar(checks,0,true)
 await assert.rejects(db.exec('update le_admin.pagamentos set valor=101 where id=1'),/Mês conferido/)
 await assert.rejects(db.exec('delete from le_admin.pagamentos where id=1'),/Mês conferido/)
 await assert.rejects(db.exec("update le_admin.pagamentos set data='2026-09-01',data_vencimento='2026-09-05' where id=1"),/Mês conferido/)
 await assert.rejects(revisar(checks,0),/outra pessoa/)
 await assert.rejects(revisar(checks,revisao.versao,false,true),/justificativa/)
 await db.exec(`select set_config('test.uid','${vendedor}',false)`)
 await assert.rejects(revisar(checks,revisao.versao,false,true,'Teste'),/Somente Leia/)
 assert.equal((await db.query("select le_admin.colaboracao_ler($1,'financeiro') as ok",[j.id])).rows[0].ok,false)
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 const reaberta=await revisar(checks,revisao.versao,false,true,'Correção de lançamento duplicado')
 assert.equal(reaberta.status,'Em revisão')
 await db.exec('update le_admin.pagamentos set valor=101 where id=1')
 assert.equal((await db.query('select count(*)::int as n from le_admin.revisoes_mensais_eventos')).rows[0].n,2)
 // Aditivos preservam os valores do contrato e exigem arquivo privado.
 await db.query("insert into storage.objects(bucket_id,name) values('comercial-documentos',$1)",[gestor+'/aditivo.pdf'])
 const ad=(await db.query('select * from le_admin.aditivo_anexar($1,$2,$3,$4,$5,$6,$7)',[cid,'2026-09-28','Inclusão de ambiente',true,false,gestor+'/aditivo.pdf','aditivo.pdf'])).rows[0]
 assert.equal(ad.numero,1)
 assert.equal(ad.altera_valor,true)
 await assert.rejects(db.query('select le_admin.aditivo_anexar($1,$2,$3,$4,$5,$6,$7)',[cid,'2026-09-28','Duplicado',true,false,gestor+'/aditivo.pdf','aditivo.pdf']),/já está registrado/)
 await assert.rejects(db.query('select le_admin.aditivo_anexar($1,$2,$3,$4,$5,$6,$7)',[cid,'2026-09-28','Sem arquivo',false,false,'inexistente','x.pdf']),/documento assinado/)
 assert.equal((await db.query('select dados from le_admin.jornada_registros where id=$1',[j.id])).rows[0].dados.entrega_prazo,entrega)
 // Vendedor não lê contratos alheios nem altera registros por acesso direto.
 await db.exec(`grant usage on schema leblanc to authenticated;grant usage on schema auth to authenticated;select set_config('test.uid','${vendedor}',false);set role authenticated;`)
 assert.equal((await db.query('select count(*)::int as n from leblanc.contratos')).rows[0].n,0)
 await assert.rejects(db.exec("delete from leblanc.contratos"),/permission denied/)
 await db.exec('reset role')
 // RLS: montador não lê informações financeiras nem outras escalas.
 await db.exec(`grant usage on schema auth to authenticated;select set_config('test.uid','${montador}',false);set role authenticated;`)
 const visiveis=await db.query('select tipo,dados from le_admin.jornada_registros')
 assert.equal(visiveis.rows.length,1);assert.equal(visiveis.rows[0].tipo,'agenda')
 await assert.rejects(db.query("update le_admin.jornada_registros set dados='{}'"),/permission denied/)
 await db.exec('reset role')

 } finally {await db.close()}
})

