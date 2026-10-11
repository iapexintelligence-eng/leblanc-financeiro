-- Fichas importadas da planilha "CONTROLE DE REVISÕES 2026" guardam a situação de origem em dados.importacao_revisoes.
-- O bloco é somente leitura: edições pela jornada não o alteram nem removem.
begin;
create or replace function le_admin.jornada_preservar_importacao() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.dados ? 'importacao_revisoes' and new.dados->'importacao_revisoes' is distinct from old.dados->'importacao_revisoes' then
  new.dados:=new.dados||jsonb_build_object('importacao_revisoes',old.dados->'importacao_revisoes');
 end if;
 return new;
end $$;
create trigger jornada_preservar_importacao before update on le_admin.jornada_registros for each row execute function le_admin.jornada_preservar_importacao();
revoke all on function le_admin.jornada_preservar_importacao() from public,anon,authenticated;
commit;
