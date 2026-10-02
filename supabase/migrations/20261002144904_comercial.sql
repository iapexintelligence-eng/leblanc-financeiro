begin;
create table le_admin.comercial_aprovacoes (
 id uuid primary key default gen_random_uuid(), contrato_id text not null,
 resumo text not null, versao_hash text not null, solicitante uuid not null references auth.users(id),
 aprovado_por uuid references auth.users(id), aprovadora text, aprovado_em timestamptz,
 criado_em timestamptz not null default now(), unique(contrato_id,versao_hash)
);
create table le_admin.comercial_recebiveis (
 id uuid primary key default gen_random_uuid(), contrato_id text not null, numero integer not null,
 valor numeric(14,2) not null check(valor>0), vencimento date, marco text,
 status text not null default 'Pendente', unique(contrato_id,numero)
);
alter table le_admin.comercial_aprovacoes enable row level security;
alter table le_admin.comercial_recebiveis enable row level security;
create policy comercial_aprovacoes_select on le_admin.comercial_aprovacoes for select to authenticated using(le_admin.jornada_papel() in ('financeiro','gestor') or solicitante=auth.uid());
create policy comercial_recebiveis_select on le_admin.comercial_recebiveis for select to authenticated using(le_admin.jornada_papel() in ('financeiro','gestor'));
grant select on le_admin.comercial_aprovacoes,le_admin.comercial_recebiveis to authenticated;
create or replace function le_admin.comercial_hash(d jsonb) returns text language sql immutable set search_path='' as $$
 select md5(jsonb_build_object('itens',d->'itens','desconto',d->'desconto_valor','tipo',d->'desconto_tipo','formas',d->'formas_pagamento','parcelas',d->'parcelas','kits',d->'itens_extras','entrada',d->'entrada_percentual','motivo',d->'excecao_motivo')::text)
