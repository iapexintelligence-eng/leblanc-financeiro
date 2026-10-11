-- Recebimentos de clientes lançados com comprovante.
-- Um lançamento pode quitar várias parcelas (cartão de crédito: a loja recebe o valor integral de uma vez)
-- ou parte de uma parcela (recebimento parcial). Estorno é auditado e devolve o saldo do banco.

alter table le_admin.a_receber add column if not exists valor_recebido numeric(14,2) not null default 0;

create table if not exists le_admin.recebimentos (
 id bigint generated always as identity primary key,
 cliente_nome text not null,
 data date not null,
 valor numeric(14,2) not null check (valor>0),
 forma text not null,
 conta_bancaria_id integer references le_admin.contas_bancarias(id),
 comprovante text not null,
 observacoes text,
 saldo_banco_aplicado boolean not null default false,
 criado_por uuid not null,
 criado_em timestamptz not null default now(),
 estornado_em timestamptz,
 estornado_por uuid,
 estorno_motivo text
);
create table if not exists le_admin.recebimento_parcelas (
 recebimento_id bigint not null references le_admin.recebimentos(id),
 a_receber_id integer not null references le_admin.a_receber(id),
 valor numeric(14,2) not null check (valor>0),
 primary key (recebimento_id,a_receber_id)
);
create index if not exists recebimento_parcelas_parcela on le_admin.recebimento_parcelas(a_receber_id);

create or replace function le_admin.recebimento_acesso() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (coalesce(le_admin.jornada_papel() in ('financeiro','gestor'),false)
  or coalesce(auth.jwt()->>'email','') in ('gerencia@leblancinteriores.com','administrativo@leblancinteriores.com','leblancintesing@gmail.com'))
$$;

alter table le_admin.recebimentos enable row level security;
alter table le_admin.recebimento_parcelas enable row level security;
drop policy if exists recebimentos_ler on le_admin.recebimentos;
create policy recebimentos_ler on le_admin.recebimentos for select to authenticated using (le_admin.recebimento_acesso());
drop policy if exists recebimento_parcelas_ler on le_admin.recebimento_parcelas;
create policy recebimento_parcelas_ler on le_admin.recebimento_parcelas for select to authenticated using (le_admin.recebimento_acesso());
revoke all on le_admin.recebimentos,le_admin.recebimento_parcelas from anon,authenticated;
grant select on le_admin.recebimentos,le_admin.recebimento_parcelas to authenticated;

-- Situação da parcela calculada pelos lançamentos ativos.
create or replace function le_admin.recebimento_recalcular(p_parcela integer) returns void
language plpgsql security definer set search_path='' as $$
declare s numeric; ult date; v numeric;
begin
 select coalesce(sum(rp.valor),0),max(r.data) into s,ult from le_admin.recebimento_parcelas rp join le_admin.recebimentos r on r.id=rp.recebimento_id
  where rp.a_receber_id=p_parcela and r.estornado_em is null;
 select valor_parcela into v from le_admin.a_receber where id=p_parcela;
 update le_admin.a_receber set valor_recebido=s,
  status=case when s>=coalesce(v,0)-0.005 and s>0 then 'Recebido' when s>0 then 'Parcial' else 'Pendente' end,
  data_recebimento=case when s>=coalesce(v,0)-0.005 and s>0 then ult else null end
 where id=p_parcela;
end $$;

