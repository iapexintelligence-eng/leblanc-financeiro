-- Toda venda tem o seu projeto (PROJ-V<id da venda>): é por ele que pagamentos, custos e faturas
-- se vinculam ao contrato. Desde 24/08 as vendas novas entravam sem projeto e não apareciam
-- na hora de vincular um gasto ao contrato.

create or replace function le_admin.venda_cria_projeto()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce(new.projeto_uid, '') = '' then
    new.projeto_uid := 'PROJ-V' || new.id;
  end if;
  insert into le_admin.projetos (projeto_uid, cliente_nome, valor_vendido, valor_promob, desconto_percentual, vendedor, funcionario_id, cliente_id, status_projeto)
  select new.projeto_uid, new.cliente_nome, new.valor_vendido, new.valor_promob, new.desconto_percentual, new.vendedor, new.funcionario_id, new.cliente_id, 'Em andamento'
  where not exists (select 1 from le_admin.projetos p where p.projeto_uid = new.projeto_uid);
  return new;
end $$;

create or replace trigger a_venda_cria_projeto before insert on le_admin.vendas
  for each row execute function le_admin.venda_cria_projeto();

-- Vendas já lançadas sem projeto. Lançamento repetido (mesmo cliente, data e valor de uma venda
-- anterior) não ganha projeto próprio, para os custos não se dividirem entre dois projetos.
with sem as (
  select v.* from le_admin.vendas v
  where coalesce(v.projeto_uid, '') = ''
    and not exists (select 1 from le_admin.vendas o where o.id < v.id and o.cliente_nome = v.cliente_nome
                    and o.data_venda is not distinct from v.data_venda and o.valor_vendido is not distinct from v.valor_vendido)
), novos as (
  insert into le_admin.projetos (projeto_uid, cliente_nome, valor_vendido, valor_promob, desconto_percentual, vendedor, funcionario_id, cliente_id, status_projeto)
  select 'PROJ-V' || s.id, s.cliente_nome, s.valor_vendido, s.valor_promob, s.desconto_percentual, s.vendedor, s.funcionario_id, s.cliente_id, 'Em andamento'
  from sem s
  where not exists (select 1 from le_admin.projetos p where p.projeto_uid = 'PROJ-V' || s.id)
  returning projeto_uid
)
update le_admin.vendas v set projeto_uid = 'PROJ-V' || v.id
from sem s where s.id = v.id;
