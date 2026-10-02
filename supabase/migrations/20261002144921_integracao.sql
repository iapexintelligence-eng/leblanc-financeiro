begin;
-- Feriados de Curitiba para toda a operação, conforme confirmação da loja.
-- Fonte 2026: https://www.curitiba.pr.gov.br/noticias/prefeitura-de-curitiba-define-calendario-de-feriados-recessos-e-pontos-facultativos-para-2026/80481
-- Feriados municipais recorrentes: Lei municipal 3.015/1967.
-- 2027: mesmas datas fixas e recorrências religiosas (Páscoa 28/03); revisar anualmente.
-- Recessos administrativos e pontos facultativos da Prefeitura não foram tratados como feriados da loja.
update le_admin.jornada_config set calendario_de='2026-01-01',calendario_ate='2027-12-31',feriados=array[
 '2026-01-01','2026-04-03','2026-04-21','2026-05-01','2026-06-04','2026-09-07','2026-09-08','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25',
 '2027-01-01','2027-03-26','2027-04-21','2027-05-01','2027-05-27','2027-09-07','2027-09-08','2027-10-12','2027-11-02','2027-11-15','2027-11-20','2027-12-25'
 ]::date[],atualizado_em=now() where id and calendario_ate is null;

create or replace function le_admin.jornada_recebiveis() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='pedido' then
  if coalesce(new.dados->>'entrega_prevista','')<>'' then
   update le_admin.comercial_recebiveis set vencimento=(new.dados->>'entrega_prevista')::date-2 where contrato_id=new.contrato_id and marco='dois_dias_antes_entrega' and status='Pendente';
  end if;
  if new.dados->>'entrada_confirmada'='true' then
   update le_admin.comercial_recebiveis set status='Recebido' where contrato_id=new.contrato_id and marco='venda';
  end if;
  if new.dados->>'saldo_confirmado'='true' then
   update le_admin.comercial_recebiveis set status='Recebido' where contrato_id=new.contrato_id;
  end if;
 end if;
 return new;
end $$;
create trigger jornada_recebiveis after insert or update on le_admin.jornada_registros for each row execute function le_admin.jornada_recebiveis();

-- Extrato para Leia; evita duplicar lançamentos novos no legado.
create or replace view le_admin.comercial_extrato with (security_invoker=true) as
 select r.*, c.cliente_nome,c.numero as contrato_numero,c.forma_pagamento
 from le_admin.comercial_recebiveis r join leblanc.contratos c on c.id::text=r.contrato_id;
grant select on le_admin.comercial_extrato to authenticated;

create table le_admin.gratificacao_conferencias (
 contrato_id text primary key, deducoes jsonb not null, valor_venda numeric(14,2) not null,
 liquido numeric(14,2) not null, percentual numeric not null, gratificacao numeric(14,2) not null,
 conferido_por uuid not null references auth.users(id), conferido_em timestamptz not null default now(),
 status text not null default 'Conferida', comprovante text
);
alter table le_admin.gratificacao_conferencias enable row level security;
create policy gratificacao_conferencias_select on le_admin.gratificacao_conferencias for select to authenticated using(le_admin.jornada_papel() in ('gestor','financeiro'));
grant select on le_admin.gratificacao_conferencias to authenticated;
create or replace function le_admin.gratificacao_conferir(p_contrato text,p_deducoes jsonb) returns le_admin.gratificacao_conferencias language plpgsql security definer set search_path='' as $$
declare c leblanc.contratos; r le_admin.gratificacao_conferencias; venda numeric; ded numeric; pct numeric; liquido numeric;
begin
 if coalesce(le_admin.jornada_papel(),'') not in ('financeiro','gestor') then raise exception 'Somente financeiro e gestão podem conferir'; end if;
 select * into c from leblanc.contratos where id::text=p_contrato;
 if not found then raise exception 'Contrato não encontrado'; end if;
 venda:=c.valor_final;
 if venda<35000 then raise exception 'Venda abaixo de R$ 35 mil: exige ajuste específico ainda não definido'; end if;
 if jsonb_typeof(p_deducoes)<>'array' then raise exception 'Informe as deduções da venda, incluindo marketing apurado'; end if;
 if exists(select 1 from jsonb_array_elements(p_deducoes) x where coalesce(x->>'descricao','')='' or coalesce((x->>'valor')::numeric,-1)<0) then raise exception 'Deduções precisam de descrição e valor não negativo'; end if;
 if exists(select 1 from jsonb_array_elements(p_deducoes) x group by lower(trim(x->>'descricao')) having count(*)>1) then raise exception 'Dedução duplicada'; end if;
 if exists(select 1 from le_admin.gratificacao_conferencias where contrato_id=p_contrato and status='Paga') then raise exception 'Gratificação paga deve ser ajustada separadamente'; end if;
 select coalesce(sum((x->>'valor')::numeric),0) into ded from jsonb_array_elements(p_deducoes) x;
 if ded>venda then raise exception 'Deduções superiores à venda'; end if;
 pct:=case when venda<50000 then 3 when venda<80000 then 4 when venda<110000 then 5 else 6 end;liquido:=venda-ded;
 insert into le_admin.gratificacao_conferencias(contrato_id,deducoes,valor_venda,liquido,percentual,gratificacao,conferido_por)
 values(p_contrato,p_deducoes,venda,liquido,pct,round(liquido*pct/100,2),auth.uid())
 on conflict(contrato_id) do update set deducoes=excluded.deducoes,valor_venda=excluded.valor_venda,liquido=excluded.liquido,percentual=excluded.percentual,gratificacao=excluded.gratificacao,conferido_por=auth.uid(),conferido_em=now() returning * into r;
 return r;
end $$;
revoke all on function le_admin.gratificacao_conferir(text,jsonb) from public,anon;
grant execute on function le_admin.gratificacao_conferir(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