create or replace function le_admin.recebimento_lancar(p_parcelas integer[],p_data date,p_valor numeric,p_forma text,p_conta integer,p_comprovante text,p_observacoes text default null)
returns le_admin.recebimentos language plpgsql security definer set search_path='' as $$
declare r le_admin.recebimentos; resto numeric:=round(p_valor,2); aberto numeric; total numeric:=0; pid integer; p le_admin.a_receber; base date; cli text;
 hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not le_admin.recebimento_acesso() then raise exception 'Somente o financeiro e a gestão lançam recebimentos'; end if;
 if p_parcelas is null or cardinality(p_parcelas)=0 then raise exception 'Selecione ao menos uma parcela'; end if;
 if p_data is null or p_data>hoje then raise exception 'Informe a data real do recebimento (não pode ser futura)'; end if;
 if coalesce(p_valor,0)<=0 then raise exception 'Informe o valor recebido'; end if;
 if nullif(trim(coalesce(p_forma,'')),'') is null then raise exception 'Informe a forma de recebimento'; end if;
 if p_conta is not null and not exists(select 1 from le_admin.contas_bancarias where id=p_conta) then raise exception 'Conta bancária não encontrada'; end if;
 if p_comprovante is null or not exists(select 1 from storage.objects o where o.bucket_id='jornada-documentos' and o.name=p_comprovante and split_part(o.name,'/',1)=auth.uid()::text) then
  raise exception 'Anexe o comprovante do pagamento do cliente';
 end if;
 if exists(select 1 from le_admin.recebimentos x where x.comprovante=p_comprovante and x.estornado_em is null) then raise exception 'Este comprovante já foi usado em outro lançamento'; end if;
 if (select count(distinct x) from unnest(p_parcelas) x)<>cardinality(p_parcelas) then raise exception 'Parcela repetida na seleção'; end if;
 -- Trava as parcelas e confere o saldo em aberto.
 foreach pid in array p_parcelas loop
  select * into p from le_admin.a_receber where id=pid for update;
  if not found then raise exception 'Parcela % não encontrada',pid; end if;
  if p.status='Recebido' then raise exception 'Parcela de % já está recebida: %',p.cliente_nome,coalesce(p.descricao,pid::text); end if;
  total:=total+greatest(coalesce(p.valor_parcela,0)-coalesce(p.valor_recebido,0),0);
  cli:=coalesce(cli,p.cliente_nome);
 end loop;
 if resto>total+0.005 then raise exception 'Valor recebido (%) maior que o saldo das parcelas selecionadas (%)',to_char(resto,'FM999G999G990D00'),to_char(total,'FM999G999G990D00'); end if;
 perform set_config('le_admin.recebimento_rpc','1',true);
 insert into le_admin.recebimentos(cliente_nome,data,valor,forma,conta_bancaria_id,comprovante,observacoes,criado_por)
  values(cli,p_data,round(p_valor,2),trim(p_forma),p_conta,p_comprovante,nullif(trim(coalesce(p_observacoes,'')),''),auth.uid()) returning * into r;
 -- Distribui na ordem informada (a tela envia por vencimento).
 foreach pid in array p_parcelas loop
  exit when resto<=0;
  select greatest(coalesce(valor_parcela,0)-coalesce(valor_recebido,0),0) into aberto from le_admin.a_receber where id=pid;
  if aberto>0 then
   insert into le_admin.recebimento_parcelas values(r.id,pid,least(aberto,resto));
   resto:=resto-least(aberto,resto);
   update le_admin.a_receber set forma_recebimento=coalesce(forma_recebimento,trim(p_forma)) where id=pid;
   perform le_admin.recebimento_recalcular(pid);
  end if;
 end loop;
 -- Saldo do banco: só movimentos posteriores à data-base do saldo informado.
 if p_conta is not null then
  select data_saldo_base into base from le_admin.contas_bancarias where id=p_conta;
  if p_data>coalesce(base,'1900-01-01'::date) then
   update le_admin.contas_bancarias set saldo=coalesce(saldo,0)+round(p_valor,2),updated_at=now() where id=p_conta;
   update le_admin.recebimentos set saldo_banco_aplicado=true where id=r.id returning * into r;
  end if;
 end if;
 perform set_config('le_admin.recebimento_rpc','',true);
 return r;
end $$;

create or replace function le_admin.recebimento_estornar(p_id bigint,p_motivo text) returns le_admin.recebimentos
language plpgsql security definer set search_path='' as $$
declare r le_admin.recebimentos; pid integer;
begin
 if not le_admin.recebimento_acesso() then raise exception 'Somente o financeiro e a gestão estornam recebimentos'; end if;
 if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o motivo do estorno'; end if;
 select * into r from le_admin.recebimentos where id=p_id for update;
 if not found then raise exception 'Lançamento não encontrado'; end if;
 if r.estornado_em is not null then raise exception 'Lançamento já estornado'; end if;
 perform set_config('le_admin.recebimento_rpc','1',true);
 update le_admin.recebimentos set estornado_em=now(),estornado_por=auth.uid(),estorno_motivo=trim(p_motivo) where id=p_id returning * into r;
 for pid in select a_receber_id from le_admin.recebimento_parcelas where recebimento_id=p_id loop
  perform le_admin.recebimento_recalcular(pid);
 end loop;
 if r.saldo_banco_aplicado and r.conta_bancaria_id is not null then
  update le_admin.contas_bancarias set saldo=coalesce(saldo,0)-r.valor,updated_at=now() where id=r.conta_bancaria_id;
 end if;
 perform set_config('le_admin.recebimento_rpc','',true);
 return r;
