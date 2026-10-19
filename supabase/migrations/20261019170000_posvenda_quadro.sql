-- Quadro de pós-venda da Glauci (substitui o Trello) e base da previsibilidade de montagens.
-- O lado da logística fica em dados.posvenda da ficha do cliente; as travas financeiras continuam no servidor.

-- Prazos usados na previsibilidade (estimativas ajustáveis pela gestão, logística ou financeiro).
alter table le_admin.jornada_config add column if not exists prazos_operacao jsonb not null
 default '{"fabricas":{"Menezes":32,"Bartzen":21},"padrao_fabrica":30,"entrega_apos_pronto":7,"montagem_dias":5}'::jsonb;

create or replace function le_admin.posvenda_prazos_salvar(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k text;
begin
 if coalesce(le_admin.jornada_papel(),'') not in ('gestor','logistica','financeiro') then raise exception 'Somente gestão, logística ou financeiro ajustam os prazos'; end if;
 if jsonb_typeof(p->'fabricas')<>'object' then raise exception 'Informe os prazos por fábrica'; end if;
 for k in select key from jsonb_each(p->'fabricas') loop
  if jsonb_typeof(p->'fabricas'->k)<>'number' or (p->'fabricas'->>k)::numeric<=0 or (p->'fabricas'->>k)::numeric>200 then raise exception 'Prazo inválido para %',k; end if;
 end loop;
 foreach k in array array['padrao_fabrica','entrega_apos_pronto','montagem_dias'] loop
  if jsonb_typeof(p->k)<>'number' or (p->>k)::numeric<0 or (p->>k)::numeric>200 then raise exception 'Prazo inválido: %',k; end if;
 end loop;
 update le_admin.jornada_config set prazos_operacao=jsonb_build_object('fabricas',p->'fabricas','padrao_fabrica',p->'padrao_fabrica','entrega_apos_pronto',p->'entrega_apos_pronto','montagem_dias',p->'montagem_dias'),atualizado_em=now() where id=true;
 return p;
end $$;
grant execute on function le_admin.posvenda_prazos_salvar(jsonb) to authenticated;

-- Histórico do quadro do Trello (inclusive os cartões finalizados), somente leitura.
create table if not exists le_admin.posvenda_trello(
 trello_id text primary key,
 nome text not null,
 lista text not null,
 fechado boolean not null default false,
 etiquetas text[] not null default '{}',
 montadores text[] not null default '{}',
 fabrica text,
 descricao text,
 comentarios jsonb not null default '[]',
 datas jsonb not null default '{}',
 ultima_atividade timestamptz,
 registro_id uuid,
 importado_em timestamptz not null default now()
);
alter table le_admin.posvenda_trello enable row level security;
create policy posvenda_trello_ler on le_admin.posvenda_trello for select to authenticated
 using (coalesce(le_admin.jornada_papel(),'') in ('gestor','logistica','financeiro','correcao'));
grant select on le_admin.posvenda_trello to authenticated;

-- Regras do quadro dentro de jornada_salvar.
do $do$
declare f text; anchor text:=E'  for k in select unnest(array[''entrada_confirmada'',''saldo_confirmado'',''fabrica_paga'']) loop\n';
begin
 f:=replace(pg_get_functiondef('le_admin.jornada_salvar'::regproc),E'\r','');
 if position(anchor in f)=0 then raise exception 'jornada_salvar: ponto de inserção não encontrado'; end if;
 f:=replace(f,anchor,$ins$  -- Quadro de pós-venda: só a logística movimenta. Montagem e entrega exigem o saldo quitado,
  -- com o comprovante anexado e conferido pela Leia. Cartões que já passaram dessa etapa não são travados de novo.
  if d->'posvenda' is distinct from anterior->'posvenda' then
   if papel not in ('logistica','gestor') then raise exception 'O quadro de pós-venda é atualizado pela logística'; end if;
   if jsonb_typeof(d->'posvenda')<>'object' then raise exception 'Quadro de pós-venda inválido'; end if;
   for k in select key from jsonb_each_text(d->'posvenda') where key ~ '_em$' loop
    if coalesce(d->'posvenda'->>k,'')<>'' then perform (d->'posvenda'->>k)::date; end if;
   end loop;
   if coalesce(anterior->'posvenda'->>'coluna','') not in ('montagem','entrega_tecnica','pendencias','pecas','assistencia','finalizado') and (
      coalesce(d->'posvenda'->>'coluna','') in ('montagem','entrega_tecnica','pendencias','pecas','assistencia','finalizado')
      or (coalesce(d->'posvenda'->>'montador','')<>'' and d->'posvenda'->'montador' is distinct from anterior->'posvenda'->'montador')
      or (coalesce(d->'posvenda'->>'montagem_inicio_em','')<>'' and d->'posvenda'->'montagem_inicio_em' is distinct from anterior->'posvenda'->'montagem_inicio_em')
      or (coalesce(d->'posvenda'->>'entregue_em','')<>'' and d->'posvenda'->'entregue_em' is distinct from anterior->'posvenda'->'entregue_em')) then
    if d->>'saldo_confirmado' is distinct from 'true' or not le_admin.jornada_comprovante(d->>'saldo_confirmado_arquivo') then
     raise exception 'Montagem bloqueada: a Leia precisa anexar o comprovante do pagamento e conferir a quitação do saldo';
    end if;
   end if;
   -- Anotações são um histórico: as anteriores não mudam e as novas recebem autor e data do servidor.
   if jsonb_typeof(anterior->'posvenda'->'anotacoes')='array' then
    if jsonb_typeof(d->'posvenda'->'anotacoes') is distinct from 'array' or jsonb_array_length(d->'posvenda'->'anotacoes')<jsonb_array_length(anterior->'posvenda'->'anotacoes') then raise exception 'Anotações anteriores não podem ser apagadas'; end if;
    for i in 0..jsonb_array_length(anterior->'posvenda'->'anotacoes')-1 loop
     if d->'posvenda'->'anotacoes'->i is distinct from anterior->'posvenda'->'anotacoes'->i then raise exception 'Anotações anteriores não podem ser alteradas'; end if;
    end loop;
   end if;
   if jsonb_typeof(d->'posvenda'->'anotacoes')='array' then
    for i in coalesce(jsonb_array_length(anterior->'posvenda'->'anotacoes'),0)..jsonb_array_length(d->'posvenda'->'anotacoes')-1 loop
     if coalesce(d->'posvenda'->'anotacoes'->i->>'texto','')='' then raise exception 'Anotação vazia'; end if;
     d:=jsonb_set(d,array['posvenda','anotacoes',i::text],jsonb_build_object('texto',d->'posvenda'->'anotacoes'->i->>'texto','em',now(),'usuario',auth.uid()));
    end loop;
   end if;
   -- Origem no Trello é preservada.
   d:=jsonb_set(d,'{posvenda}',(d->'posvenda')-'trello'||case when anterior->'posvenda' ? 'trello' then jsonb_build_object('trello',anterior->'posvenda'->'trello') else '{}'::jsonb end);
  end if;
$ins$||anchor);
 f:=replace(f,E'declare r le_admin.jornada_registros;',E'declare i int; r le_admin.jornada_registros;');
 execute f;
end $do$;
