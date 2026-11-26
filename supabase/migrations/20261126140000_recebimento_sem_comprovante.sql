-- Contratos antigos: a Léia dá baixa em pagamentos já recebidos antes do sistema sem anexar
-- comprovante, desde que escreva uma observação (ex.: "pago em set/2026, conferido no extrato Sicredi").
-- O lançamento fica registrado sem comprovante (comprovante null) e aparece assim no histórico.
alter table le_admin.recebimentos alter column comprovante drop not null;

do $$
declare d text := pg_get_functiondef('le_admin.recebimento_lancar(integer[],date,numeric,text,integer,text,text)'::regprocedure);
  a1 text := $a$ if p_comprovante is null or not exists(select 1 from storage.objects o where o.bucket_id='jornada-documentos' and o.name=p_comprovante and split_part(o.name,'/',1)=auth.uid()::text) then
  raise exception 'Anexe o comprovante do pagamento do cliente';
 end if;
 if exists(select 1 from le_admin.recebimentos x where x.comprovante=p_comprovante and x.estornado_em is null) then raise exception 'Este comprovante já foi usado em outro lançamento'; end if;$a$;
  b1 text := $b$ if p_comprovante is null then
  -- Baixa sem comprovante (pagamento antigo): exige a observação explicando.
  if length(trim(coalesce(p_observacoes,'')))<10 then raise exception 'Sem comprovante: escreva na observação por que (ex.: pagamento antigo, conferido no extrato)'; end if;
 elsif not exists(select 1 from storage.objects o where o.bucket_id='jornada-documentos' and o.name=p_comprovante and split_part(o.name,'/',1)=auth.uid()::text) then
  raise exception 'Anexe o comprovante do pagamento do cliente';
 end if;
 if p_comprovante is not null and exists(select 1 from le_admin.recebimentos x where x.comprovante=p_comprovante and x.estornado_em is null) then raise exception 'Este comprovante já foi usado em outro lançamento'; end if;$b$;
begin
  if position(a1 in d) = 0 then raise exception 'trecho do comprovante não encontrado'; end if;
  execute replace(d, a1, b1);
end $$;
