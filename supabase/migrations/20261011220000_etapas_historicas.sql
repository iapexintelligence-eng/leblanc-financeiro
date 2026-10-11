-- Etapas que já aconteceram nas fichas trazidas da planilha de revisões.
-- Registradas com data real, justificativa e autor, sem exigir o checklist inicial do fluxo novo.

create or replace function le_admin.jornada_uteis_seguro(d date,n integer) returns date
language plpgsql stable security definer set search_path='' as $$
begin
 return le_admin.jornada_uteis(d,n);
exception when others then
 return null;
end $$;

create or replace function le_admin.jornada_registrar_historico(p_id uuid,p_versao integer,p_marcos jsonb,p_justificativa text,p_pedido_fabrica text default null)
returns le_admin.jornada_registros language plpgsql security definer set search_path='' as $$
declare r le_admin.jornada_registros; anterior jsonb; d jsonb; h jsonb; papel text:=le_admin.jornada_papel();
 hoje date:=(now() at time zone 'America/Sao_Paulo')::date; imp date; k text; v text; dt date; i int; ant date; antk text;
 cadeia text[]:=array['liberacao_em','medicao_em','correcao_em','aprovacao_em','implantacao_em','cliente_recebe_em','entrega_em','montagem_concluida_em'];
begin
 if auth.uid() is null or papel is null then raise exception 'Acesso à jornada não autorizado'; end if;
 if papel not in ('gestor','correcao','logistica','financeiro') then raise exception 'Sem permissão para registrar etapas já realizadas'; end if;
 if length(trim(coalesce(p_justificativa,'')))<10 then raise exception 'Explique de onde vem a informação (mínimo 10 caracteres)'; end if;
 if p_marcos is null or jsonb_typeof(p_marcos)<>'object' or p_marcos='{}'::jsonb then raise exception 'Informe ao menos uma etapa com data'; end if;
 select * into r from le_admin.jornada_registros where id=p_id for update;
 if not found or not le_admin.jornada_leitura(r) then raise exception 'Registro não disponível'; end if;
 if r.tipo<>'pedido' then raise exception 'Somente fichas de pedido'; end if;
 if r.versao<>p_versao then raise exception 'Registro atualizado por outra pessoa. Recarregue antes de salvar.'; end if;
 if not (r.dados ? 'importacao_revisoes') then raise exception 'Etapas já realizadas só podem ser lançadas em fichas trazidas da planilha de revisões'; end if;
 imp:=coalesce(nullif(r.dados->'importacao_revisoes'->>'importado_em','')::date,hoje);
 anterior:=r.dados; d:=r.dados; h:=coalesce(d->'historico','{}'::jsonb);
 for k,v in select key,value from jsonb_each_text(p_marcos) loop
  if not (k = any(cadeia)) then raise exception 'Etapa não permitida: %',k; end if;
  if k='liberacao_em' and papel not in ('gestor','financeiro','correcao') then raise exception 'Liberação reservada à gestão, financeiro ou conferente'; end if;
  if k in ('medicao_em','correcao_em','aprovacao_em','implantacao_em') and papel not in ('correcao','gestor') then raise exception 'Marco reservado ao conferente'; end if;
  if k in ('cliente_recebe_em','entrega_em','montagem_concluida_em') and papel not in ('logistica','gestor') then raise exception 'Marco reservado à logística'; end if;
  dt:=v::date;
  if dt>hoje then raise exception 'Data de realização não pode ser futura: %',k; end if;
  if dt<date '2020-01-01' then raise exception 'Data muito antiga: %',k; end if;
  if k='implantacao_em' and dt>imp then raise exception 'Implantação depois da importação segue o fluxo normal (XML final e OK da Leia)'; end if;
  if coalesce(d->>k,'')<>'' then raise exception 'Etapa já registrada: %',k; end if;
  d:=d||jsonb_build_object(k,dt::text);
  h:=h||jsonb_build_object(k,jsonb_build_object('data',dt::text,'justificativa',trim(p_justificativa),'por',auth.uid(),'registrado_em',now()));
 end loop;
 -- Etapas em sequência e datas em ordem.
 for i in 1..array_length(cadeia,1) loop
  k:=cadeia[i];
  if coalesce(d->>k,'')<>'' then
   if i>1 and coalesce(d->>cadeia[i-1],'')='' then raise exception 'Registre antes a etapa anterior: %',cadeia[i-1]; end if;
   if ant is not null and (d->>k)::date<ant then raise exception 'Data de % anterior a %',k,antk; end if;
   ant:=(d->>k)::date; antk:=k;
  end if;
 end loop;
 if p_marcos ? 'implantacao_em' and nullif(trim(coalesce(p_pedido_fabrica,'')),'') is not null and coalesce(d->>'pedido_fabrica','')='' then
  d:=d||jsonb_build_object('pedido_fabrica',trim(p_pedido_fabrica));
 end if;
 if coalesce(d->>'liberacao_em','')<>'' then d:=d||jsonb_build_object('medicao_prazo',((d->>'liberacao_em')::date+5)::text); end if;
 if coalesce(d->>'medicao_em','')<>'' then d:=d||jsonb_strip_nulls(jsonb_build_object('correcao_prazo',le_admin.jornada_uteis_seguro((d->>'medicao_em')::date,12))); end if;
 if coalesce(d->>'aprovacao_em','')<>'' then d:=d||jsonb_strip_nulls(jsonb_build_object('entrega_prazo',le_admin.jornada_uteis_seguro((d->>'aprovacao_em')::date,35))); end if;
 d:=d||jsonb_build_object('historico',h);
 update le_admin.jornada_registros set dados=d,versao=versao+1,atualizado_em=now() where id=p_id returning * into r;
 insert into le_admin.jornada_eventos(registro_id,autor,anterior,atual,versao) values(r.id,auth.uid(),anterior,d,r.versao);
 return r;
