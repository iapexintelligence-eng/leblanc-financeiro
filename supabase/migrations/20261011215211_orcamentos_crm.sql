begin;
create table le_admin.comercial_orcamentos (
 id uuid primary key default gen_random_uuid(),
 lead_id text references leblanc.leads(id),
 criado_por uuid not null references auth.users(id),
 versao integer not null default 1,
 dados jsonb not null,
 contrato_id text unique,
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now()
);
create index comercial_orcamentos_lead on le_admin.comercial_orcamentos(lead_id);
create index comercial_orcamentos_autor on le_admin.comercial_orcamentos(criado_por);
create table le_admin.comercial_orcamento_versoes (
 orcamento_id uuid references le_admin.comercial_orcamentos(id),
 versao integer not null, dados jsonb not null,
 autor uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 primary key(orcamento_id,versao)
);
alter table le_admin.comercial_orcamentos enable row level security;
alter table le_admin.comercial_orcamento_versoes enable row level security;
create policy orcamentos_ler on le_admin.comercial_orcamentos for select to authenticated
 using(le_admin.jornada_papel() in ('gestor','financeiro') or (le_admin.jornada_papel()='vendedor' and criado_por=auth.uid()));
create policy orcamentos_versoes_ler on le_admin.comercial_orcamento_versoes for select to authenticated
 using(exists(select 1 from le_admin.comercial_orcamentos o where o.id=orcamento_id));
grant select on le_admin.comercial_orcamentos,le_admin.comercial_orcamento_versoes to authenticated;

create function le_admin.orcamento_salvar(p_id uuid,p_versao integer,p_dados jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare o le_admin.comercial_orcamentos; papel text:=le_admin.jornada_papel(); d jsonb:=p_dados;
 item jsonb; original numeric:=0; base numeric; desconto numeric;
begin
 if auth.uid() is null or papel is null or papel not in ('gestor','financeiro','vendedor') then raise exception 'Acesso comercial não autorizado'; end if;
 if coalesce(trim(d->>'cliente_nome'),'')='' then raise exception 'Informe o cliente'; end if;
 if d->>'regras_versao' is distinct from '2026-09-28' then raise exception 'Versão de regras inválida'; end if;
 if p_id is not null then
  select * into o from le_admin.comercial_orcamentos where id=p_id for update;
  if not found or (papel='vendedor' and o.criado_por<>auth.uid()) then raise exception 'Orçamento indisponível para este usuário'; end if;
  if o.contrato_id is not null then raise exception 'Orçamento já convertido. Continue pelo contrato'; end if;
  if o.versao is distinct from p_versao then raise exception 'Orçamento alterado por outra pessoa. Reabra antes de salvar'; end if;
  if o.lead_id is distinct from nullif(d->>'lead_id','') then raise exception 'Não é permitido trocar o cliente vinculado'; end if;
 end if;
 for item in select * from jsonb_array_elements(d->'itens') loop
  if coalesce((item->>'valor')::numeric,0)<0 or coalesce((item->>'qtd')::numeric,1)<=0 then raise exception 'Item inválido'; end if;
  original:=original+coalesce((item->>'valor')::numeric,0)*coalesce((item->>'qtd')::numeric,1);
 end loop;
 original:=round(original,2);base:=original+round(original*0.15,2);
 desconto:=round(case when d->>'desconto_tipo' in ('pct','%') then base*coalesce((d->>'desconto_valor')::numeric,0)/100 else coalesce((d->>'desconto_valor')::numeric,0) end,2);
 if desconto<0 or desconto>base then raise exception 'Desconto inválido'; end if;
 d:=(d-'desconto_aprovado'-'desconto_aprovado_por')||jsonb_build_object('valor_promob',original,'total_pedido',base,'valor_negociado',base-desconto,'acrescimo_marketing',round(original*0.15,2));
 if p_id is null then
  insert into le_admin.comercial_orcamentos(lead_id,criado_por,dados) values(nullif(d->>'lead_id',''),auth.uid(),d) returning * into o;
 else
  update le_admin.comercial_orcamentos set dados=d,versao=versao+1,atualizado_em=now() where id=p_id returning * into o;
 end if;
 insert into le_admin.comercial_orcamento_versoes(orcamento_id,versao,dados,autor) values(o.id,o.versao,d,auth.uid());
 return to_jsonb(o);
end $$;

create function le_admin.orcamento_converter(p_id uuid,p_versao integer) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare o le_admin.comercial_orcamentos; papel text:=le_admin.jornada_papel(); c jsonb; d jsonb;
begin
 if auth.uid() is null or papel is null or papel not in ('gestor','financeiro','vendedor') then raise exception 'Acesso comercial não autorizado'; end if;
 select * into o from le_admin.comercial_orcamentos where id=p_id for update;
 if not found or (papel='vendedor' and o.criado_por<>auth.uid()) then raise exception 'Orçamento indisponível para este usuário'; end if;
 if o.contrato_id is not null then
  select to_jsonb(x) into c from leblanc.contratos x where id::text=o.contrato_id;
  return c;
 end if;
 if o.versao is distinct from p_versao then raise exception 'Orçamento mudou. Reabra antes de gerar contrato'; end if;
 if exists(select 1 from unnest(array['cliente_nome','cliente_cpf','cliente_telefone','endereco','bairro','cidade','uf','cep','vendedor']) k where coalesce(trim(o.dados->>k),'')='') then raise exception 'Complete nome, CPF/CNPJ, telefone, endereço, bairro, cidade, UF, CEP e vendedor antes de gerar contrato'; end if;
 d:=o.dados||jsonb_build_object('orcamento_id',o.id,'orcamento_versao',o.versao,'numero','CRM-'||o.id::text);
 c:=le_admin.comercial_salvar(null,d);
 update le_admin.comercial_orcamentos set contrato_id=c->>'id',atualizado_em=now() where id=o.id;
 return c;
end $$;
revoke all on function le_admin.orcamento_salvar(uuid,integer,jsonb),le_admin.orcamento_converter(uuid,integer) from public,anon;
grant execute on function le_admin.orcamento_salvar(uuid,integer,jsonb),le_admin.orcamento_converter(uuid,integer) to authenticated;
commit;
