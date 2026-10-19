-- O bloco importacao_revisoes continua somente leitura para a equipe.
-- Só a rotina de reimportação da planilha (que liga le_admin.importacao_rpc na própria transação) pode atualizá-lo.
create or replace function le_admin.jornada_preservar_importacao() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('le_admin.importacao_rpc', true), '') = '1' then
  return new;
 end if;
 if old.dados ? 'importacao_revisoes' and new.dados->'importacao_revisoes' is distinct from old.dados->'importacao_revisoes' then
  new.dados:=new.dados||jsonb_build_object('importacao_revisoes',old.dados->'importacao_revisoes');
 end if;
 return new;
end $$;
revoke all on function le_admin.jornada_preservar_importacao() from public,anon,authenticated;