$$;
create or replace function le_admin.comercial_salvar(p_id text,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c leblanc.contratos; d jsonb:=p_dados; item jsonb; par jsonb; original numeric:=0; base numeric; desconto numeric; pct numeric; limite numeric:=100;
 total numeric:=0; previsto numeric:=0; alocado numeric:=0; n integer:=0; motivo text:=''; h text; autorizado boolean; situacao text; papel text:=le_admin.jornada_papel(); antiga jsonb;
begin
 if papel is null or papel not in ('gestor','financeiro','vendedor') then raise exception 'Acesso comercial não autorizado'; end if;
 if coalesce(trim(d->>'cliente_nome'),'')='' then raise exception 'Informe o cliente'; end if;
 if d->>'regras_versao' is distinct from '2026-09-28' then raise exception 'Versão de regras inválida'; end if;
 if p_id is not null then
  select * into c from leblanc.contratos where id::text=p_id for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  antiga:=c.dados_json;
  if antiga->>'regras_versao' is distinct from '2026-09-28' then raise exception 'Contrato histórico: migração comercial deve ser revisada antes de editar valores'; end if;
  if papel='vendedor' and antiga->>'criado_por' is distinct from auth.uid()::text then raise exception 'Contrato de outro vendedor'; end if;
  if exists(select 1 from le_admin.comercial_recebiveis where contrato_id=p_id and status<>'Pendente') then raise exception 'Contrato com recebimento: use aditivo, preservando os pagamentos'; end if;
 end if;
 if jsonb_array_length(coalesce(d->'itens_extras','[]'))>0 then raise exception 'Kits: regra de aplicação do desconto ainda pendente; salve o cadastro no controle interno antes de emitir'; end if;
 for item in select * from jsonb_array_elements(d->'itens') loop
  if coalesce((item->>'valor')::numeric,0)<0 or coalesce((item->>'qtd')::numeric,1)<=0 then raise exception 'Item com valor ou quantidade inválidos'; end if;
  original:=original+coalesce((item->>'valor')::numeric,0)*coalesce((item->>'qtd')::numeric,1);
  limite:=least(limite,case item->>'fornecedor' when 'Bartzen' then 40 when 'Menezes' then 50 else 0 end);
 end loop;
 original:=round(original,2);base:=round(original*1.15,2);
 desconto:=round(case when d->>'desconto_tipo' in ('pct','%') then base*coalesce((d->>'desconto_valor')::numeric,0)/100 else coalesce((d->>'desconto_valor')::numeric,0) end,2);
 if desconto<0 or desconto>base then raise exception 'Desconto inválido'; end if;
 pct:=case when base>0 then desconto/base*100 else 0 end;
 if pct>limite+0.00001 then motivo:='Desconto superior ao limite da indústria. '; end if;
 if coalesce((d->>'entrada_percentual')::numeric,60)<>60 then motivo:=motivo||'Entrada diferente de 60%. '; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(d->'formas_pagamento','[]')) x where x->>'absorver'='true') then motivo:=motivo||'Loja absorvendo taxas. '; end if;
 for par in select * from jsonb_array_elements(coalesce(d->'parcelas','[]')) loop
  if coalesce((par->>'valor')::numeric,0)<=0 then raise exception 'Parcela deve ter valor positivo'; end if;
  total:=total+(par->>'valor')::numeric;n:=n+1;
 end loop;
 for par in select * from jsonb_array_elements(coalesce(d->'formas_pagamento','[]')) loop
  previsto:=previsto+le_admin.comercial_total_forma(par);alocado:=alocado+coalesce((par->>'valor')::numeric,0);
 end loop;
 if jsonb_array_length(coalesce(d->'formas_pagamento','[]'))=0 then raise exception 'Registre as formas de pagamento'; end if;
 if abs(alocado-(base-desconto))>0.01 or abs(previsto-total)>0.01 then raise exception 'Simulação e parcelas divergem dos valores calculados pelo servidor'; end if;
 if not exists(select 1 from jsonb_array_elements(d->'formas_pagamento') x where x->>'forma'<>'Pix / À vista') then
  if n<>2 or abs(coalesce((d->'parcelas'->0->>'valor')::numeric,0)-round((base-desconto)*0.60,2))>0.01 or d->'parcelas'->1->>'marco' is distinct from 'dois_dias_antes_entrega' then motivo:=motivo||'Condição à vista diferente de 60/40. ';end if;
 end if;
 if n=0 or total<base-desconto-0.01 then raise exception 'Parcelas não cobrem a proposta'; end if;
 if n>48 then raise exception 'Quantidade de parcelas inválida'; end if;
 if total>base-desconto+0.01 and jsonb_array_length(coalesce(d->'formas_pagamento','[]'))=0 then raise exception 'Registre a simulação que originou as taxas'; end if;
 h:=le_admin.comercial_hash(d);
 select exists(select 1 from le_admin.comercial_aprovacoes where contrato_id=p_id and versao_hash=h and aprovado_em is not null) into autorizado;
 situacao:=case when motivo<>'' and not autorizado then 'Aguardando aprovação' else 'Emitido' end;
 d:=(d-'desconto_aprovado'-'desconto_aprovado_por')||jsonb_build_object('total_pedido',base,'valor_promob',original,'acrescimo_marketing',round(original*0.15,2),'valor_negociado',base-desconto,'total_cliente',total,'criado_por',coalesce(antiga->>'criado_por',auth.uid()::text),'desconto_aprovado',autorizado,'regras_versao','2026-09-28');
 if p_id is null then
  insert into leblanc.contratos(numero,cliente_nome,cliente_cpf,cliente_telefone,cliente_endereco,projeto_ambientes,vendor,modelo_contrato,valor_tabela,desconto_tipo,desconto_entrada,valor_desconto,valor_final,forma_pagamento,parcelas,status,observacoes,dados_json)
  values(d->>'numero',d->>'cliente_nome',d->>'cliente_cpf',d->>'cliente_telefone',concat_ws(', ',d->>'endereco',d->>'bairro',d->>'cidade',d->>'uf'),(select string_agg(x->>'descricao','; ') from jsonb_array_elements(d->'itens') x),d->>'vendedor',d->>'modelo_contrato',base,d->>'desconto_tipo',coalesce((d->>'desconto_valor')::numeric,0),desconto,total,d->>'forma_pagamento',n,situacao,d->>'observacoes',d) returning * into c;
 else
  update leblanc.contratos set cliente_nome=d->>'cliente_nome',cliente_cpf=d->>'cliente_cpf',cliente_telefone=d->>'cliente_telefone',cliente_endereco=concat_ws(', ',d->>'endereco',d->>'bairro',d->>'cidade',d->>'uf'),vendor=d->>'vendedor',valor_tabela=base,valor_desconto=desconto,valor_final=total,status=situacao,dados_json=d,forma_pagamento=d->>'forma_pagamento',parcelas=n where id::text=p_id returning * into c;
 end if;
 delete from le_admin.comercial_recebiveis where contrato_id=c.id::text and status='Pendente';
 if situacao='Emitido' then
  for par in select * from jsonb_array_elements(d->'parcelas') loop
   insert into le_admin.comercial_recebiveis(contrato_id,numero,valor,vencimento,marco) values(c.id::text,(par->>'numero')::integer,(par->>'valor')::numeric,nullif(par->>'vencimento','')::date,par->>'marco');
  end loop;
 else
  insert into le_admin.comercial_aprovacoes(contrato_id,resumo,versao_hash,solicitante) values(c.id::text,motivo,h,auth.uid()) on conflict do nothing;
 end if;
 insert into leblanc.contrato_historico(contrato_id,numero,acao,descricao,editado_por,alteracoes) values(c.id,c.numero,case when p_id is null then 'criacao' else 'edicao' end,'Regras 28/09/2026 · '||situacao,coalesce(auth.jwt()->>'email',auth.uid()::text),jsonb_build_object('snapshot',d,'anterior',antiga));
 return to_jsonb(c);
