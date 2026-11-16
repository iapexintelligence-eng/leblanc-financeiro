-- Contas fixas e folha lançadas sozinhas todo dia 1º, como pagamentos pendentes.
-- Antes dependia de alguém clicar em "Lançar contas fixas do mês" e a folha nunca saía do
-- cadastro de funcionários. Agora:
--   * contas fixas: a última ocorrência de cada conta marcada como recorrente (exceto salários);
--   * CLT: salário + VT + VA no 5º dia útil (menos o adiantamento, que sai no dia 20);
--   * MEI/PJ: só a ajuda de custo fixa no 5º dia útil (comissão continua lançada à mão);
--   * sócias ficam de fora (pró-labore é controlado pelas retiradas).
-- Cada lançamento leva um registro_id próprio do mês, então rodar de novo não duplica, e o que a
-- Léia já tiver lançado à mão no mês (mesma conta ou mesmo funcionário) não é criado de novo.

alter table le_admin.funcionarios
  add column if not exists vinculo text not null default 'CLT',
  add column if not exists ajuda_custo numeric not null default 0,
  add column if not exists adiantamento numeric not null default 0;
do $$ begin
  alter table le_admin.funcionarios add constraint funcionarios_vinculo_check check (vinculo in ('CLT', 'MEI'));
exception when duplicate_object then null; end $$;

-- n-ésimo dia útil do mês (sem sábado, domingo e feriados da jornada).
create or replace function le_admin.dia_util_do_mes(p_mes date, p_n integer)
returns date
language sql
stable
set search_path to ''
as $$
  select d::date from generate_series(date_trunc('month', p_mes), date_trunc('month', p_mes) + interval '1 month - 1 day', interval '1 day') d
  where extract(isodow from d) < 6
    and not (d::date = any (coalesce((select c.feriados from le_admin.jornada_config c limit 1), '{}'::date[])))
  order by d offset greatest(p_n, 1) - 1 limit 1
$$;

create or replace function le_admin.gerar_fixos_mes(p_mes date default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  ini date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date))::date;
  fim date := (date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date)) + interval '1 month - 1 day')::date;
  ym text := to_char(ini, 'YYYY-MM');
  quinto date := le_admin.dia_util_do_mes(ini, 5);
  n_contas int := 0; n_folha int := 0; n int;
