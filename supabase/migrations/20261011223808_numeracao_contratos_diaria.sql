begin;
-- Numeração atribuída na mesma transação que cria o contrato.
-- Mantém números históricos, permissões, validações e aprovações existentes.
do $migration$
declare fonte text; trecho text;
begin
 fonte:=pg_get_functiondef('le_admin.comercial_salvar(text,jsonb)'::regprocedure);
 if position('numeracao_diaria_v1' in fonte)>0 then return; end if;
 if position('h:=le_admin.comercial_hash(d);' in fonte)=0 then raise exception 'Função comercial mudou; revisar migração antes de aplicar'; end if;
 trecho:=$codigo$
 -- numeracao_diaria_v1
 if p_id is null then
  declare prefixo text; proximo bigint;
  begin
   prefixo:=to_char(coalesce(nullif(d->>'data_contrato','')::date,(now() at time zone 'America/Sao_Paulo')::date),'YYYYMMDD');
   perform pg_advisory_xact_lock(hashtextextended('leblanc-contrato:'||prefixo,0));
   select coalesce(max(split_part(numero,'-',2)::bigint),0)+1 into proximo
    from leblanc.contratos where numero ~ ('^'||prefixo||'-[0-9]+$');
   d:=d||jsonb_build_object('numero',prefixo||'-'||lpad(proximo::text,greatest(2,length(proximo::text)),'0'),'numeracao_versao','data-sequencia-v1');
  end;
 else
  d:=d||jsonb_build_object('numero',c.numero);
 end if;
 h:=le_admin.comercial_hash(d);
 $codigo$;
 execute replace(fonte,'h:=le_admin.comercial_hash(d);',trecho);
end $migration$;
commit;