end $$;

create or replace function le_admin.jornada_salvar(p_tipo text,p_contrato text,p_dados jsonb,p_id uuid default null,p_versao integer default 0)
returns le_admin.jornada_registros language plpgsql security definer set search_path='' as $$
declare r le_admin.jornada_registros; anterior jsonb:='{}'; d jsonb:=p_dados; pedido le_admin.jornada_registros; h jsonb:='{}';
 papel text:=le_admin.jornada_papel(); a text; k text; data_hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if auth.uid() is null or papel is null then raise exception 'Acesso à jornada não autorizado'; end if;
 if p_tipo not in ('pedido','assistencia','frete','agenda') or jsonb_typeof(d)<>'object' then raise exception 'Registro inválido'; end if;
 if p_id is not null then
  select * into r from le_admin.jornada_registros where id=p_id for update;
  if not found or not le_admin.jornada_leitura(r) then raise exception 'Registro não disponível'; end if;
  if r.versao<>p_versao then raise exception 'Registro atualizado por outra pessoa. Recarregue antes de salvar.'; end if;
  if r.tipo<>p_tipo or r.contrato_id<>p_contrato then raise exception 'Vínculo não pode ser alterado'; end if;
  anterior:=r.dados;
 end if;
 if not exists(select 1 from leblanc.contratos where id::text=p_contrato) then raise exception 'Selecione um contrato existente'; end if;
 if papel='montador' then raise exception 'Montador possui acesso somente à escala liberada'; end if;
 if p_tipo<>'pedido' and papel not in ('gestor','logistica','financeiro') then raise exception 'Somente logística e financeiro podem editar este registro'; end if;
 if p_tipo<>'pedido' then
  select * into pedido from le_admin.jornada_registros where contrato_id=p_contrato and tipo='pedido' for update;
  if not found then raise exception 'Inicie a jornada do contrato primeiro'; end if;
 end if;
 -- Datas inválidas geram erro e não são substituídas por hoje.
 for k in select key from jsonb_each_text(d) where key ~ '_em$' or key in ('inicio','fim','identificada','venda_data','prevista','realizada') loop
  if coalesce(d->>k,'')<>'' then perform (d->>k)::date; end if;
 end loop;
 select aprovadora into a from le_admin.jornada_acessos where usuario_id=auth.uid() and ativo;
 -- Aprovação pertence à pessoa autenticada e à versão exata da solicitação.
 if d->'excecao_motivo' is distinct from anterior->'excecao_motivo' or d->'excecao_valor' is distinct from anterior->'excecao_valor' then
  d:=d-'autorizado_por'-'autorizado_em';
 end if;
 if d->>'autorizar'='true' then
  if a is null or coalesce(d->>'excecao_motivo','')='' then raise exception 'Autorização exige Priscila, Andressa ou Catelli e justificativa'; end if;
  d:=d||jsonb_build_object('autorizado_por',a,'autorizado_em',data_hoje,'autorizado_usuario',auth.uid());
 else
  d:=d-'autorizado_por'-'autorizado_em'-'autorizado_usuario';
  if d->'excecao_motivo' is not distinct from anterior->'excecao_motivo' and d->'excecao_valor' is not distinct from anterior->'excecao_valor' then
   d:=d||jsonb_strip_nulls(jsonb_build_object('autorizado_por',anterior->'autorizado_por','autorizado_em',anterior->'autorizado_em','autorizado_usuario',anterior->'autorizado_usuario'));
  end if;
 end if;
 d:=d-'autorizar';
 -- Etapas históricas só entram pela rotina própria, com justificativa auditada.
 d:=d-'historico';
 if anterior ? 'historico' then d:=d||jsonb_build_object('historico',anterior->'historico'); h:=anterior->'historico'; end if;
 if p_tipo='pedido' then
  -- Deriva prazos no servidor e preserva carimbos de auditoria contra alteração manual.
  d:=d-'planta_prazo'-'medicao_prazo'-'correcao_prazo'-'entrega_prazo'-'saldo_vencimento';
  foreach k in array array['entrada_confirmada','saldo_confirmado','fabrica_paga'] loop
   d:=d-(k||'_por')-(k||'_data');
   if anterior ? (k||'_por') then d:=d||jsonb_build_object(k||'_por',anterior->(k||'_por'),k||'_data',anterior->(k||'_data')); end if;
  end loop;
  if papel='vendedor' and not exists(select 1 from leblanc.contratos c join le_admin.jornada_acessos a on a.usuario_id=auth.uid() where c.id::text=p_contrato and (c.dados_json->>'criado_por'=auth.uid()::text or c.vendor=a.nome)) then raise exception 'Contrato de outro vendedor'; end if;
  -- Apenas o setor responsável confirma seus marcos; papel não deriva do formulário.
  for k in select key from jsonb_each(d) where value is distinct from anterior->key loop
   if k in ('carregamento_em','cliente_recebe_em','entrega_prevista','entrega_em','montagem_concluida_em','fotos_em') and papel not in ('logistica','gestor') then raise exception 'Marco reservado à logística'; end if;
   if k in ('medicao_em','correcao_em','aprovacao_em','implantacao_em','pedido_fabrica') and papel not in ('correcao','gestor') then raise exception 'Marco reservado ao conferente'; end if;
  end loop;
  for k in select unnest(array['entrada_confirmada','saldo_confirmado','fabrica_paga']) loop
   if d->k is distinct from anterior->k and coalesce(d->>k,'false')='true' then
    if papel not in ('financeiro','gestor') then raise exception 'Somente financeiro confirma pagamentos'; end if;
    if not le_admin.jornada_comprovante(d->>(k||'_arquivo')) then raise exception 'Anexe o comprovante antes de confirmar o pagamento'; end if;
    d:=d||jsonb_build_object(k||'_por',auth.uid(),k||'_data',now());
   elsif anterior->>k='true' and d->(k||'_arquivo') is distinct from anterior->(k||'_arquivo') then raise exception 'Comprovante confirmado não pode ser substituído';
   elsif anterior->>k='true' and d->>k is distinct from 'true' then raise exception 'Pagamento confirmado exige estorno auditado; não pode ser desmarcado';
   end if;
  end loop;
  if coalesce(d->>'liberacao_em','')<>'' then
   if not (h ? 'liberacao_em') and (d->>'entrada_confirmada' is distinct from 'true' or d->>'grupo_criado' is distinct from 'true' or d->>'imagens_enviadas' is distinct from 'true'
    or not le_admin.jornada_comprovante(d->>'grupo_arquivo') or not le_admin.jornada_comprovante(d->>'imagens_arquivo') or not le_admin.jornada_comprovante(d->>'planta_arquivo') or coalesce(d->>'planta_enviada_em','')='') then
    raise exception 'Liberação exige checklist completo, planta enviada e entrada confirmada'; end if;
   if d->>'tipo_venda'='Futura' and coalesce(d->>'imovel_pronto_em','')='' and not (h ? 'liberacao_em') then raise exception 'Venda futura aguarda aviso do cliente'; end if;
   d:=d||jsonb_build_object('medicao_prazo',(d->>'liberacao_em')::date+5);
  end if;
  if coalesce(d->>'medicao_em','')<>'' then
   if not (h ? 'medicao_em') and (coalesce(d->>'liberacao_em','')='' or (d->>'medicao_em')::date<(d->>'liberacao_em')::date) then raise exception 'Medição deve ocorrer após a liberação'; end if;
   d:=d||jsonb_build_object('correcao_prazo',case when h ? 'medicao_em' then le_admin.jornada_uteis_seguro((d->>'medicao_em')::date,12) else le_admin.jornada_uteis((d->>'medicao_em')::date,12) end);
  end if;
  if coalesce(d->>'correcao_em','')<>'' and not (h ? 'correcao_em') and (coalesce(d->>'medicao_em','')='' or (d->>'correcao_em')::date<(d->>'medicao_em')::date) then raise exception 'Conferência deve ocorrer após medição';end if;
  foreach k in array array['venda_data','liberacao_em','medicao_em','correcao_em','aprovacao_em','implantacao_em','cliente_recebe_em','entrega_em','montagem_concluida_em'] loop
   if coalesce(d->>k,'')<>'' and (d->>k)::date>data_hoje then raise exception 'Data de realização não pode ser futura: %',k;end if;
  end loop;
  if coalesce(d->>'aprovacao_em','')<>'' then
   if not (h ? 'aprovacao_em') and (coalesce(d->>'correcao_em','')='' or coalesce(d->>'medicao_em','')='' or (d->>'aprovacao_em')::date<(d->>'correcao_em')::date) then raise exception 'Conclua a conferência antes da aprovação do cliente'; end if;
   d:=d||jsonb_build_object('entrega_prazo',case when h ? 'aprovacao_em' then le_admin.jornada_uteis_seguro((d->>'aprovacao_em')::date,35) else le_admin.jornada_uteis((d->>'aprovacao_em')::date,35) end);
  end if;
  if coalesce(d->>'implantacao_em','')<>'' then
   if not (h ? 'implantacao_em') and (coalesce(d->>'aprovacao_em','')='' or not le_admin.jornada_comprovante(d->>'guias_arquivo') or coalesce(d->>'pedido_fabrica','')='') then raise exception 'Implantação exige projeto aprovado, guias assinadas e número do pedido'; end if;
  end if;
  if d->>'fabrica_paga'='true' and coalesce(d->>'implantacao_em','')='' then raise exception 'Implante o pedido antes do pagamento da fábrica'; end if;
  if coalesce(d->>'cliente_recebe_em','')<>'' and not (h ? 'cliente_recebe_em') and not le_admin.jornada_comprovante(d->>'aceite_arquivo') then raise exception 'Anexe a confirmação de recebimento do cliente'; end if;
  if coalesce(d->>'cliente_recebe_em','')<>'' and not (h ? 'cliente_recebe_em') and coalesce(d->>'carregamento_em','')='' then raise exception 'Registre a previsão de carregamento'; end if;
  if coalesce(d->>'entrega_prevista','')<>'' then d:=d||jsonb_build_object('saldo_vencimento',(d->>'entrega_prevista')::date-2); end if;
  if coalesce(d->>'entrega_em','')<>'' and not (h ? 'entrega_em') and (d->>'fabrica_paga' is distinct from 'true' or coalesce(d->>'cliente_recebe_em','')='') then raise exception 'Entrega exige fábrica paga e aceite do cliente';end if;
  if coalesce(d->>'entrega_em','')<>'' and not (h ? 'entrega_em') and d->>'saldo_confirmado' is distinct from 'true' then raise exception 'Confirme a quitação antes da entrega'; end if;
  if coalesce(d->>'montagem_concluida_em','')<>'' and not (h ? 'montagem_concluida_em') and (coalesce(d->>'entrega_em','')='' or (d->>'montagem_concluida_em')::date<(d->>'entrega_em')::date) then raise exception 'Montagem deve ocorrer após entrega';end if;
  if coalesce(d->>'montagem_concluida_em','')<>'' and not (h ? 'montagem_concluida_em') and not le_admin.jornada_comprovante(d->>'termo_montagem_arquivo') then raise exception 'Anexe o termo de conclusão assinado'; end if;
  if coalesce(d->>'fotos_em','')<>'' and (coalesce(d->>'montagem_concluida_em','')='' or exists(select 1 from le_admin.jornada_registros x where x.tipo='assistencia' and x.contrato_id=p_contrato and x.dados->>'status' is distinct from 'Resolvida')) then raise exception 'Finalize montagem e assistências antes das fotos'; end if;
  if coalesce(d->>'venda_data','')<>'' then d:=d||jsonb_build_object('planta_prazo',le_admin.jornada_uteis((d->>'venda_data')::date,2)); end if;
  -- Marcos já registrados não mudam silenciosamente nem reiniciam prazos.
  foreach k in array array['venda_data','liberacao_em','medicao_em','aprovacao_em'] loop
   if coalesce(anterior->>k,'')<>'' and anterior->k is distinct from d->k then raise exception 'Marco já registrado não pode ser alterado: %',k; end if;
  end loop;
  for k in select jsonb_object_keys(h) loop
   if anterior->k is distinct from d->k then raise exception 'Etapa histórica não pode ser alterada: %',k; end if;
  end loop;
  if h ? 'implantacao_em' and coalesce(anterior->>'pedido_fabrica','')<>'' and anterior->'pedido_fabrica' is distinct from d->'pedido_fabrica' then raise exception 'Pedido de fábrica histórico não pode ser alterado'; end if;
 elsif p_tipo='assistencia' then
  if coalesce(d->>'identificada','')='' or (d->>'identificada')::date>data_hoje then raise exception 'Informe a data real de identificação'; end if;
  if coalesce(anterior->>'identificada','')<>'' and d->'identificada' is distinct from anterior->'identificada' then raise exception 'Identificação não pode reiniciar o prazo'; end if;
  if coalesce(d->>'status','') not in ('Identificada','Em análise','Peças solicitadas','Aguardando peças','Atendimento agendado','Executada','Resolvida') then raise exception 'Situação inválida'; end if;
  if coalesce(d->>'montagem_id','')<>'' and not exists(select 1 from le_admin.jornada_registros x where x.id::text=d->>'montagem_id' and x.tipo='agenda' and x.contrato_id=p_contrato) then raise exception 'Montagem não pertence ao contrato';end if;
  if coalesce(d->>'descricao','')='' then raise exception 'Descreva o problema'; end if;
  d:=d||jsonb_build_object('vencimento',le_admin.jornada_uteis((d->>'identificada')::date,30));
  if d->>'status'='Resolvida' and (coalesce(d->>'confirmacao','')='' or not le_admin.jornada_comprovante(d->>'evidencia_arquivo')) then raise exception 'Confirme a resolução e anexe a evidência'; end if;
  if d->>'status'='Resolvida' and anterior->>'status' is distinct from 'Resolvida' then d:=d||jsonb_build_object('resolvida_em',data_hoje,'resolvida_por',auth.uid()); end if;
 elsif p_tipo='agenda' then
  if coalesce(d->>'montador_id','')='' or coalesce(d->>'inicio','')='' or coalesce(d->>'fim','')='' or (d->>'fim')::date<(d->>'inicio')::date then raise exception 'Informe montador e período válido'; end if;
  if not exists(select 1 from le_admin.jornada_acessos m where m.usuario_id::text=d->>'montador_id' and m.ativo and m.papel='montador') then raise exception 'Montador não cadastrado'; end if;
  if d->>'confirmada'='true' and (coalesce(pedido.dados->>'cliente_recebe_em','')='' or pedido.dados->>'fabrica_paga' is distinct from 'true') then raise exception 'Confirme fábrica paga e recebimento do cliente antes da escala';end if;
  if d->>'confirmada'='true' and pedido.dados->>'saldo_confirmado' is distinct from 'true' then raise exception 'Escala bloqueada: financeiro deve confirmar a quitação'; end if;
  perform pg_advisory_xact_lock(hashtext(d->>'montador_id'));
  if exists(select 1 from le_admin.jornada_registros x where x.tipo='agenda' and x.id is distinct from p_id and x.dados->>'montador_id'=d->>'montador_id' and (x.dados->>'inicio')::date<=(d->>'fim')::date and (x.dados->>'fim')::date>=(d->>'inicio')::date) then raise exception 'Montador já reservado neste período'; end if;
 elsif p_tipo='frete' then
  if coalesce(d->>'origem','')='' or coalesce(d->>'destino','')='' or coalesce(d->>'prestador','')='' or coalesce(d->>'motivo','')='' or coalesce((d->>'valor')::numeric,0)<=0 then raise exception 'Informe prestador, rota, motivo e valor positivo'; end if;
  -- Até cadastro de tabela homologada, cada rota/valor exige uma das três autorizações.
  if anterior->'valor' is distinct from d->'valor' or anterior->'origem' is distinct from d->'origem' or anterior->'destino' is distinct from d->'destino' then
   if p_dados->>'autorizar' is distinct from 'true' and anterior<>'{}' then d:=d-'autorizado_por'-'autorizado_em'; end if;
  end if;
  if coalesce(d->>'status','') not in ('Solicitado','Em execução','Aguardando conferência','Liberado para pagamento','Pago') then raise exception 'Situação do frete inválida'; end if;
  if coalesce(d->>'assistencia_id','')<>'' and not exists(select 1 from le_admin.jornada_registros x where x.id::text=d->>'assistencia_id' and x.tipo='assistencia' and x.contrato_id=p_contrato) then raise exception 'Assistência não pertence ao contrato'; end if;
  if d->>'status' in ('Liberado para pagamento','Pago') and (coalesce(d->>'autorizado_por','')='' or not le_admin.jornada_comprovante(d->>'evidencia_arquivo')) then raise exception 'Liberação exige serviço comprovado e valor autorizado'; end if;
  if d->>'status'='Pago' and anterior->>'status' is distinct from 'Pago' then
   if papel not in ('financeiro','gestor') or not le_admin.jornada_comprovante(d->>'pagamento_arquivo') then raise exception 'Financeiro deve anexar comprovante para pagar'; end if;
   d:=d||jsonb_build_object('pago_em',data_hoje,'pago_por',auth.uid());
  end if;
  if anterior->>'status'='Pago' and d is distinct from anterior then raise exception 'Frete pago é imutável. Registre ajuste separado'; end if;
 end if;
 if p_id is null then
  insert into le_admin.jornada_registros(tipo,contrato_id,dados,criado_por) values(p_tipo,p_contrato,d,auth.uid()) returning * into r;
 else
  update le_admin.jornada_registros set dados=d,versao=versao+1,atualizado_em=now() where id=p_id returning * into r;
 end if;
 insert into le_admin.jornada_eventos(registro_id,autor,anterior,atual,versao) values(r.id,auth.uid(),anterior,d,r.versao);
 return r;
end $$;


-- Implantação lançada como histórica (anterior à importação) não passa pelo XML final.
create or replace function le_admin.xml_exigir_ok() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='pedido' and coalesce(new.dados->>'implantacao_em','')<>'' and (tg_op='INSERT' or coalesce(old.dados->>'implantacao_em','')='') then
  if coalesce(new.dados->'historico','{}'::jsonb) ? 'implantacao_em' then return new; end if;
  if not coalesce((le_admin.xml_analise_interna(new.contrato_id)->>'ok_valido')::boolean,false) then
   raise exception 'Implantação exige XML final corrigido e o OK da Leia para a versão vigente';
  end if;
 end if;
 return new;
end $$;

revoke all on function le_admin.jornada_uteis_seguro(date,integer),le_admin.jornada_registrar_historico(uuid,integer,jsonb,text,text),le_admin.xml_exigir_ok() from public,anon,authenticated;
grant execute on function le_admin.jornada_registrar_historico(uuid,integer,jsonb,text,text) to authenticated;
