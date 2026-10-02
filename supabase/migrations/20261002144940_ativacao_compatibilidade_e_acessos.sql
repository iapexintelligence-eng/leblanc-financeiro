begin;
-- Compatibilidade explícita com o esquema real, preservando estados legados.
alter table leblanc.contratos drop constraint if exists contratos_status_check;
alter table leblanc.contratos add constraint contratos_status_check check(status in ('rascunho','ativo','quitado','cancelado') or (dados_json->>'regras_versao'='2026-09-28' and status in ('Emitido','Aguardando aprovação')));
alter table leblanc.contratos drop constraint if exists contratos_modelo_contrato_check;
alter table leblanc.contratos add constraint contratos_modelo_contrato_check check(modelo_contrato in ('leblanc','bartzen','Le Blanc','Bartzen'));
alter table leblanc.contratos drop constraint if exists contratos_forma_pagamento_check;
alter table leblanc.contratos add constraint contratos_forma_pagamento_check check(forma_pagamento in ('avista','cartao') or (dados_json->>'regras_versao'='2026-09-28' and nullif(trim(forma_pagamento),'') is not null));
-- Os novos estados não acionam o gerador legado, que só gera parcelas para 'ativo'.
create or replace function le_admin.comercial_ler(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from leblanc.contratos c where c.id=p_id and
 (le_admin.jornada_papel() in ('gestor','financeiro','correcao','logistica') or
 (le_admin.jornada_papel()='vendedor' and c.dados_json->>'criado_por'=auth.uid()::text)))
$$;
revoke all on function le_admin.comercial_ler(uuid) from public,anon;
grant execute on function le_admin.comercial_ler(uuid) to authenticated;
alter table leblanc.contratos enable row level security;
drop policy if exists leblanc_app_access on leblanc.contratos;
create policy comercial_contratos_ler on leblanc.contratos for select to authenticated using(le_admin.comercial_ler(id));
alter table leblanc.contrato_historico enable row level security;
drop policy if exists leblanc_app_access on leblanc.contrato_historico;
create policy comercial_historico_ler on leblanc.contrato_historico for select to authenticated using(le_admin.comercial_ler(contrato_id));
-- Inserções/alterações de contrato e auditoria ocorrem somente pelas RPCs já validadas.
revoke insert,update,delete on leblanc.contratos,leblanc.contrato_historico from authenticated,anon;
grant select on leblanc.contratos,leblanc.contrato_historico to authenticated;

alter table leblanc.contrato_anexos add column if not exists bucket text not null default 'pasta-cliente';
alter table leblanc.contrato_anexos enable row level security;
drop policy if exists leblanc_app_access on leblanc.contrato_anexos;
create policy comercial_anexos_ler on leblanc.contrato_anexos for select to authenticated using(le_admin.comercial_ler(contrato_id));
create policy comercial_anexos_criar on leblanc.contrato_anexos for insert to authenticated with check(
 le_admin.comercial_ler(contrato_id) and le_admin.jornada_papel() in ('gestor','financeiro','vendedor')
 and bucket='comercial-documentos' and split_part(path,'/',1)=auth.uid()::text
 and exists(select 1 from storage.objects o where o.bucket_id='comercial-documentos' and o.name=path));
revoke update,delete on leblanc.contrato_anexos from authenticated,anon;
grant select,insert on leblanc.contrato_anexos to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('comercial-documentos','comercial-documentos',false,52428800) on conflict(id) do nothing;
create policy comercial_documentos_upload on storage.objects for insert to authenticated with check(bucket_id='comercial-documentos' and le_admin.jornada_papel() in ('gestor','financeiro','vendedor') and split_part(name,'/',1)=auth.uid()::text);
create policy comercial_documentos_ler on storage.objects for select to authenticated using(bucket_id='comercial-documentos' and
 (split_part(name,'/',1)=auth.uid()::text or exists(select 1 from leblanc.contrato_anexos a where a.bucket='comercial-documentos' and a.path=name and le_admin.comercial_ler(a.contrato_id))));
-- Evita criar atendimento para contrato de outro vendedor por chamada direta.
create or replace function le_admin.jornada_validar_dono() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if le_admin.jornada_papel()='vendedor' and not le_admin.comercial_ler(new.contrato_id::uuid) then raise exception 'Contrato de outro vendedor';end if;
 return new;
end $$;
create trigger jornada_dono before insert on le_admin.jornada_registros for each row execute function le_admin.jornada_validar_dono();
revoke all on function le_admin.jornada_validar_dono() from public,anon,authenticated;
-- Seleção por identidade já existente e papel conferido. Não atribui aprovadoras por nome presumido.
insert into le_admin.jornada_acessos(usuario_id,nome,papel,aprovadora,ativo)
select a.id,u.nome,case when lower(u.email)='administrativo@leblancinteriores.com' then 'financeiro' when lower(u.email)='gerencia@leblancinteriores.com' then 'gestor' else 'vendedor' end,null,true
from auth.users a join le_admin.usuarios_sistema u on lower(a.email)=lower(u.email)
where u.ativo and ((lower(u.email)='administrativo@leblancinteriores.com' and u.papel='administrativo') or (lower(u.email)='gerencia@leblancinteriores.com' and u.papel='diretoria') or (u.papel='vendedor' and lower(u.email) in ('vendas03@leblancinteriores.com','vendas02@leblancinteriores.com','vendas11@leblancinteriores.com','vendas12@leblancinteriores.com','vendas15@leblancinteriores.com')))
on conflict(usuario_id) do nothing;
-- Auxiliares não expõem metadados a visitantes sem login.
revoke execute on function le_admin.jornada_papel(),le_admin.jornada_leitura(le_admin.jornada_registros),le_admin.jornada_uteis(date,integer),le_admin.jornada_dias(date),le_admin.jornada_comprovante(text),le_admin.comercial_hash(jsonb) from public,anon;
grant execute on function le_admin.jornada_papel(),le_admin.jornada_leitura(le_admin.jornada_registros) to authenticated;
notify pgrst,'reload schema';
commit;
