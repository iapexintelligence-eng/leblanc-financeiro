-- Gerente de vendas (Fabrício): emite contratos como vendedor e acompanha os contratos e fichas de toda a equipe.
-- Apelido '*' em vendedor_apelidos = enxerga todas as vendas (sem acesso ao financeiro).
create or replace function le_admin.vendedor_do_contrato(p_contrato uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and le_admin.jornada_papel()='vendedor' and exists(
  select 1 from leblanc.contratos c where c.id=p_contrato and (
   c.dados_json->>'criado_por'=auth.uid()::text
   or exists(select 1 from le_admin.vendedor_apelidos v where v.usuario_id=auth.uid() and v.apelido='*')
   or le_admin.nome_chave(c.vendor) in (
    select le_admin.nome_chave(v.apelido) from le_admin.vendedor_apelidos v where v.usuario_id=auth.uid()
    union select le_admin.nome_chave(a.nome) from le_admin.jornada_acessos a where a.usuario_id=auth.uid() and a.ativo)))
$$;

do $do$ begin
 if exists(select 1 from information_schema.columns where table_schema='le_admin' and table_name='usuarios_sistema' and column_name='papel_jornada') then
  insert into le_admin.usuarios_sistema(nome,email,setor,papel,papel_jornada,ativo)
  select 'Fabricio C Azambuja dos Santos','gerente@leblancinteriores.com','Vendas','vendedor','vendedor',true
  where not exists(select 1 from le_admin.usuarios_sistema where lower(email)='gerente@leblancinteriores.com');
  perform le_admin.acesso_vincular(id,email) from auth.users where lower(email)='gerente@leblancinteriores.com';
 end if;
 insert into le_admin.vendedor_apelidos(usuario_id,apelido)
 select u.id,x.a from auth.users u cross join (values ('Fabrício'),('*')) x(a) where lower(u.email)='gerente@leblancinteriores.com'
 on conflict do nothing;
end $do$;
