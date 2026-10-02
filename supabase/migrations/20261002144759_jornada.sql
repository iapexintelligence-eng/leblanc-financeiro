-- Aplicar primeiro em homologação. Não altera contratos históricos nem migra dados silenciosamente.
begin;
create schema if not exists le_admin;
grant usage on schema le_admin to authenticated;
create table if not exists le_admin.jornada_acessos (
 usuario_id uuid primary key references auth.users(id),
 nome text not null,
 papel text not null check(papel in ('vendedor','correcao','financeiro','logistica','gestor','montador')),
 aprovadora text check(aprovadora in ('Priscila','Andressa','Catelli')),
 ativo boolean not null default true
);
create table if not exists le_admin.jornada_config (
 id boolean primary key default true check(id),
 feriados date[] not null default '{}', calendario_de date, calendario_ate date,
 atualizado_em timestamptz not null default now()
);
insert into le_admin.jornada_config(id) values(true) on conflict do nothing;
create table if not exists le_admin.jornada_registros (
 id uuid primary key default gen_random_uuid(),
 tipo text not null check(tipo in ('pedido','assistencia','frete','agenda')),
 contrato_id text not null,
 dados jsonb not null default '{}',
 versao integer not null default 1,
 criado_por uuid not null references auth.users(id),
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index if not exists jornada_pedido_unico on le_admin.jornada_registros(contrato_id) where tipo='pedido';
create index if not exists jornada_tipo on le_admin.jornada_registros(tipo);
create table if not exists le_admin.jornada_eventos (
 id bigint generated always as identity primary key,
 registro_id uuid not null references le_admin.jornada_registros(id),
 autor uuid not null references auth.users(id), data timestamptz not null default now(),
 anterior jsonb, atual jsonb not null, versao integer not null
);
create table if not exists le_admin.jornada_alertas (
 id bigint generated always as identity primary key,
 registro_id uuid not null references le_admin.jornada_registros(id),
 destinatario uuid not null references auth.users(id), marco text not null,
 vencimento date not null, criado_em timestamptz not null default now(),
 unique(registro_id,destinatario,marco,vencimento)
);
create or replace function le_admin.jornada_papel() returns text language sql stable security definer set search_path='' as $$
 select papel from le_admin.jornada_acessos where usuario_id=auth.uid() and ativo
$$;
create or replace function le_admin.jornada_leitura(r le_admin.jornada_registros) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(le_admin.jornada_papel() in ('gestor','financeiro','logistica','correcao')
 or (le_admin.jornada_papel()='vendedor' and r.criado_por=auth.uid())
 or (le_admin.jornada_papel()='montador' and r.tipo='agenda' and r.dados->>'montador_id'=auth.uid()::text and r.dados->>'confirmada'='true'),false)
$$;
alter table le_admin.jornada_acessos enable row level security;
alter table le_admin.jornada_config enable row level security;
alter table le_admin.jornada_registros enable row level security;
alter table le_admin.jornada_eventos enable row level security;
alter table le_admin.jornada_alertas enable row level security;
create policy jornada_acessos_ler on le_admin.jornada_acessos for select to authenticated using (usuario_id=auth.uid() or le_admin.jornada_papel() in ('gestor','logistica','financeiro'));
create policy jornada_config_ler on le_admin.jornada_config for select to authenticated using (le_admin.jornada_papel() is not null);
create policy jornada_registros_ler on le_admin.jornada_registros for select to authenticated using(le_admin.jornada_leitura(jornada_registros));
create policy jornada_eventos_ler on le_admin.jornada_eventos for select to authenticated using(exists(select 1 from le_admin.jornada_registros r where r.id=registro_id and le_admin.jornada_leitura(r)));
create policy jornada_alertas_ler on le_admin.jornada_alertas for select to authenticated using(destinatario=auth.uid());
grant select on le_admin.jornada_acessos,le_admin.jornada_config,le_admin.jornada_registros,le_admin.jornada_eventos,le_admin.jornada_alertas to authenticated;
revoke insert,update,delete on le_admin.jornada_acessos,le_admin.jornada_config,le_admin.jornada_registros,le_admin.jornada_eventos,le_admin.jornada_alertas from authenticated,anon;

create or replace function le_admin.jornada_uteis(d date,n integer) returns date language plpgsql stable security definer set search_path='' as $$
declare c le_admin.jornada_config; x date:=d; i integer:=0;
begin
 select * into c from le_admin.jornada_config where id;
 if d is null then return null; end if;
 if n<0 or n>1000 then raise exception 'Prazo inválido'; end if;
 if c.calendario_de is null or d<c.calendario_de then raise exception 'Configure o calendário e os feriados antes de calcular prazos'; end if;
 while i<n loop
  x:=x+1;
  if extract(isodow from x)<6 and not(x=any(c.feriados)) then i:=i+1; end if;
 end loop;
 if c.calendario_ate is null or x>c.calendario_ate then raise exception 'Calendário não cobre o vencimento'; end if;
 return x;
end $$;
create or replace function le_admin.jornada_dias(d date) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from generate_series((now() at time zone 'America/Sao_Paulo')::date+1,d,interval '1 day') g,
 le_admin.jornada_config c where extract(isodow from g)<6 and not(g::date=any(c.feriados))
$$;
create or replace function le_admin.jornada_comprovante(p text) returns boolean language sql stable security definer set search_path='' as $$
 select p is not null and exists(select 1 from storage.objects where bucket_id='jornada-documentos' and name=p)
$$;

create or replace function le_admin.jornada_salvar(p_tipo text,p_contrato text,p_dados jsonb,p_id uuid default null,p_versao integer default 0)
returns le_admin.jornada_registros language plpgsql security definer set search_path='' as $$
declare r le_admin.jornada_registros; anterior jsonb:='{}'; d jsonb:=p_dados; pedido le_admin.jornada_registros;
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
   if d->>'entrada_confirmada' is distinct from 'true' or d->>'grupo_criado' is distinct from 'true' or d->>'imagens_enviadas' is distinct from 'true'
    or not le_admin.jornada_comprovante(d->>'grupo_arquivo') or not le_admin.jornada_comprovante(d->>'imagens_arquivo') or not le_admin.jornada_comprovante(d->>'planta_arquivo') or coalesce(d->>'planta_enviada_em','')='' then
    raise exception 'Liberação exige checklist completo, planta enviada e entrada confirmada'; end if;
   if d->>'tipo_venda'='Futura' and coalesce(d->>'imovel_pronto_em','')='' then raise exception 'Venda futura aguarda aviso do cliente'; end if;
   d:=d||jsonb_build_object('medicao_prazo',(d->>'liberacao_em')::date+5);
  end if;
  if coalesce(d->>'medicao_em','')<>'' then
   if coalesce(d->>'liberacao_em','')='' or (d->>'medicao_em')::date<(d->>'liberacao_em')::date then raise exception 'Medição deve ocorrer após a liberação'; end if;
   d:=d||jsonb_build_object('correcao_prazo',le_admin.jornada_uteis((d->>'medicao_em')::date,12));
  end if;
  if coalesce(d->>'correcao_em','')<>'' and (coalesce(d->>'medicao_em','')='' or (d->>'correcao_em')::date<(d->>'medicao_em')::date) then raise exception 'Conferência deve ocorrer após medição';end if;
  foreach k in array array['venda_data','liberacao_em','medicao_em','correcao_em','aprovacao_em','implantacao_em','cliente_recebe_em','entrega_em','montagem_concluida_em'] loop
   if coalesce(d->>k,'')<>'' and (d->>k)::date>data_hoje then raise exception 'Data de realização não pode ser futura: %',k;end if;
  end loop;
  if coalesce(d->>'aprovacao_em','')<>'' then
   if coalesce(d->>'correcao_em','')='' or coalesce(d->>'medicao_em','')='' or (d->>'aprovacao_em')::date<(d->>'correcao_em')::date then raise exception 'Conclua a conferência antes da aprovação do cliente'; end if;
   d:=d||jsonb_build_object('entrega_prazo',le_admin.jornada_uteis((d->>'aprovacao_em')::date,35));
  end if;
  if coalesce(d->>'implantacao_em','')<>'' then
   if coalesce(d->>'aprovacao_em','')='' or not le_admin.jornada_comprovante(d->>'guias_arquivo') or coalesce(d->>'pedido_fabrica','')='' then raise exception 'Implantação exige projeto aprovado, guias assinadas e número do pedido'; end if;
  end if;
  if d->>'fabrica_paga'='true' and coalesce(d->>'implantacao_em','')='' then raise exception 'Implante o pedido antes do pagamento da fábrica'; end if;
  if coalesce(d->>'cliente_recebe_em','')<>'' and not le_admin.jornada_comprovante(d->>'aceite_arquivo') then raise exception 'Anexe a confirmação de recebimento do cliente'; end if;
  if coalesce(d->>'cliente_recebe_em','')<>'' and coalesce(d->>'carregamento_em','')='' then raise exception 'Registre a previsão de carregamento'; end if;
  if coalesce(d->>'entrega_prevista','')<>'' then d:=d||jsonb_build_object('saldo_vencimento',(d->>'entrega_prevista')::date-2); end if;
  if coalesce(d->>'entrega_em','')<>'' and (d->>'fabrica_paga' is distinct from 'true' or coalesce(d->>'cliente_recebe_em','')='') then raise exception 'Entrega exige fábrica paga e aceite do cliente';end if;
  if coalesce(d->>'entrega_em','')<>'' and d->>'saldo_confirmado' is distinct from 'true' then raise exception 'Confirme a quitação antes da entrega'; end if;
  if coalesce(d->>'montagem_concluida_em','')<>'' and (coalesce(d->>'entrega_em','')='' or (d->>'montagem_concluida_em')::date<(d->>'entrega_em')::date) then raise exception 'Montagem deve ocorrer após entrega';end if;
  if coalesce(d->>'montagem_concluida_em','')<>'' and not le_admin.jornada_comprovante(d->>'termo_montagem_arquivo') then raise exception 'Anexe o termo de conclusão assinado'; end if;
  if coalesce(d->>'fotos_em','')<>'' and (coalesce(d->>'montagem_concluida_em','')='' or exists(select 1 from le_admin.jornada_registros x where x.tipo='assistencia' and x.contrato_id=p_contrato and x.dados->>'status' is distinct from 'Resolvida')) then raise exception 'Finalize montagem e assistências antes das fotos'; end if;
  if coalesce(d->>'venda_data','')<>'' then d:=d||jsonb_build_object('planta_prazo',le_admin.jornada_uteis((d->>'venda_data')::date,2)); end if;
  -- Marcos já registrados não mudam silenciosamente nem reiniciam prazos.
  foreach k in array array['venda_data','liberacao_em','medicao_em','aprovacao_em'] loop
   if coalesce(anterior->>k,'')<>'' and anterior->k is distinct from d->k then raise exception 'Marco já registrado não pode ser alterado: %',k; end if;
  end loop;
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

-- Os avisos são internos; nenhuma mensagem externa é enviada.
create or replace function le_admin.jornada_gerar_alertas() returns void language plpgsql security definer set search_path='' as $$
begin
 insert into le_admin.jornada_alertas(registro_id,destinatario,marco,vencimento)
 select r.id,a.usuario_id,
 case when (r.dados->>'vencimento')::date<(now() at time zone 'America/Sao_Paulo')::date then 'vencida'
 when le_admin.jornada_dias((r.dados->>'vencimento')::date)<=2 then '2'
 when le_admin.jornada_dias((r.dados->>'vencimento')::date)<=5 then '5' else '10' end,
 (r.dados->>'vencimento')::date
 from le_admin.jornada_registros r cross join le_admin.jornada_acessos a
 where r.tipo='assistencia' and r.dados->>'status'<>'Resolvida' and r.dados->>'vencimento' is not null
 and a.ativo and a.papel in ('logistica','gestor') and le_admin.jornada_dias((r.dados->>'vencimento')::date)<=10
 on conflict do nothing;
end $$;
revoke all on function le_admin.jornada_salvar(text,text,jsonb,uuid,integer),le_admin.jornada_gerar_alertas() from public,anon;
grant execute on function le_admin.jornada_salvar(text,text,jsonb,uuid,integer),le_admin.jornada_gerar_alertas() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('jornada-documentos','jornada-documentos',false,52428800) on conflict(id) do nothing;
create policy jornada_arquivos_insert on storage.objects for insert to authenticated with check(bucket_id='jornada-documentos' and le_admin.jornada_papel() in ('vendedor','correcao','financeiro','logistica','gestor') and (storage.foldername(name))[1]=auth.uid()::text);
create policy jornada_arquivos_select on storage.objects for select to authenticated using(bucket_id='jornada-documentos' and (le_admin.jornada_papel() in ('gestor','financeiro','logistica','correcao') or (le_admin.jornada_papel()='vendedor' and (storage.foldername(name))[1]=auth.uid()::text)));
notify pgrst,'reload schema';
commit;