end $$;
create or replace function le_admin.comercial_aprovar(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a le_admin.comercial_aprovacoes; nome text; d jsonb; c leblanc.contratos;
begin
 select aprovadora into nome from le_admin.jornada_acessos where usuario_id=auth.uid() and ativo;
 if nome is null then raise exception 'Somente Priscila, Andressa ou Catelli podem autorizar'; end if;
 select * into a from le_admin.comercial_aprovacoes where id=p_id for update;
 if not found then raise exception 'Solicitação inexistente'; end if;
 select * into c from leblanc.contratos where id::text=a.contrato_id for update;
 d:=c.dados_json;
 if le_admin.comercial_hash(d)<>a.versao_hash then raise exception 'Proposta mudou. Autorize a solicitação atual'; end if;
 update le_admin.comercial_aprovacoes set aprovado_por=auth.uid(),aprovadora=nome,aprovado_em=now() where id=p_id;
 perform le_admin.comercial_salvar(a.contrato_id,d);
end $$;
revoke all on function le_admin.comercial_salvar(text,jsonb),le_admin.comercial_aprovar(uuid) from public,anon;
grant execute on function le_admin.comercial_salvar(text,jsonb),le_admin.comercial_aprovar(uuid) to authenticated;
-- Impede bypass das RPCs sobre contratos novos; históricos ficam preservados para revisão.
create or replace function le_admin.comercial_proteger() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and (TG_OP='INSERT' or new.dados_json->>'regras_versao'='2026-09-28' or old.dados_json->>'regras_versao'='2026-09-28') then raise exception 'Utilize o fluxo comercial com validação'; end if;
 return new;
end $$;
create trigger comercial_proteger before insert or update on leblanc.contratos for each row execute function le_admin.comercial_proteger();
notify pgrst,'reload schema';
commit;
