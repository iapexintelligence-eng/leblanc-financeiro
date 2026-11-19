-- Contrato antigo subido sem o valor (foto que não mostra o total): leblanc.contratos.valor_final
-- é NOT NULL, então grava 0 ("sem valor") em vez de falhar. O dados_json continua com valor_final null
-- e a venda fica sem valor_vendido, para aparecer como "falta o valor" e ser completada depois.
do $$
declare d text := pg_get_functiondef('le_admin.contrato_assinado_registrar(jsonb,text,integer,uuid,boolean)'::regprocedure);
begin
  if position('''leblanc'', v_valor, ''avista''' in d) = 0 then raise exception 'trecho não encontrado'; end if;
  execute replace(d, '''leblanc'', v_valor, ''avista''', '''leblanc'', coalesce(v_valor, 0), ''avista''');
end $$;
