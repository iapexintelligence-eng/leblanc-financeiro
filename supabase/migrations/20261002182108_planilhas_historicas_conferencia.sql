create table le_admin.planilhas_historicas (
 id uuid primary key default gen_random_uuid(),
 origem_id text not null,
 nome text not null,
 origem_url text not null,
 sha256 text not null,
 conteudo jsonb not null,
 importado_em timestamptz not null default now(),
 importado_por text not null default 'Importação assistida via Codex',
 unique(origem_id,sha256)
);
alter table le_admin.planilhas_historicas enable row level security;
revoke all on le_admin.planilhas_historicas from public,anon,authenticated;
grant select on le_admin.planilhas_historicas to authenticated;
create policy planilhas_historicas_financeiro on le_admin.planilhas_historicas for select to authenticated using ((select le_admin.jornada_papel()) in ('financeiro','gestor'));
comment on table le_admin.planilhas_historicas is 'Cópias históricas para conferência. Não geram lançamentos financeiros nem confirmam pagamentos.';
