-- Papel na jornada previsto para cada pessoa; o vínculo é criado quando o login dela existir.
alter table le_admin.usuarios_sistema add column if not exists papel_jornada text check (papel_jornada in ('vendedor','correcao','financeiro','logistica','gestor','montador'));

update le_admin.usuarios_sistema set nome='Altair', setor='Qualidade', papel='qualidade', papel_jornada='logistica', ativo=true where email='assistencia@leblancinteriores.com';
update le_admin.usuarios_sistema set nome='Glauci', setor='Montagem', papel='montagem', papel_jornada='logistica', ativo=true where email='posvendas@leblancinteriores.com';
update le_admin.usuarios_sistema set nome='Giovanna', setor='Correção', papel='correcao', papel_jornada='correcao', ativo=true where email='correcaoposvendas@leblancinteriores.com';
update le_admin.usuarios_sistema set papel_jornada='financeiro', ativo=true where email='administrativo@leblancinteriores.com';

create or replace function le_admin.acesso_vincular(p_usuario uuid, p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare u le_admin.usuarios_sistema;
begin
 select * into u from le_admin.usuarios_sistema where lower(email)=lower(p_email) and ativo and papel_jornada is not null;
 if found then
  insert into le_admin.jornada_acessos(usuario_id,nome,papel,ativo) values(p_usuario,u.nome,u.papel_jornada,true)
  on conflict (usuario_id) do nothing;
 end if;
end $$;

create or replace function le_admin.acesso_vincular_novo_login() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform le_admin.acesso_vincular(new.id,new.email);
 return new;
exception when others then
 return new; -- nunca impede a criação do login
end $$;

create trigger le_admin_acesso_vincular after insert on auth.users for each row execute function le_admin.acesso_vincular_novo_login();

revoke execute on function le_admin.acesso_vincular(uuid,text),le_admin.acesso_vincular_novo_login() from public,anon,authenticated;

-- Logins que já existem.
select le_admin.acesso_vincular(id,email) from auth.users;
