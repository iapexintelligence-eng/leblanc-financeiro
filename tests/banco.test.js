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
 create table leblanc.contrato_historico(contrato_id uuid,numero text,acao text,descricao text,editado_por text,alteracoes jsonb);
 create table le_admin.contas_bancarias(id integer primary key,nome text,banco text,saldo numeric,ativo boolean default true,updated_at timestamp,data_saldo_base date);
 create table le_admin.a_receber(id serial primary key,cliente_nome text,descricao text,valor_parcela numeric,data_prevista date,data_recebimento date,status text default 'Pendente',forma_recebimento text,observacoes text,conta_bancaria_id integer);`)
 for(const name of ['20261002144759_jornada.sql','20261002144808_taxas.sql','20261002144904_comercial.sql','20261002144921_integracao.sql','20261002144930_colaboracao_e_revisao_mensal.sql','20261002144940_ativacao_compatibilidade_e_acessos.sql','20261002145427_aditivos_contratuais.sql','20261011193842_xml_final_conferencia.sql','20261011201612_importacao_revisoes_preservada.sql','20261011220000_etapas_historicas.sql','20261011230000_recebimentos_com_comprovante.sql','20261013140000_vendedor_ve_suas_vendas.sql','20261013150000_medicao_tecnica_rodrigo.sql','20261013160000_gerente_vendas_fabricio.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/20261011223808_numeracao_contratos_diaria.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/20261011225405_registro_liberacao_comercial.sql',import.meta.url),'utf8'))
 const gestor='00000000-0000-4000-8000-000000000001',vendedor='00000000-0000-4000-8000-000000000002',cid='00000000-0000-4000-8000-000000000010'
 await db.exec(`insert into auth.users(id) values('${gestor}'),('${vendedor}');
 insert into le_admin.jornada_acessos values('${gestor}','Gestão','gestor','Priscila',true),('${vendedor}','Venda','vendedor',null,true);
 insert into leblanc.contratos(id,numero,cliente_nome) values('${cid}','TESTE','Cliente sintético');
 update le_admin.jornada_config set calendario_de='2026-01-01',calendario_ate='2028-12-31',feriados=array['2026-09-28'::date];
 select set_config('test.uid','${gestor}',false);`)
 const save=async(tipo,d,id=null,v=0)=>{const q=await db.query('select * from le_admin.jornada_salvar($1,$2,$3,$4,$5)',[tipo,cid,JSON.stringify(d),id,v]);return q.rows[0]}
 const save2=async(c,d,id,v)=>{const q=await db.query('select * from le_admin.jornada_salvar($1,$2,$3,$4,$5)',['pedido',c,JSON.stringify(d),id,v]);return q.rows[0]}
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
 const criarNumero=async(data)=>(await db.query('select le_admin.comercial_salvar(null,$1) as c',[JSON.stringify({...proposta,data_contrato:data})])).rows[0].c
 const dia1=await criarNumero('2027-03-01'),dia2=await criarNumero('2027-03-01'),outroDia=await criarNumero('2027-03-02')
 assert.equal(dia1.numero,'20270301-01');assert.equal(dia2.numero,'20270301-02');assert.equal(outroDia.numero,'20270302-01')
 const editado=(await db.query('select le_admin.comercial_salvar($1,$2) as c',[dia1.id,JSON.stringify({...dia1.dados_json,numero:'ALTERAR-NAO'})])).rows[0].c
 assert.equal(editado.numero,dia1.numero);assert.equal(editado.dados_json.numero,dia1.numero)
 await db.exec("insert into leblanc.contratos(numero,cliente_nome) values('20270303-99','Histórico sintético')")
 assert.equal((await criarNumero('2027-03-03')).numero,'20270303-100')
 const alta={...proposta,numero:'ALTA',desconto_valor:45,formas_pagamento:[{forma:'Pix / À vista',valor:31625}],parcelas:[{numero:1,valor:31625,vencimento:'2026-09-28'}]}
 const pend=await db.query('select le_admin.comercial_salvar(null,$1) as c',[JSON.stringify(alta)])
 assert.equal(pend.rows[0].c.status,'Aguardando aprovação')
 const ap=await db.query('select id from le_admin.comercial_aprovacoes where contrato_id=$1',[pend.rows[0].c.id])
 await db.query('select le_admin.comercial_aprovar($1)',[ap.rows[0].id])
 const aprovado=await db.query('select status from leblanc.contratos where id=$1',[pend.rows[0].c.id])
 assert.equal(aprovado.rows[0].status,'Emitido')
 const wh=(await db.query('select le_admin.comercial_salvar(null,$1) as c',[JSON.stringify(alta)])).rows[0].c
 const wid=(await db.query('select id from le_admin.comercial_aprovacoes where contrato_id=$1',[wh.id])).rows[0].id
 const liberar=(nome='Andressa',canal='WhatsApp',arquivo=null,data='2026-09-28')=>db.query('select le_admin.comercial_registrar_liberacao($1,$2,$3,$4,$5,$6)',[wid,nome,data,canal,arquivo,'Autorização sintética'])
 await assert.rejects(liberar(),/comprovante/)
 await assert.rejects(liberar('Outra pessoa'),/Priscila/)
 await assert.rejects(liberar('Andressa','Sistema'),/próprio acesso/)
 await assert.rejects(liberar('Andressa','WhatsApp',null,'2099-01-01'),/data futura/)
 const provaLiberacao=gestor+'/autorizacao-teste.pdf'
 await db.query("insert into storage.objects(bucket_id,name) values('jornada-documentos',$1)",[provaLiberacao])
 await db.exec(`select set_config('test.uid','${vendedor}',false)`)
 await assert.rejects(liberar('Andressa','WhatsApp',provaLiberacao),/diretoria/)
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 await liberar('Andressa','WhatsApp',provaLiberacao)
 const audit=(await db.query('select * from le_admin.comercial_aprovacoes where id=$1',[wid])).rows[0]
 assert.equal(audit.aprovadora,'Andressa');assert.equal(audit.aprovado_por,gestor);assert.equal(audit.canal_autorizacao,'WhatsApp');assert.equal(audit.comprovante_autorizacao,provaLiberacao)
 assert.equal((await db.query('select status from leblanc.contratos where id=$1',[wh.id])).rows[0].status,'Emitido')
 await assert.rejects(liberar('Andressa','WhatsApp',provaLiberacao),/preservado/)
 // Segurança e trilha completa com pessoas/arquivos sintéticos.
 const montador='00000000-0000-4000-8000-000000000003'
 await db.exec(`insert into auth.users(id) values('${montador}');insert into le_admin.jornada_acessos values('${montador}','Montador teste','montador',null,true);insert into storage.objects(bucket_id,name) values('jornada-documentos','teste/comprovante');`)
 let j=await save('pedido',{...pedido.dados,grupo_criado:true,imagens_enviadas:true,grupo_arquivo:'teste/comprovante',imagens_arquivo:'teste/comprovante',planta_arquivo:'teste/comprovante',planta_enviada_em:'2026-09-25',entrada_confirmada_arquivo:'teste/comprovante',entrada_confirmada:true,liberacao_em:'2026-09-25'},pedido.id,pedido.versao)
 assert.equal(j.dados.medicao_prazo,'2026-09-30')
 j=await save('pedido',{...j.dados,medicao_em:'2026-09-25',correcao_em:'2026-09-25',aprovacao_em:'2026-09-25',guias_arquivo:'teste/comprovante',pedido_fabrica:'F-1'},j.id,j.versao)
 // XML final corrigido e OK da Leia por versão antes da implantação.
 await assert.rejects(save('pedido',{...j.dados,implantacao_em:'2026-09-25'},j.id,j.versao),/XML final corrigido e o OK/)
 const xmlPath=gestor+'/final.xml',hashA='a'.repeat(64),hashB='b'.repeat(64)
 await db.query("insert into storage.objects(bucket_id,name) values('jornada-documentos',$1)",[xmlPath])
 const analise=async()=>(await db.query('select le_admin.xml_analise($1) as a',[cid])).rows[0].a
 assert.equal((await analise()).resultado,'Bloqueado')
 await assert.rejects(db.query('select le_admin.xml_registrar($1,$2,$3)',[cid,'final',JSON.stringify({arquivo:'outro/final.xml',conteudo_hash:hashA,total_tabela:50000})]),/Anexe o arquivo/)
 await assert.rejects(db.query('select le_admin.xml_registrar($1,$2,$3)',[cid,'final',JSON.stringify({arquivo:xmlPath,conteudo_hash:hashA})]),/falha de leitura/)
 const orig=(await db.query('select * from le_admin.xml_registrar($1,$2,$3)',[cid,'original',JSON.stringify({arquivo:xmlPath,nome_arquivo:'venda.xml',conteudo_hash:hashB,total_tabela:50000,ambientes:[{descricao:'Cozinha',valor:30000},{descricao:'Sala',valor:20000}]})])).rows[0]
 assert.equal(orig.versao,1)
 const fin1=(await db.query('select * from le_admin.xml_registrar($1,$2,$3)',[cid,'final',JSON.stringify({arquivo:xmlPath,nome_arquivo:'final.xml',conteudo_hash:hashA,total_tabela:52000,fornecedor:'Bartzen',ambientes:[{descricao:'Cozinha',valor:32000},{descricao:'Sala',valor:20000}]})])).rows[0]
 await assert.rejects(db.query('select le_admin.xml_registrar($1,$2,$3)',[cid,'final',JSON.stringify({arquivo:xmlPath,conteudo_hash:hashA,total_tabela:52000})]),/versão vigente/)
 let a1=await analise()
 assert.equal(a1.resultado,'Precisa conferir')
 assert.ok(a1.motivos.some(m=>/Custos não informados/.test(m.texto)))
 assert.ok(a1.motivos.some(m=>/Total de tabela mudou/.test(m.texto)))
 assert.equal(a1.comparacao.length,1)
 assert.ok(a1.motivos.some(m=>/Margem mínima não configurada/.test(m.texto)))
 // Prejuízo bloqueia o OK até autorização da aprovadora para estes valores.
 const custos=async(c,v)=>(await db.query('select * from le_admin.xml_custos_salvar($1,$2,$3)',[fin1.id,JSON.stringify(c),v])).rows[0]
 await assert.rejects(custos({fabrica:1,receita:100},0),/Justifique/)
 let cu=await custos({fabrica:60000,kits:0,frete:0,montagem:0,taxas:0,receita:51750,receita_motivo:'Valor negociado do contrato'},0)
 a1=await analise()
 assert.equal(a1.resultado,'Bloqueado')
 await assert.rejects(db.query('select le_admin.xml_conferir($1,$2,$3)',[fin1.id,a1.valores_hash,'']),/bloqueada/)
 await db.query('select le_admin.xml_autorizar_excecao($1,$2,$3)',[fin1.id,a1.valores_hash,'Cliente estratégico'])
 assert.notEqual((await analise()).resultado,'Bloqueado')
 // Mudança de custos invalida a autorização e exige nova conferência.
 await assert.rejects(custos({fabrica:20000},0),/outra pessoa/)
 cu=await custos({fabrica:30000,kits:1000,frete:500,montagem:2000,taxas:800,receita:51750,receita_motivo:'Valor negociado do contrato'},cu.versao)
 a1=await analise()
 assert.equal(Number(a1.custo_total),34300)
 assert.equal(Number(a1.margem),33.72)
 await db.query('select le_admin.xml_margem_minima($1)',[40])
 a1=await analise()
 assert.ok(a1.motivos.some(m=>/abaixo do mínimo/.test(m.texto)))
 await db.query('select le_admin.xml_margem_minima($1)',[25])
 a1=await analise()
 await assert.rejects(db.query('select le_admin.xml_conferir($1,$2,$3)',[fin1.id,'0'.repeat(32),'']),/Valores mudaram/)
 await db.query('select le_admin.xml_conferir($1,$2,$3)',[fin1.id,a1.valores_hash,'Conferi os valores e a margem'])
 assert.equal((await analise()).ok_valido,true)
 cu=await custos({fabrica:31000,kits:1000,frete:500,montagem:2000,taxas:800,receita:51750,receita_motivo:'Valor negociado do contrato'},cu.versao)
 a1=await analise()
 assert.equal(a1.ok_valido,false)
 assert.ok(a1.motivos.some(m=>/OK anterior invalidado/.test(m.texto)))
 await assert.rejects(save('pedido',{...j.dados,implantacao_em:'2026-09-25'},j.id,j.versao),/OK da Leia/)
 await db.query('select le_admin.xml_conferir($1,$2,$3)',[fin1.id,a1.valores_hash,'Reconferido'])
 // Nova versão do XML final também invalida o OK.
 const fin2=(await db.query('select * from le_admin.xml_registrar($1,$2,$3)',[cid,'final',JSON.stringify({arquivo:xmlPath,nome_arquivo:'final-v2.xml',conteudo_hash:'c'.repeat(64),total_tabela:52500,ambientes:[]})])).rows[0]
 assert.equal(fin2.versao,2)
 assert.equal((await analise()).ok_valido,false)
 await assert.rejects(db.query('select le_admin.xml_custos_salvar($1,$2,$3)',[fin1.id,JSON.stringify({fabrica:1}),0]),/mais recente/)
 await db.query('select le_admin.xml_custos_salvar($1,$2,$3)',[fin2.id,JSON.stringify({fabrica:31000,kits:1000,frete:500,montagem:2000,taxas:800,receita:51750,receita_motivo:'Valor negociado do contrato'}),0])
 a1=await analise()
 await db.query('select le_admin.xml_conferir($1,$2,$3)',[fin2.id,a1.valores_hash,'Versão 2 conferida'])
 const painel=(await db.query('select le_admin.xml_painel() as p')).rows[0].p
 assert.equal(painel[0].registro_id,j.id);assert.equal(painel[0].ok_valido,true)
 j=await save('pedido',{...j.dados,implantacao_em:'2026-09-25'},j.id,j.versao)
 assert.equal(j.dados.implantacao_em,'2026-09-25')
 await assert.rejects(db.query('select le_admin.xml_registrar($1,$2,$3)',[cid,'final',JSON.stringify({arquivo:xmlPath,conteudo_hash:'d'.repeat(64),total_tabela:1})]),/já implantado/)
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
 // Bloco importado da planilha de revisões não é alterado nem removido por edições.
 await db.query('update le_admin.jornada_registros set dados=dados||$2::jsonb where id=$1',[j.id,JSON.stringify({importacao_revisoes:{aba:'SETEMBRO',linha:3}})])
 const comImp=(await db.query('select * from le_admin.jornada_registros where id=$1',[j.id])).rows[0]
 const salvo=await save('pedido',{...comImp.dados,importacao_revisoes:{aba:'ALTERADA'}},comImp.id,comImp.versao)
 assert.equal(salvo.dados.importacao_revisoes.aba,'SETEMBRO')
 const sem={...salvo.dados};delete sem.importacao_revisoes
 assert.equal((await save('pedido',sem,salvo.id,salvo.versao)).dados.importacao_revisoes.linha,3)
 j=(await db.query('select * from le_admin.jornada_registros where id=$1',[j.id])).rows[0]
 // Etapas já realizadas nas fichas da planilha: com justificativa, em sequência e sem o checklist inicial.
 const cid2='00000000-0000-4000-8000-000000000020',cid3='00000000-0000-4000-8000-000000000030'
 await db.exec(`insert into leblanc.contratos(id,numero,cliente_nome) values('${cid2}','HIST','Cliente planilha'),('${cid3}','NOVO','Cliente novo')`)
 const hist=(await db.query("insert into le_admin.jornada_registros(tipo,contrato_id,dados,criado_por) values('pedido',$1,$2,$3) returning *",[cid2,JSON.stringify({cliente_nome:'Cliente planilha',importacao_revisoes:{setor_codigo:'liberacao',importado_em:'2026-10-11'}}),gestor])).rows[0]
 const hreg=(id,v,m,jus,pf=null)=>db.query('select * from le_admin.jornada_registrar_historico($1,$2,$3,$4,$5)',[id,v,JSON.stringify(m),jus,pf]).then((q)=>q.rows[0])
 await assert.rejects(hreg(hist.id,hist.versao,{liberacao_em:'2026-05-05'},'curta'),/mínimo/)
 await assert.rejects(hreg(hist.id,hist.versao,{medicao_em:'2026-05-27'},'Planilha CONTROLE DE REVISÕES'),/etapa anterior/)
 await assert.rejects(hreg(hist.id,hist.versao,{liberacao_em:'2026-05-30',medicao_em:'2026-05-27'},'Planilha CONTROLE DE REVISÕES'),/anterior a/)
 const semImp=(await db.query("insert into le_admin.jornada_registros(tipo,contrato_id,dados,criado_por) values('pedido',$1,'{}',$2) returning *",[cid3,gestor])).rows[0]
 await assert.rejects(hreg(semImp.id,semImp.versao,{liberacao_em:'2026-05-05'},'Planilha CONTROLE DE REVISÕES'),/planilha de revisões/)
 await db.query('delete from le_admin.jornada_registros where id=$1',[semImp.id])
 const h1=await hreg(hist.id,hist.versao,{liberacao_em:'2026-05-05',medicao_em:'2026-05-27',correcao_em:'2026-06-10',aprovacao_em:'2026-06-20',implantacao_em:'2026-07-01'},'Planilha CONTROLE DE REVISÕES, aba MAIO','PF-123')
 assert.equal(Object.keys(h1.dados.historico).length,5)
 assert.equal(h1.dados.pedido_fabrica,'PF-123')
 assert.ok(h1.dados.correcao_prazo&&h1.dados.entrega_prazo)
 // Edição normal da ficha continua funcionando e não altera nem injeta histórico.
 const h2=await save2(cid2,{...h1.dados,observacao:'ok',historico:{}},h1.id,h1.versao)
 assert.equal(Object.keys(h2.dados.historico).length,5)
 await assert.rejects(save2(cid2,{...h2.dados,medicao_em:'2026-05-28'},h2.id,h2.versao),/não pode ser alterad/)
 assert.equal((await save2(cid,{...j.dados,historico:{implantacao_em:{data:'2026-01-01'}}},j.id,j.versao)).dados.historico,undefined)
 await assert.rejects(hreg(h2.id,h2.versao,{cliente_recebe_em:'2099-01-01'},'Planilha CONTROLE DE REVISÕES'),/futura/)
 await db.exec(`select set_config('test.uid','${vendedor}',false)`)
 await assert.rejects(hreg(h2.id,h2.versao,{cliente_recebe_em:'2026-08-01'},'Planilha CONTROLE DE REVISÕES'),/permissão/)
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 j=(await db.query('select * from le_admin.jornada_registros where id=$1',[j.id])).rows[0]
 // Recebimento com comprovante: cartão quita várias parcelas de uma vez, parcial fica em aberto, estorno devolve.
 await db.exec(`create trigger trg_saldo_recebimento after insert or update on le_admin.a_receber for each row execute function le_admin.fn_saldo_recebimento();
 insert into le_admin.contas_bancarias(id,nome,saldo,data_saldo_base) values(1,'Sicoob',1000,'2026-01-01');
 insert into le_admin.a_receber(id,cliente_nome,descricao,valor_parcela,data_prevista,conta_bancaria_id) values(101,'Cliente cartão','1/3',1000,'2026-09-10',1),(102,'Cliente cartão','2/3',1000,'2026-10-10',1),(103,'Cliente cartão','3/3',1000,'2026-11-10',1),(104,'Cliente pix','Saldo',5000,'2026-10-01',null);`)
 await db.query("insert into storage.objects(bucket_id,name) values('jornada-documentos',$1),('jornada-documentos',$2),('jornada-documentos',$3)",[gestor+'/c1.pdf',gestor+'/c2.pdf',vendedor+'/c3.pdf'])
 const lancar=(ids,data,valor,forma,conta,comp)=>db.query('select * from le_admin.recebimento_lancar($1,$2,$3,$4,$5,$6)',[ids,data,valor,forma,conta,comp]).then((q)=>q.rows[0])
 await assert.rejects(lancar([101],'2026-10-05',1000,'Pix',1,null),/comprovante/)
 await assert.rejects(lancar([101],'2026-10-05',1000,'Pix',1,vendedor+'/c3.pdf'),/comprovante/)
 await assert.rejects(lancar([101,102,103],'2026-10-05',3000.5,'Cartão de crédito',1,gestor+'/c1.pdf'),/maior que o saldo/)
 await assert.rejects(lancar([101],'2099-01-01',1000,'Pix',1,gestor+'/c1.pdf'),/futura/)
 const cartao=await lancar([101,102,103],'2026-10-05',3000,'Cartão de crédito',1,gestor+'/c1.pdf')
 assert.equal((await db.query("select count(*)::int n from le_admin.a_receber where id in (101,102,103) and status='Recebido' and valor_recebido=1000 and data_recebimento='2026-10-05'")).rows[0].n,3)
 assert.equal(Number((await db.query('select saldo from le_admin.contas_bancarias where id=1')).rows[0].saldo),4000)
 await assert.rejects(lancar([101],'2026-10-05',10,'Pix',1,gestor+'/c2.pdf'),/já está recebida/)
 await assert.rejects(lancar([104],'2026-10-05',10,'Pix',1,gestor+'/c1.pdf'),/já foi usado/)
 await assert.rejects(db.query("update le_admin.a_receber set status='Pendente' where id=101"),/estorne/)
 const parcial=await lancar([104],'2026-10-06',2000,'Pix',null,gestor+'/c2.pdf')
 const p104=(await db.query('select status,valor_recebido from le_admin.a_receber where id=104')).rows[0]
 assert.equal(p104.status,'Parcial');assert.equal(Number(p104.valor_recebido),2000)
 assert.equal(Number((await db.query('select saldo from le_admin.contas_bancarias where id=1')).rows[0].saldo),4000)
 await assert.rejects(db.query('select le_admin.recebimento_estornar($1,$2)',[cartao.id,'']),/motivo/)
 await db.query('select le_admin.recebimento_estornar($1,$2)',[cartao.id,'Lançado no cliente errado'])
 assert.equal((await db.query("select count(*)::int n from le_admin.a_receber where id in (101,102,103) and status='Pendente' and valor_recebido=0 and data_recebimento is null")).rows[0].n,3)
 assert.equal(Number((await db.query('select saldo from le_admin.contas_bancarias where id=1')).rows[0].saldo),1000)
 await assert.rejects(db.query('select le_admin.recebimento_estornar($1,$2)',[cartao.id,'De novo']),/já estornado/)
 await db.exec(`select set_config('test.uid','${vendedor}',false)`)
 await assert.rejects(lancar([101],'2026-10-05',10,'Pix',1,vendedor+'/c3.pdf'),/financeiro/)
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 assert.ok(parcial.id)
 // Medição técnica: Rodrigo vê fichas liberadas e registra só agendamento e conclusão da medida.
 const medidor='00000000-0000-4000-8000-000000000005',cidM='00000000-0000-4000-8000-000000000050',cidN='00000000-0000-4000-8000-000000000051'
 await db.exec(`insert into auth.users(id) values('${medidor}');insert into le_admin.jornada_acessos values('${medidor}','Rodrigo','medidor',null,true);
 insert into leblanc.contratos(id,numero,cliente_nome,cliente_endereco) values('${cidM}','M1','Cliente medição','Rua A, 1'),('${cidN}','M2','Cliente sem pasta','Rua B, 2');`)
 const fM=(await db.query("insert into le_admin.jornada_registros(tipo,contrato_id,dados,criado_por) values('pedido',$1,$2,$3) returning *",[cidM,JSON.stringify({cliente_nome:'Cliente medição',liberacao_em:'2026-10-01',medicao_prazo:'2026-10-06',historico:{liberacao_em:{data:'2026-10-01'}}}),gestor])).rows[0]
 const fN=(await db.query("insert into le_admin.jornada_registros(tipo,contrato_id,dados,criado_por) values('pedido',$1,'{}',$2) returning *",[cidN,gestor])).rows[0]
 await db.exec(`grant usage on schema leblanc to authenticated;grant usage on schema auth to authenticated;select set_config('test.uid','${medidor}',false);set role authenticated;`)
 const vistos=(await db.query("select contrato_id from le_admin.jornada_registros where tipo='pedido'")).rows.map((r)=>r.contrato_id)
 assert.ok(vistos.includes(cidM)&&vistos.includes(cidN))
 assert.ok((await db.query('select numero from leblanc.contratos')).rows.some((r)=>r.numero==='M2'))
 await db.exec('reset role')
 const savM=(d,id,v)=>db.query('select * from le_admin.jornada_salvar($1,$2,$3,$4,$5)',['pedido',cidM,JSON.stringify(d),id,v]).then((q)=>q.rows[0])
 const m1=await savM({...fM.dados,medicao_agendada:'2026-10-05'},fM.id,fM.versao)
 assert.equal(m1.dados.medicao_agendada,'2026-10-05')
 await assert.rejects(savM({...m1.dados,correcao_em:'2026-10-09'},m1.id,m1.versao),/apenas agendamento/)
 await assert.rejects(savM({...m1.dados,observacao:'x'},m1.id,m1.versao),/apenas agendamento/)
 const m2=await savM({...m1.dados,medicao_em:'2026-10-05'},m1.id,m1.versao)
 assert.ok(m2.dados.correcao_prazo)
 await assert.rejects(db.query('select * from le_admin.jornada_salvar($1,$2,$3)',['pedido',cidN,'{}']),/apenas agendamento/)
 await assert.rejects(db.query('select * from le_admin.jornada_salvar($1,$2,$3,$4,$5)',['pedido',cidN,'{"medicao_agendada":"2026-10-20"}',fN.id,fN.versao]),/pasta do cliente/)
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 // Conferente vê a situação do XML sem receita, custos ou margem; vendedor não acessa a conferência.
 const conferente='00000000-0000-4000-8000-000000000004'
 await db.exec(`insert into auth.users(id) values('${conferente}');insert into le_admin.jornada_acessos values('${conferente}','Conferente teste','correcao',null,true);select set_config('test.uid','${conferente}',false);`)
 const vista=(await db.query('select le_admin.xml_analise($1) as a',[cid])).rows[0].a
 assert.equal(vista.implantado,true);assert.equal(vista.custos,undefined);assert.equal(vista.margem,undefined)
 await assert.rejects(db.query('select le_admin.xml_painel()'),/restrito/)
 await assert.rejects(db.query('select le_admin.xml_conferir($1,$2,$3)',[fin2.id,'x','']),/Somente a Leia/)
 await db.exec(`select set_config('test.uid','${vendedor}',false)`)
 await assert.rejects(db.query('select le_admin.xml_analise($1)',[cid]),/não disponível/)
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 assert.equal((await db.query('select le_admin.xml_painel() as p')).rows[0].p.length,0)
 // Vendedor não lê contratos alheios nem altera registros por acesso direto.
 await db.exec(`grant usage on schema leblanc to authenticated;grant usage on schema auth to authenticated;select set_config('test.uid','${vendedor}',false);set role authenticated;`)
 assert.equal((await db.query('select count(*)::int as n from leblanc.contratos')).rows[0].n,0)
 await assert.rejects(db.exec("delete from leblanc.contratos"),/permission denied/)
 await db.exec('reset role')
 // Vendedor vê e preenche a ficha das próprias vendas mesmo criadas pela gestão, pelo nome no contrato.
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 const cidV='00000000-0000-4000-8000-000000000040',cidO='00000000-0000-4000-8000-000000000041'
 await db.exec(`insert into leblanc.contratos(id,numero,cliente_nome,vendor) values('${cidV}','V1','Cliente da Andriely','Andriely da Costa'),('${cidO}','V2','Cliente do Murilo','Murilo');
 insert into le_admin.vendedor_apelidos values('${vendedor}','Andriely');`)
 const fichaV=(await db.query("insert into le_admin.jornada_registros(tipo,contrato_id,dados,criado_por) values('pedido',$1,'{\"tipo_venda\":\"Normal\"}',$2) returning *",[cidV,gestor])).rows[0]
 await db.query("insert into le_admin.jornada_registros(tipo,contrato_id,dados,criado_por) values('pedido',$1,'{}',$2)",[cidO,gestor])
 await db.exec(`select set_config('test.uid','${vendedor}',false);set role authenticated;`)
 assert.deepEqual((await db.query('select numero from leblanc.contratos order by numero')).rows.map((r)=>r.numero),['V1'])
 assert.equal((await db.query("select count(*)::int n from le_admin.jornada_registros where tipo='pedido'")).rows[0].n,1)
 await db.exec('reset role')
 const fv=(await db.query('select * from le_admin.jornada_salvar($1,$2,$3,$4,$5)',['pedido',cidV,JSON.stringify({...fichaV.dados,grupo_criado:true}),fichaV.id,fichaV.versao])).rows[0]
 assert.equal(fv.dados.grupo_criado,true)
 const fo=(await db.query("select * from le_admin.jornada_registros where contrato_id=$1",[cidO])).rows[0]
 await assert.rejects(db.query('select * from le_admin.jornada_salvar($1,$2,$3,$4,$5)',['pedido',cidO,'{"grupo_criado":true}',fo.id,fo.versao]),/não disponível|outro vendedor/)
 // Gerente de vendas (apelido '*') acompanha as vendas de toda a equipe.
 await db.exec(`insert into le_admin.vendedor_apelidos values('${vendedor}','*')`)
 assert.equal((await db.query('select le_admin.vendedor_do_contrato($1) v',[cidO])).rows[0].v,true)
 await db.exec(`delete from le_admin.vendedor_apelidos where apelido='*'`)
 assert.equal((await db.query('select le_admin.vendedor_do_contrato($1) v',[cidO])).rows[0].v,false)
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 // RLS: montador não lê informações financeiras nem outras escalas.
 await db.exec(`grant usage on schema auth to authenticated;select set_config('test.uid','${montador}',false);set role authenticated;`)
 const visiveis=await db.query('select tipo,dados from le_admin.jornada_registros')
 assert.equal(visiveis.rows.length,1);assert.equal(visiveis.rows[0].tipo,'agenda')
 await assert.rejects(db.query("update le_admin.jornada_registros set dados='{}'"),/permission denied/)
 await db.exec('reset role')

 // Orçamentos são rascunhos separados: sem recebíveis e com conversão idempotente.
 await db.exec('create table leblanc.leads(id text primary key)')
 await db.exec(await readFile(new URL('../supabase/migrations/20261011215211_orcamentos_crm.sql',import.meta.url),'utf8'))
 await db.exec(`select set_config('test.uid','${gestor}',false)`)
 const antes=(await db.query('select count(*)::int as n from le_admin.comercial_recebiveis')).rows[0].n
 const od={...proposta,cliente_cpf:'00000000000',cliente_telefone:'41999999999',endereco:'Rua de teste, 1',bairro:'Teste',cidade:'Curitiba',uf:'PR',cep:'80000000',vendedor:'Vendedor teste'}
 const os=async(d,id=null,v=0)=>(await db.query('select le_admin.orcamento_salvar($1,$2,$3) as o',[id,v,JSON.stringify(d)])).rows[0].o
 const o=await os(od)
 assert.equal(o.dados.valor_promob,50000)
 assert.equal(o.dados.total_pedido,57500)
 assert.equal(o.dados.valor_negociado,34500)
 assert.equal((await db.query('select count(*)::int as n from le_admin.comercial_recebiveis')).rows[0].n,antes)
 await assert.rejects(os(od,o.id,0),/outra pessoa/)
 const o2=await os(od,o.id,1)
 assert.equal(o2.versao,2)
 await assert.rejects(db.query('select le_admin.orcamento_converter($1,$2)',[o.id,1]),/mudou/)
 await db.exec(`select set_config('test.uid','${vendedor}',false);set role authenticated`)
 assert.equal((await db.query('select count(*)::int as n from le_admin.comercial_orcamentos')).rows[0].n,0)
 await assert.rejects(os(od,o.id,2),/indisponível/)
 await assert.rejects(db.query('select le_admin.orcamento_converter($1,$2)',[o.id,2]),/indisponível/)
 await assert.rejects(db.exec("update le_admin.comercial_orcamentos set dados='{}'"),/permission denied/)
 await db.exec(`reset role;select set_config('test.uid','${gestor}',false)`)
 const convertido=(await db.query('select le_admin.orcamento_converter($1,$2) as c',[o.id,2])).rows[0].c
 const novamente=(await db.query('select le_admin.orcamento_converter($1,$2) as c',[o.id,2])).rows[0].c
 assert.equal(convertido.id,novamente.id)
 assert.equal(convertido.dados_json.orcamento_id,o.id)
 assert.match(convertido.numero,/^\d{8}-\d{2,}$/)
 assert.equal(convertido.numero,novamente.numero)
 await assert.rejects(os(od,o.id,2),/já convertido/)
 const incompleto=await os({...od,cliente_cpf:''})
 await assert.rejects(db.query('select le_admin.orcamento_converter($1,$2)',[incompleto.id,1]),/Complete/)
 const excecao=await os({...od,desconto_valor:41,formas_pagamento:[{forma:'Pix / À vista',valor:33925}],parcelas:[{numero:1,valor:20355,marco:'venda'},{numero:2,valor:13570,marco:'dois_dias_antes_entrega'}]})
 const pendente=(await db.query('select le_admin.orcamento_converter($1,$2) as c',[excecao.id,1])).rows[0].c
 assert.equal(pendente.status,'Aguardando aprovação')
 assert.equal((await db.query('select count(*)::int as n from le_admin.comercial_recebiveis where contrato_id=$1',[pendente.id])).rows[0].n,0)
 } finally {await db.close()}
})

