-- Parcelamentos nos cartões de crédito da loja e o limite de cada cartão, para a Léia ver
-- quanto de limite vai sobrar daqui a alguns meses. Um parcelamento ocupa o limite pelo valor
-- das parcelas que ainda vão cair; cada fatura paga devolve uma parcela ao limite.
-- cartao_id = id da lista de cartões do sistema (src/lib/cartoes.js). Meses no formato AAAA-MM,
-- o mesmo das faturas (fatura_rateio.mes_ref).

create table if not exists le_admin.cartao_limites (
  cartao_id text primary key,
  limite numeric not null check (limite >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists le_admin.cartao_parcelamentos (
  id bigint generated always as identity primary key,
  cartao_id text not null,
  descricao text not null check (length(trim(descricao)) > 0),
  valor_parcela numeric not null check (valor_parcela > 0),
  parcelas_total integer not null check (parcelas_total between 1 and 120),
  primeira_parcela text not null check (primeira_parcela ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  observacao text,
  origem text not null default 'manual' check (origem in ('manual', 'fatura')),
  chave text,
  encerrado_em text check (encerrado_em is null or encerrado_em ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  criado_por text,
  created_at timestamptz not null default now()
);
-- A mesma compra parcelada aparece em toda fatura (02/06, 03/06…): a chave evita trazê-la duas vezes.
create unique index if not exists cartao_parcelamentos_chave on le_admin.cartao_parcelamentos (cartao_id, chave) where chave is not null;
create index if not exists cartao_parcelamentos_cartao on le_admin.cartao_parcelamentos (cartao_id);

alter table le_admin.cartao_limites enable row level security;
alter table le_admin.cartao_parcelamentos enable row level security;

-- Mesmo acesso das faturas de cartão: administrativo e gerência.
drop policy if exists admin_leblanc on le_admin.cartao_limites;
create policy admin_leblanc on le_admin.cartao_limites for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = any (array['gerencia@leblancinteriores.com', 'administrativo@leblancinteriores.com', 'leblancintesing@gmail.com']))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = any (array['gerencia@leblancinteriores.com', 'administrativo@leblancinteriores.com', 'leblancintesing@gmail.com']));
drop policy if exists admin_leblanc on le_admin.cartao_parcelamentos;
create policy admin_leblanc on le_admin.cartao_parcelamentos for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = any (array['gerencia@leblancinteriores.com', 'administrativo@leblancinteriores.com', 'leblancintesing@gmail.com']))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = any (array['gerencia@leblancinteriores.com', 'administrativo@leblancinteriores.com', 'leblancintesing@gmail.com']));

revoke all on le_admin.cartao_limites, le_admin.cartao_parcelamentos from anon;
grant select, insert, update, delete on le_admin.cartao_limites, le_admin.cartao_parcelamentos to authenticated;
