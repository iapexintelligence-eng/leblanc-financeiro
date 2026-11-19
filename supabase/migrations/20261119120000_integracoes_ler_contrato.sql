-- Configuração de integrações lida só pelas funções do servidor (service role).
-- Usada pela função "ler-contrato" (leitura de contrato por foto/PDF com IA, via n8n).
-- O token (ler_contrato_token) foi gravado direto em produção e NÃO fica no repositório.
create table if not exists le_admin.integracoes (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);
alter table le_admin.integracoes enable row level security;
revoke all on le_admin.integracoes from anon, authenticated;
insert into le_admin.integracoes (chave, valor)
values ('ler_contrato_url', 'https://dinastia-n8n-webhook.sw8ro0.easypanel.host/webhook/leblanc-ler-contrato')
on conflict (chave) do nothing;
