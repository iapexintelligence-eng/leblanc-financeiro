-- Assistência só é encerrada com a etapa onde aconteceu o erro definida (para cobrar o responsável).
do $do$
declare d text;
 a1 text:=$a$  if d->>'status'='Resolvida' and (coalesce(d->>'confirmacao','')='' or not le_admin.jornada_comprovante(d->>'evidencia_arquivo')) then raise exception 'Confirme a resolução e anexe a evidência'; end if;$a$;
 b1 text:=$b$  if d->>'status'='Resolvida' and (coalesce(d->>'confirmacao','')='' or not le_admin.jornada_comprovante(d->>'evidencia_arquivo')) then raise exception 'Confirme a resolução e anexe a evidência'; end if;
  if d->>'status'='Resolvida' and coalesce(nullif(d->>'origem_erro',''),'A apurar')='A apurar' and coalesce(d->>'causa','A apurar')='A apurar' then raise exception 'Defina onde aconteceu o erro antes de encerrar a assistência'; end if;$b$;
begin
 d:=replace(pg_get_functiondef('le_admin.jornada_salvar'::regproc),E'\r','');
 if position(a1 in d)=0 then raise exception 'trecho de jornada_salvar não encontrado'; end if;
 execute replace(d,a1,b1);
end $do$;