end $$;

-- Parcela com lançamento ativo só muda pela rotina de recebimento ou estorno.
create or replace function le_admin.recebimento_proteger_parcela() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('le_admin.recebimento_rpc',true),'')='1' then return new; end if;
 if new.valor_recebido is distinct from old.valor_recebido then raise exception 'Valor recebido só muda por lançamento com comprovante'; end if;
 if exists(select 1 from le_admin.recebimento_parcelas rp join le_admin.recebimentos r on r.id=rp.recebimento_id where rp.a_receber_id=old.id and r.estornado_em is null)
  and (new.status is distinct from old.status or new.data_recebimento is distinct from old.data_recebimento or coalesce(new.valor_parcela,0)<old.valor_recebido) then
  raise exception 'Parcela com recebimento lançado: estorne o lançamento antes de alterar';
 end if;
 return new;
end $$;
drop trigger if exists recebimento_proteger_parcela on le_admin.a_receber;
create trigger recebimento_proteger_parcela before update on le_admin.a_receber for each row execute function le_admin.recebimento_proteger_parcela();
create or replace function le_admin.recebimento_proteger_exclusao() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from le_admin.recebimento_parcelas where a_receber_id=old.id) then raise exception 'Parcela com recebimento lançado não pode ser excluída'; end if;
 return old;
end $$;
drop trigger if exists recebimento_proteger_exclusao on le_admin.a_receber;
create trigger recebimento_proteger_exclusao before delete on le_admin.a_receber for each row execute function le_admin.recebimento_proteger_exclusao();

-- O saldo do banco dos lançamentos novos é feito pela rotina; o gatilho antigo segue para baixas antigas.
create or replace function le_admin.fn_saldo_recebimento() returns trigger language plpgsql as $$
DECLARE v_base date;
BEGIN
  IF coalesce(current_setting('le_admin.recebimento_rpc',true),'')='1' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'Recebido' AND OLD.conta_bancaria_id IS NOT NULL THEN
    SELECT data_saldo_base INTO v_base FROM le_admin.contas_bancarias WHERE id = OLD.conta_bancaria_id;
    IF COALESCE(OLD.data_recebimento, CURRENT_DATE) > COALESCE(v_base, '1900-01-01'::date) THEN
      UPDATE le_admin.contas_bancarias
         SET saldo = saldo - COALESCE(OLD.valor_parcela,0), updated_at = now()
       WHERE id = OLD.conta_bancaria_id;
    END IF;
  END IF;

  IF NEW.status = 'Recebido' AND NEW.conta_bancaria_id IS NOT NULL THEN
    SELECT data_saldo_base INTO v_base FROM le_admin.contas_bancarias WHERE id = NEW.conta_bancaria_id;
    IF COALESCE(NEW.data_recebimento, CURRENT_DATE) > COALESCE(v_base, '1900-01-01'::date) THEN
      UPDATE le_admin.contas_bancarias
         SET saldo = saldo + COALESCE(NEW.valor_parcela,0), updated_at = now()
       WHERE id = NEW.conta_bancaria_id;
    END IF;
  END IF;

  RETURN NULL;
END $$;

revoke all on function le_admin.recebimento_acesso(),le_admin.recebimento_recalcular(integer),le_admin.recebimento_lancar(integer[],date,numeric,text,integer,text,text),le_admin.recebimento_estornar(bigint,text),le_admin.recebimento_proteger_parcela(),le_admin.recebimento_proteger_exclusao() from public,anon,authenticated;
grant execute on function le_admin.recebimento_acesso(),le_admin.recebimento_lancar(integer[],date,numeric,text,integer,text,text),le_admin.recebimento_estornar(bigint,text) to authenticated;
