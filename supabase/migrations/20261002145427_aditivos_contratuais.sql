begin;
create table le_admin.contrato_aditivos (
 id uuid primary key default gen_random_uuid(),contrato_id uuid not null references leblanc.contratos(id),
 numero integer not null check(numero>0),data_assinatura date not null,descricao text not null,
 altera_valor boolean not null default false,altera_prazo boolean not null default false,
 arquivo text not null,nome_arquivo text not null,criado_por uuid not null references auth.users(id),
 criado_em timestamptz not null default now(),unique(contrato_id,numero)
);
alter table le_admin.contrato_aditivos enable row level security;
create policy aditivos_ler on le_admin.contrato_aditivos for select to authenticated using(le_admin.comercial_ler(contrato_id));
revoke all on le_admin.contrato_aditivos from anon,authenticated;
grant select on le_admin.contrato_aditivos to authenticated;
create or replace function le_admin.aditivo_anexar(p_contrato uuid,p_data date,p_descricao text,p_valor boolean,p_prazo boolean,p_arquivo text,p_nome text) returns le_admin.contrato_aditivos language plpgsql security definer set search_path='' as $$
declare r le_admin.contrato_aditivos;n integer;
begin
 if auth.uid() is null or coalesce(le_admin.jornada_papel(),'') not in ('gestor','financeiro','vendedor') or not le_admin.comercial_ler(p_contrato) then raise exception 'Sem acesso para anexar aditivo neste contrato';end if;
 if p_data is null or p_data>(now() at time zone 'America/Sao_Paulo')::date or nullif(trim(p_descricao),'') is null or nullif(trim(p_nome),'') is null or p_valor is null or p_prazo is null then raise exception 'Informe data de assinatura válida, descrição e documento';end if;
 if not exists(select 1 from storage.objects where bucket_id='comercial-documentos' and name=p_arquivo and split_part(name,'/',1)=auth.uid()::text) then raise exception 'Anexe o documento assinado antes de registrar';end if;
 perform 1 from leblanc.contratos where id=p_contrato for update;
 if exists(select 1 from le_admin.contrato_aditivos where arquivo=p_arquivo) then raise exception 'Este arquivo já está registrado como aditivo';end if;
 select coalesce(max(numero),0)+1 into n from le_admin.contrato_aditivos where contrato_id=p_contrato;
 insert into le_admin.contrato_aditivos(contrato_id,numero,data_assinatura,descricao,altera_valor,altera_prazo,arquivo,nome_arquivo,criado_por)
 values(p_contrato,n,p_data,trim(p_descricao),p_valor,p_prazo,p_arquivo,p_nome,auth.uid()) returning * into r;
 insert into leblanc.contrato_historico(contrato_id,numero,acao,descricao,editado_por,alteracoes)
 select c.id,c.numero,'aditivo_anexado','Aditivo '||n||' anexado; documento original preservado',auth.uid()::text,to_jsonb(r) from leblanc.contratos c where c.id=p_contrato;
 return r;
end $$;
revoke all on function le_admin.aditivo_anexar(uuid,date,text,boolean,boolean,text,text) from public,anon;
grant execute on function le_admin.aditivo_anexar(uuid,date,text,boolean,boolean,text,text) to authenticated;
create policy aditivos_documentos_ler on storage.objects for select to authenticated using(bucket_id='comercial-documentos' and exists(select 1 from le_admin.contrato_aditivos a where a.arquivo=name and le_admin.comercial_ler(a.contrato_id)));
notify pgrst,'reload schema';
commit;
