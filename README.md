# Le Blanc — Painel Financeiro (Le Admin)

App Vite + React + Supabase (schema `le_admin`). Reconstruído com código-fonte completo.

## Rodar localmente
```
npm install
cp .env.example .env   # preencha VITE_SUPABASE_ANON_KEY
npm run dev
```

## Build / Deploy (Netlify)
```
npm run build   # gera dist/
```
No Netlify: publish = `dist`. Configure as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Acesso
Login via Supabase Auth. As tabelas em `le_admin` têm RLS que libera apenas os e-mails autorizados (gerência/administrativo).

## Estrutura
- src/pages — Home, Vendas, Recebiveis, Bancos, Funcionarios, Login, EmBreve
- src/components — Layout, Sidebar, Modal, Icons
- src/lib — supabase, useAuth, format, log
