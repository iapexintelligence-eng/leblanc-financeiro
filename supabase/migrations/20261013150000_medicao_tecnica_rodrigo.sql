-- Medição técnica (Rodrigo): após a pasta do cliente liberada pelo vendedor, ele tem 5 dias corridos
-- para agendar a medida; registra cliente a cliente a data agendada e a conclusão da medida.
alter table le_admin.jornada_acessos drop constraint jornada_acessos_papel_check;
alter table le_admin.jornada_acessos add constraint jornada_acessos_papel_check check (papel in ('vendedor','correcao','financeiro','logistica','gestor','montador','medidor'));
do $do$ begin
 if exists(select 1 from information_schema.columns where table_schema='le_admin' and table_name='usuarios_sistema' and column_name='papel_jornada') then
  alter table le_admin.usuarios_sistema drop constraint if exists usuarios_sistema_papel_jornada_check;
  alter table le_admin.usuarios_sistema add constraint usuarios_sistema_papel_jornada_check check (papel_jornada in ('vendedor','correcao','financeiro','logistica','gestor','montador','medidor'));
 end if;
end $do$;

-- Medidor acompanha as vendas desde o fechamento (para ter ideia da quantidade); só agenda após a pasta liberada.
create or replace function le_admin.jornada_leitura(r le_admin.jornada_registros) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(le_admin.jornada_papel() in ('gestor','financeiro','logistica','correcao')
 or (le_admin.jornada_papel()='vendedor' and (r.criado_por=auth.uid()
     or (r.tipo='pedido' and r.contrato_id ~ '^[0-9a-f-]{36}$' and le_admin.vendedor_do_contrato(r.contrato_id::uuid))))
 or (le_admin.jornada_papel()='medidor' and r.tipo='pedido')
 or (le_admin.jornada_papel()='montador' and r.tipo='agenda' and r.dados->>'montador_id'=auth.uid()::text and r.dados->>'confirmada'='true'),false)
$$;

create or replace function le_admin.comercial_ler(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from leblanc.contratos c where c.id=p_id and
 (le_admin.jornada_papel() in ('gestor','financeiro','correcao','logistica','medidor') or le_admin.vendedor_do_contrato(c.id)))
$$;

-- Na ficha, o medidor só altera agendamento, conclusão, arquivo e observação da medida.
do $do$
declare d text;
 a1 text:=$a$ if papel='montador' then raise exception 'Montador possui acesso somente à escala liberada'; end if;$a$;
 b1 text:=$b$ if papel='montador' then raise exception 'Montador possui acesso somente à escala liberada'; end if;
 if papel='medidor' and (p_tipo<>'pedido' or p_id is null) then raise exception 'Medição técnica registra apenas agendamento e conclusão da medida'; end if;$b$;
 a2 text:=$a$   if k in ('medicao_em','correcao_em','aprovacao_em','implantacao_em','pedido_fabrica') and papel not in ('correcao','gestor') then raise exception 'Marco reservado ao conferente'; end if;$a$;
 b2 text:=$b$   if papel='medidor' and k not in ('medicao_agendada','medicao_em','medicao_arquivo','medicao_obs') then raise exception 'Medição técnica registra apenas agendamento e conclusão da medida'; end if;
   if k='medicao_em' and papel not in ('correcao','gestor','medidor') then raise exception 'Marco reservado à medição técnica'; end if;
   if k='medicao_agendada' and coalesce(d->>'medicao_agendada','')<>'' and coalesce(d->>'liberacao_em','')='' then raise exception 'A medida só pode ser agendada depois que o vendedor liberar a pasta do cliente'; end if;
   if k in ('correcao_em','aprovacao_em','implantacao_em','pedido_fabrica') and papel not in ('correcao','gestor') then raise exception 'Marco reservado ao conferente'; end if;$b$;
begin
 d:=replace(pg_get_functiondef('le_admin.jornada_salvar'::regproc),E'\r','');
 if position(a1 in d)=0 or position(a2 in d)=0 then raise exception 'trecho de jornada_salvar não encontrado'; end if;
 execute replace(replace(d,a1,b1),a2,b2);
end $do$;