begin
  if auth.uid() is not null and coalesce(le_admin.jornada_papel(), '') not in ('financeiro', 'gestor') then
    raise exception 'Somente financeiro e gestão lançam as contas fixas';
  end if;

  -- Contas fixas: última ocorrência de cada conta recorrente (a mesma conta escrita em maiúscula/minúscula conta uma vez).
  with modelos as (
    select distinct on (lower(trim(p.descricao))) p.*
    from le_admin.pagamentos p
    where p.recorrente and p.categoria <> 'salarios' and coalesce(trim(p.descricao), '') <> ''
    order by lower(trim(p.descricao)), coalesce(p.data_vencimento, p.data) desc, p.id desc
  ), novos as (
    insert into le_admin.pagamentos (registro_id, descricao, categoria, fornecedor, valor, data, data_vencimento, dia_vencimento, status, recorrente, tipo, observacao)
    select 'FIXO-' || ym || '-' || left(md5(lower(trim(m.descricao))), 12), m.descricao, m.categoria, m.fornecedor, m.valor, ini,
      least(ini + (greatest(coalesce(m.dia_vencimento, 1), 1) - 1), fim), m.dia_vencimento, 'Pendente', true, 'Fixa',
      'Lançado automaticamente (conta fixa do mês). Confira o valor antes de pagar.'
    from modelos m
    where m.status <> 'Cancelado'
      and not exists (select 1 from le_admin.pagamentos x where lower(trim(x.descricao)) = lower(trim(m.descricao))
                      and coalesce(x.data_vencimento, x.data) between ini and fim and x.status <> 'Cancelado')
    on conflict (registro_id) do nothing
    returning 1
  ) select count(*) into n_contas from novos;

  -- Folha CLT: salário + VT + VA (menos adiantamento) no 5º dia útil; adiantamento no dia 20.
  with f as (
    select fu.*, split_part(trim(fu.nome_completo), ' ', 1) nome
    from le_admin.funcionarios fu
    where fu.ativo and coalesce(fu.tipo, '') <> 'socia' and fu.vinculo = 'CLT' and coalesce(fu.salario_fixo, 0) > 0
  ), novos as (
    insert into le_admin.pagamentos (registro_id, descricao, categoria, fornecedor, valor, valor_fixo, valor_vt, valor_va, funcionario_id, data, data_vencimento, status, recorrente, tipo, observacao)
    select 'FOLHA-' || ym || '-' || f.id, 'Salário ' || f.nome, 'salarios', f.nome_completo,
      f.salario_fixo + coalesce(f.vt_total, 0) + coalesce(f.va_total, 0) - coalesce(f.adiantamento, 0),
      f.salario_fixo, coalesce(f.vt_total, 0), coalesce(f.va_total, 0), f.id, ini, quinto, 'Pendente', false, 'Fixa',
      'Folha do mês: salário + VT + VA' || case when coalesce(f.adiantamento, 0) > 0 then ' − adiantamento' else '' end || '. Confira hora extra e descontos.'
    from f
    where not exists (select 1 from le_admin.pagamentos x where x.categoria = 'salarios' and x.status <> 'Cancelado'
                      and coalesce(x.data_vencimento, x.data) between ini and fim
                      and (x.funcionario_id = f.id or x.descricao ~* ('^sal[aá]rio\s+' || f.nome || '\M')))
    on conflict (registro_id) do nothing
    returning 1
  ) select count(*) into n from novos;
  n_folha := n;

  with f as (
    select fu.*, split_part(trim(fu.nome_completo), ' ', 1) nome
    from le_admin.funcionarios fu
    where fu.ativo and fu.vinculo = 'CLT' and coalesce(fu.adiantamento, 0) > 0
  ), novos as (
    insert into le_admin.pagamentos (registro_id, descricao, categoria, fornecedor, valor, funcionario_id, data, data_vencimento, status, recorrente, tipo, observacao)
    select 'ADIANT-' || ym || '-' || f.id, 'Adiantamento ' || f.nome, 'salarios', f.nome_completo, f.adiantamento, f.id, ini,
      least(ini + 19, fim), 'Pendente', false, 'Fixa', 'Adiantamento do mês (lançado automaticamente).'
    from f
    where not exists (select 1 from le_admin.pagamentos x where x.categoria = 'salarios' and x.status <> 'Cancelado'
                      and coalesce(x.data_vencimento, x.data) between ini and fim
                      and x.descricao ~* ('^adiantamento\s+' || f.nome || '\M'))
    on conflict (registro_id) do nothing
    returning 1
  ) select count(*) into n from novos;
  n_folha := n_folha + n;

  -- MEI/PJ: ajuda de custo fixa no 5º dia útil.
  with f as (
    select fu.*, split_part(trim(fu.nome_completo), ' ', 1) nome
    from le_admin.funcionarios fu
    where fu.ativo and fu.vinculo = 'MEI' and coalesce(fu.ajuda_custo, 0) > 0
  ), novos as (
    insert into le_admin.pagamentos (registro_id, descricao, categoria, fornecedor, valor, funcionario_id, data, data_vencimento, status, recorrente, tipo, observacao)
    select 'AJUDA-' || ym || '-' || f.id, 'Ajuda de custo ' || f.nome, 'salarios', f.nome_completo, f.ajuda_custo, f.id, ini, quinto,
      'Pendente', false, 'Fixa', 'MEI: ajuda de custo fixa do mês (lançada automaticamente). Comissão é lançada à parte.'
    from f
    where not exists (select 1 from le_admin.pagamentos x where x.categoria = 'salarios' and x.status <> 'Cancelado'
                      and coalesce(x.data_vencimento, x.data) between ini and fim
                      and (x.registro_id = 'AJUDA-' || ym || '-' || f.id or x.descricao ~* ('(ajuda|vt\s*e\s*v).*' || f.nome || '\M')))
    on conflict (registro_id) do nothing
    returning 1
  ) select count(*) into n from novos;
  n_folha := n_folha + n;

  return jsonb_build_object('mes', ym, 'contas', n_contas, 'folha', n_folha);
end $$;

revoke all on function le_admin.gerar_fixos_mes(date) from public, anon;
grant execute on function le_admin.gerar_fixos_mes(date) to authenticated;
grant execute on function le_admin.dia_util_do_mes(date, integer) to authenticated;

-- Os salários deixam de vir da lista de contas fixas (agora vêm do cadastro de funcionários).
update le_admin.pagamentos set recorrente = false where recorrente and categoria = 'salarios';

-- Todo dia 1º às 06h (Brasília).
select cron.unschedule(jobid) from cron.job where jobname = 'leblanc-fixos-mensais';
select cron.schedule('leblanc-fixos-mensais', '0 9 1 * *', $$select le_admin.gerar_fixos_mes()$$);
