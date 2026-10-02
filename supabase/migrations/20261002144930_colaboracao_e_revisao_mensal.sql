begin;
create table le_admin.jornada_itens (
 id uuid primary key default gen_random_uuid(), registro_id uuid not null references le_admin.jornada_registros(id),
 tipo text not null check(tipo in ('tarefa','documento','observacao','excecao')),
 setor text not null check(setor in ('vendas','correcao','liberacao','montagem','qualidade','financeiro')),
 titulo text not null, dados jsonb not null, versao integer not null default 1,
 criado_por uuid not null references auth.users(id), criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index jornada_itens_registro on le_admin.jornada_itens(registro_id,tipo);
create unique index jornada_documento_versao on le_admin.jornada_itens((dados->>'grupo'),(dados->>'revisao')) where tipo='documento';
create table le_admin.jornada_itens_eventos (
 id bigint generated always as identity primary key,item_id uuid not null references le_admin.jornada_itens(id),
 autor uuid not null references auth.users(id),criado_em timestamptz not null default now(),anterior jsonb,atual jsonb not null
);
create index jornada_itens_eventos_item on le_admin.jornada_itens_eventos(item_id);
create or replace function le_admin.colaboracao_ler(p_registro uuid,p_setor text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from le_admin.jornada_registros r where r.id=p_registro and le_admin.jornada_leitura(r))
 and (p_setor<>'financeiro' or le_admin.jornada_papel() in ('gestor','financeiro'))
$$;
alter table le_admin.jornada_itens enable row level security;
alter table le_admin.jornada_itens_eventos enable row level security;
create policy colaboracao_itens_ler on le_admin.jornada_itens for select to authenticated using(le_admin.colaboracao_ler(registro_id,setor));
create policy colaboracao_eventos_ler on le_admin.jornada_itens_eventos for select to authenticated using(exists(select 1 from le_admin.jornada_itens i where i.id=item_id and le_admin.colaboracao_ler(i.registro_id,i.setor)));
grant select on le_admin.jornada_itens,le_admin.jornada_itens_eventos to authenticated;
revoke insert,update,delete on le_admin.jornada_itens,le_admin.jornada_itens_eventos from authenticated,anon;

create or replace function le_admin.colaboracao_salvar(p_registro uuid,p_tipo text,p_dados jsonb,p_id uuid default null,p_versao integer default 0) returns le_admin.jornada_itens language plpgsql security definer set search_path='' as $$
declare r le_admin.jornada_registros;i le_admin.jornada_itens;old jsonb;d jsonb;papel text:=le_admin.jornada_papel();v_setor text:=p_dados->>'setor';grupo text;rev integer;destino uuid;
begin
 if auth.uid() is null or coalesce(papel,'') not in ('gestor','financeiro','vendedor','correcao','logistica') then raise exception 'Acesso não autorizado';end if;
 select * into r from le_admin.jornada_registros where id=p_registro for update;
 if not found or not le_admin.colaboracao_ler(p_registro,v_setor) then raise exception 'Registro não disponível';end if;
 if v_setor is null or v_setor not in ('vendas','correcao','liberacao','montagem','qualidade','financeiro') or p_tipo is null or p_tipo not in ('tarefa','documento','observacao','excecao') or jsonb_typeof(p_dados) is distinct from 'object' or nullif(trim(p_dados->>'titulo'),'') is null then raise exception 'Informe tipo, setor e título';end if;
 if p_id is null and papel='vendedor' and v_setor<>'vendas' then raise exception 'Vendedor registra informações de vendas';end if;
 if p_id is null and papel='correcao' and v_setor not in ('correcao','liberacao') then raise exception 'Conferente registra informações técnicas';end if;
 if p_id is null and papel='logistica' and v_setor not in ('montagem','qualidade','liberacao') then raise exception 'Logística registra informações da operação';end if;
 if p_id is not null then
  select * into i from le_admin.jornada_itens where id=p_id for update;
  if not found or i.registro_id<>p_registro or i.tipo<>p_tipo or i.setor<>v_setor then raise exception 'Vínculo do item não pode mudar';end if;
  if i.versao<>p_versao then raise exception 'Item atualizado por outra pessoa';end if;
  if p_tipo<>'tarefa' then raise exception 'Registro preservado: adicione nova informação ou nova versão';end if;
  old:=to_jsonb(i);
  if i.dados->>'concluida'='true' then raise exception 'Tarefa concluída é preservada. Crie nova tarefa relacionada';end if;
 end if;
 d:=jsonb_build_object('descricao',coalesce(p_dados->>'descricao',''));
 if p_tipo='tarefa' then
  if nullif(p_dados->>'prazo','') is null or coalesce(p_dados->>'responsavel_papel','') not in ('vendedor','correcao','logistica','financeiro','gestor') then raise exception 'Informe prazo e setor responsável';end if;
  perform (p_dados->>'prazo')::date;
  if v_setor='financeiro' and p_dados->>'responsavel_papel' not in ('financeiro','gestor') then raise exception 'Tarefa financeira exige responsável financeiro ou gestão';end if;
  destino:=nullif(p_dados->>'responsavel_id','')::uuid;
  if destino is not null and not exists(select 1 from le_admin.jornada_acessos a where a.usuario_id=destino and a.ativo and a.papel=p_dados->>'responsavel_papel') then raise exception 'Responsável não está ativo no setor';end if;
  if destino is not null and p_dados->>'responsavel_papel'='vendedor' and destino<>r.criado_por then raise exception 'Selecione o vendedor com acesso ao registro';end if;
  if coalesce(p_dados->>'bloqueia','') not in ('','liberacao_em','implantacao_em','confirmada','entrega_em','fotos_em') then raise exception 'Marco de bloqueio inválido';end if;
  if p_id is not null and ((i.dados-'concluida'-'conclusao'-'concluida_em'-'concluida_por') is distinct from (d||jsonb_build_object('prazo',p_dados->>'prazo','responsavel_papel',p_dados->>'responsavel_papel','responsavel_id',destino,'bloqueia',coalesce(p_dados->>'bloqueia','')))) then raise exception 'Prazo e atribuição preservados; registre nova tarefa para corrigir';end if;
  d:=d||jsonb_build_object('prazo',p_dados->>'prazo','responsavel_papel',p_dados->>'responsavel_papel','responsavel_id',destino,'bloqueia',coalesce(p_dados->>'bloqueia',''),'concluida',false);
  if p_dados->>'concluida'='true' then
   if p_id is null then raise exception 'Crie a tarefa antes de concluir';end if;
   if papel<>'gestor' and (papel<>i.dados->>'responsavel_papel' or (destino is not null and destino<>auth.uid())) then raise exception 'Somente responsável ou gestão conclui a tarefa';end if;
   if nullif(trim(p_dados->>'conclusao'),'') is null then raise exception 'Descreva como a pendência foi resolvida';end if;
   d:=d||jsonb_build_object('concluida',true,'conclusao',p_dados->>'conclusao','concluida_em',now(),'concluida_por',auth.uid());
  end if;
 elsif p_tipo='documento' then
  if not exists(select 1 from storage.objects o where o.bucket_id='jornada-anexos' and o.name=p_dados->>'arquivo' and split_part(o.name,'/',1)=auth.uid()::text) then raise exception 'Anexe um arquivo privado próprio antes de registrar';end if;
  grupo:=coalesce(nullif(p_dados->>'grupo',''),gen_random_uuid()::text);
  if exists(select 1 from le_admin.jornada_itens x where x.tipo='documento' and x.dados->>'grupo'=grupo and (x.registro_id<>p_registro or x.setor<>v_setor)) then raise exception 'Versão pertence a outro registro ou setor';end if;
  select coalesce(max((x.dados->>'revisao')::integer),0)+1 into rev from le_admin.jornada_itens x where x.tipo='documento' and x.dados->>'grupo'=grupo;
  d:=d||jsonb_build_object('grupo',grupo,'revisao',rev,'arquivo',p_dados->>'arquivo','nome',p_dados->>'nome','categoria',coalesce(p_dados->>'categoria','Documento'),'ambiente',coalesce(p_dados->>'ambiente',''));
 elsif p_tipo='excecao' then
  if coalesce(p_dados->>'categoria','') not in ('Pagamento parcial','Entrega parcial','Várias fábricas','Troca de vendedor','Cancelamento','Assistência reaberta','Outro') or nullif(trim(p_dados->>'descricao'),'') is null then raise exception 'Informe a situação e sua justificativa';end if;
  d:=d||jsonb_build_object('categoria',p_dados->>'categoria','status','Em análise');
 end if;
 if p_id is null then
  insert into le_admin.jornada_itens(registro_id,tipo,setor,titulo,dados,criado_por) values(p_registro,p_tipo,v_setor,trim(p_dados->>'titulo'),d,auth.uid()) returning * into i;
 else
  update le_admin.jornada_itens set dados=d,versao=versao+1,atualizado_em=now() where id=p_id returning * into i;
 end if;
 insert into le_admin.jornada_itens_eventos(item_id,autor,anterior,atual) values(i.id,auth.uid(),old,to_jsonb(i));
 return i;
end $$;

create or replace function le_admin.colaboracao_bloquear_marco() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;
begin
 foreach k in array array['liberacao_em','implantacao_em','confirmada','entrega_em','fotos_em'] loop
  if coalesce(new.dados->>k,'') not in ('','false') and (tg_op='INSERT' or new.dados->k is distinct from old.dados->k) and exists(
   select 1 from le_admin.jornada_itens i join le_admin.jornada_registros r on r.id=i.registro_id
   where r.contrato_id=new.contrato_id and i.tipo='tarefa' and i.dados->>'bloqueia'=k and i.dados->>'concluida' is distinct from 'true') then raise exception 'Há pendência bloqueante deste contrato. Resolva a tarefa antes de avançar';end if;
 end loop;return new;
end $$;
create trigger colaboracao_marcos before insert or update on le_admin.jornada_registros for each row execute function le_admin.colaboracao_bloquear_marco();

insert into storage.buckets(id,name,public,file_size_limit) values('jornada-anexos','jornada-anexos',false,52428800) on conflict(id) do nothing;
create policy colaboracao_upload on storage.objects for insert to authenticated with check(bucket_id='jornada-anexos' and le_admin.jornada_papel() in ('gestor','financeiro','vendedor','correcao','logistica') and split_part(name,'/',1)=auth.uid()::text);
create policy colaboracao_download on storage.objects for select to authenticated using(bucket_id='jornada-anexos' and exists(select 1 from le_admin.jornada_itens i where i.tipo='documento' and i.dados->>'arquivo'=name and le_admin.colaboracao_ler(i.registro_id,i.setor)));

-- Revisão mensal documentada. Não equivale a fechamento contábil nem conciliação automática.
create table le_admin.revisoes_mensais (
 mes date primary key check(extract(day from mes)=1),versao integer not null default 1,
 status text not null check(status in ('Em revisão','Conferido')),checklist jsonb not null,
 observacoes text not null default '',conferido_por uuid references auth.users(id),conferido_em timestamptz
);
create table le_admin.revisoes_mensais_eventos (
 id bigint generated always as identity primary key,mes date not null references le_admin.revisoes_mensais(mes),
 autor uuid not null references auth.users(id),criado_em timestamptz not null default now(),motivo text not null,anterior jsonb,atual jsonb not null
);
alter table le_admin.revisoes_mensais enable row level security;
alter table le_admin.revisoes_mensais_eventos enable row level security;
create policy revisoes_ler on le_admin.revisoes_mensais for select to authenticated using(le_admin.jornada_papel() in ('financeiro','gestor'));
create policy revisoes_eventos_ler on le_admin.revisoes_mensais_eventos for select to authenticated using(le_admin.jornada_papel() in ('financeiro','gestor'));
grant select on le_admin.revisoes_mensais,le_admin.revisoes_mensais_eventos to authenticated;
revoke insert,update,delete on le_admin.revisoes_mensais,le_admin.revisoes_mensais_eventos from authenticated,anon;
create or replace function le_admin.revisao_mensal_salvar(p_mes date,p_checklist jsonb,p_observacoes text,p_versao integer default 0,p_conferir boolean default false,p_reabrir boolean default false,p_motivo text default '') returns le_admin.revisoes_mensais language plpgsql security definer set search_path='' as $$
declare r le_admin.revisoes_mensais;old jsonb;checklist jsonb:='{}';k text;papel text:=le_admin.jornada_papel();
begin
 if auth.uid() is null or coalesce(papel,'') not in ('gestor','financeiro') then raise exception 'Somente Leia/financeiro e gestão revisam o mês';end if;
 if p_mes is null or extract(day from p_mes)<>1 or p_mes>(now() at time zone 'America/Sao_Paulo')::date or p_conferir is null or p_reabrir is null then raise exception 'Mês ou operação inválida';end if;
 perform pg_advisory_xact_lock(hashtext('revisao:'||p_mes::text));
 select * into r from le_admin.revisoes_mensais where mes=p_mes for update;
 if coalesce(r.versao,0)<>p_versao then raise exception 'Revisão alterada por outra pessoa';end if;
 old:=case when r.mes is null then null else to_jsonb(r) end;
 if r.status='Conferido' then
  if not p_reabrir or papel<>'gestor' or not exists(select 1 from le_admin.jornada_acessos a where a.usuario_id=auth.uid() and a.ativo and a.aprovadora in ('Priscila','Andressa','Catelli')) or nullif(trim(p_motivo),'') is null or p_conferir then raise exception 'Mês conferido: gestão deve reabrir com justificativa';end if;
  checklist:=r.checklist;p_observacoes:=r.observacoes;
 elsif p_reabrir then raise exception 'O mês não está conferido';
 else
  if jsonb_typeof(p_checklist) is distinct from 'object' then raise exception 'Checklist inválido';end if;
  foreach k in array array['obrigacoes','documentos','pagamentos','recebimentos','conciliacao','duplicidades','rateios'] loop
   checklist:=checklist||jsonb_build_object(k,coalesce((p_checklist->>k)::boolean,false));
   if p_conferir and checklist->>k is distinct from 'true' then raise exception 'Conclua todas as conferências';end if;
  end loop;
 end if;
 if p_conferir and (p_mes+interval '1 month')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Espere terminar o mês para concluir sua revisão';end if;
 insert into le_admin.revisoes_mensais(mes,status,checklist,observacoes,conferido_por,conferido_em)
 values(p_mes,case when p_conferir then 'Conferido' else 'Em revisão' end,checklist,coalesce(p_observacoes,''),case when p_conferir then auth.uid() end,case when p_conferir then now() end)
 on conflict(mes) do update set status=excluded.status,checklist=excluded.checklist,observacoes=excluded.observacoes,versao=revisoes_mensais.versao+1,conferido_por=excluded.conferido_por,conferido_em=excluded.conferido_em returning * into r;
 insert into le_admin.revisoes_mensais_eventos(mes,autor,motivo,anterior,atual) values(p_mes,auth.uid(),case when p_reabrir then p_motivo when p_conferir then 'Conferência concluída' else 'Checklist atualizado' end,old,to_jsonb(r));
 return r;
end $$;
revoke all on function le_admin.colaboracao_ler(uuid,text),le_admin.colaboracao_salvar(uuid,text,jsonb,uuid,integer),le_admin.colaboracao_bloquear_marco(),le_admin.revisao_mensal_salvar(date,jsonb,text,integer,boolean,boolean,text) from public,anon;
grant execute on function le_admin.colaboracao_ler(uuid,text),le_admin.colaboracao_salvar(uuid,text,jsonb,uuid,integer),le_admin.revisao_mensal_salvar(date,jsonb,text,integer,boolean,boolean,text) to authenticated;
-- Protege os períodos conferidos nas fontes legadas, se presentes no ambiente.
create or replace function le_admin.revisao_proteger_periodo() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb;k text;m date;
begin
 for d in select x from jsonb_array_elements(jsonb_build_array(case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end)) x loop
  foreach k in array tg_argv loop
   if nullif(d->>k,'') is not null then
    m:=date_trunc('month',(d->>k)::date)::date;
    -- Mesmo lock da conferência: uma gravação não pode passar durante fechamento concorrente.
    perform pg_advisory_xact_lock(hashtext('revisao:'||m::text));
    if exists(select 1 from le_admin.revisoes_mensais where mes=m and status='Conferido') then raise exception 'Mês conferido. A gestão deve reabrir a revisão com justificativa';end if;
   end if;
  end loop;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
do $$
declare t text;campos text;nomes text[];
begin
 foreach t in array array['pagamentos','a_receber','custos_operacionais','vendas','assistencias'] loop
  if to_regclass('le_admin.'||t) is not null then
   nomes:=case t when 'pagamentos' then array['data','data_vencimento','data_pagamento'] when 'a_receber' then array['data_prevista','data_recebimento'] when 'vendas' then array['data_venda'] when 'assistencias' then array['data_assistencia'] else array['data'] end;
   select string_agg(quote_literal(n),',') into campos from unnest(nomes) n;
   execute format('create trigger revisao_periodo before insert or update or delete on le_admin.%I for each row execute function le_admin.revisao_proteger_periodo(%s)',t,campos);
  end if;
 end loop;
end $$;
revoke all on function le_admin.revisao_proteger_periodo() from public,anon,authenticated;

create table le_admin.montador_indisponibilidades (
 id uuid primary key default gen_random_uuid(),montador_id uuid not null references le_admin.jornada_acessos(usuario_id),
 inicio date not null,fim date not null check(fim>=inicio),motivo text not null,
 criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now(),
 cancelado_em timestamptz,cancelado_por uuid references auth.users(id),cancelamento_motivo text
);
create index montador_indisponivel_periodo on le_admin.montador_indisponibilidades(montador_id,inicio,fim);
alter table le_admin.montador_indisponibilidades enable row level security;
create policy indisponibilidade_ler on le_admin.montador_indisponibilidades for select to authenticated using(le_admin.jornada_papel() in ('logistica','gestor') or montador_id=auth.uid());
grant select on le_admin.montador_indisponibilidades to authenticated;
revoke insert,update,delete on le_admin.montador_indisponibilidades from authenticated,anon;
create or replace function le_admin.montador_indisponivel(p_montador uuid,p_inicio date,p_fim date,p_motivo text) returns le_admin.montador_indisponibilidades language plpgsql security definer set search_path='' as $$
declare r le_admin.montador_indisponibilidades;
begin
 if auth.uid() is null or coalesce(le_admin.jornada_papel(),'') not in ('gestor','logistica') then raise exception 'Somente logística e gestão';end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or nullif(trim(p_motivo),'') is null then raise exception 'Informe período e motivo';end if;
 if not exists(select 1 from le_admin.jornada_acessos where usuario_id=p_montador and papel='montador' and ativo) then raise exception 'Montador não cadastrado';end if;
 perform pg_advisory_xact_lock(hashtext(p_montador::text));
 if exists(select 1 from le_admin.jornada_registros a where a.tipo='agenda' and a.dados->>'montador_id'=p_montador::text and (a.dados->>'inicio')::date<=p_fim and (a.dados->>'fim')::date>=p_inicio) then raise exception 'Há montagem reservada nesse período; ajuste a agenda antes';end if;
 insert into le_admin.montador_indisponibilidades(montador_id,inicio,fim,motivo,criado_por) values(p_montador,p_inicio,p_fim,p_motivo,auth.uid()) returning * into r;return r;
end $$;
create or replace function le_admin.montador_validar_agenda() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='agenda' then
  perform pg_advisory_xact_lock(hashtext(new.dados->>'montador_id'));
  if exists(select 1 from le_admin.montador_indisponibilidades i where i.cancelado_em is null and i.montador_id::text=new.dados->>'montador_id' and i.inicio<=(new.dados->>'fim')::date and i.fim>=(new.dados->>'inicio')::date) then raise exception 'Montador indisponível neste período';end if;
  if new.dados ? 'dias_estimados' and coalesce(new.dados->>'dias_estimados','')<>'' and (new.dados->>'dias_estimados')::numeric<=0 then raise exception 'Estimativa de dias deve ser positiva';end if;
 end if;return new;
end $$;
create trigger montador_disponibilidade before insert or update on le_admin.jornada_registros for each row execute function le_admin.montador_validar_agenda();
revoke all on function le_admin.montador_indisponivel(uuid,date,date,text),le_admin.montador_validar_agenda() from public,anon;
grant execute on function le_admin.montador_indisponivel(uuid,date,date,text) to authenticated;
create or replace function le_admin.montador_cancelar_indisponibilidade(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare r le_admin.montador_indisponibilidades;
begin
 if auth.uid() is null or coalesce(le_admin.jornada_papel(),'') not in ('gestor','logistica') or nullif(trim(p_motivo),'') is null then raise exception 'Logística ou gestão deve informar o motivo';end if;
 select * into r from le_admin.montador_indisponibilidades where id=p_id;
 if not found then raise exception 'Período não encontrado';end if;
 perform pg_advisory_xact_lock(hashtext(r.montador_id::text));
 update le_admin.montador_indisponibilidades set cancelado_em=now(),cancelado_por=auth.uid(),cancelamento_motivo=p_motivo where id=p_id and cancelado_em is null;
end $$;
revoke all on function le_admin.montador_cancelar_indisponibilidade(uuid,text) from public,anon;
grant execute on function le_admin.montador_cancelar_indisponibilidade(uuid,text) to authenticated;
create or replace function le_admin.colaboracao_excecao_decidir(p_id uuid,p_status text,p_motivo text,p_versao integer) returns le_admin.jornada_itens language plpgsql security definer set search_path='' as $$
declare i le_admin.jornada_itens;anterior jsonb;nome text;
begin
 select aprovadora into nome from le_admin.jornada_acessos where usuario_id=auth.uid() and ativo and papel='gestor';
 if nome is null or nome not in ('Priscila','Andressa','Catelli') then raise exception 'Decisão exige Priscila, Andressa ou Catelli autenticada';end if;
 select * into i from le_admin.jornada_itens where id=p_id for update;
 if not found or i.tipo<>'excecao' then raise exception 'Exceção não encontrada';end if;
 if i.versao<>p_versao then raise exception 'Item atualizado por outra pessoa';end if;
 if nullif(trim(p_motivo),'') is null then raise exception 'Informe a decisão e providências';end if;
 if p_status is null or not ((i.dados->>'status'='Em análise' and p_status in ('Em tratamento','Rejeitada')) or (i.dados->>'status'='Em tratamento' and p_status='Resolvida')) then raise exception 'Transição de exceção inválida';end if;
 anterior:=to_jsonb(i);
 update le_admin.jornada_itens set dados=dados||jsonb_build_object('status',p_status,'decisao',p_motivo,'decidido_por',nome,'decidido_em',now()),versao=versao+1,atualizado_em=now() where id=p_id returning * into i;
 insert into le_admin.jornada_itens_eventos(item_id,autor,anterior,atual) values(p_id,auth.uid(),anterior,to_jsonb(i));
 return i;
end $$;
revoke all on function le_admin.colaboracao_excecao_decidir(uuid,text,text,integer) from public,anon;
grant execute on function le_admin.colaboracao_excecao_decidir(uuid,text,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;

