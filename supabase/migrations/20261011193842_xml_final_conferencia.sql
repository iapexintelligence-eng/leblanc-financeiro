-- XML final corrigido, pré-análise e OK da Leia vinculado à versão (manual de 11/10/2026, seção 9).
-- Aplicar primeiro em homologação. Não altera registros existentes nem cria valores padrão de margem.
begin;

-- Margem mínima configurável. Nula = sem trava por margem (apenas aviso na pré-análise).
alter table le_admin.jornada_config add column if not exists margem_minima numeric(5,2)
 check(margem_minima is null or (margem_minima>=0 and margem_minima<100));

-- Cada arquivo é uma versão imutável. Substituir = nova versão; a anterior é preservada.
create table le_admin.xml_revisoes (
 id uuid primary key default gen_random_uuid(),
 contrato_id text not null,
 tipo text not null check(tipo in ('original','final')),
 versao integer not null check(versao>0),
 arquivo text not null, nome_arquivo text not null,
 conteudo_hash text not null check(conteudo_hash ~ '^[0-9a-f]{64}$'),
 fornecedor text,
 ambientes jsonb not null default '[]' check(jsonb_typeof(ambientes)='array'),
 total_tabela numeric(14,2) check(total_tabela is null or total_tabela>=0),
 leitura_erro text,
 observacoes text not null default '',
 criado_por uuid not null references auth.users(id),
 criado_em timestamptz not null default now(),
 unique(contrato_id,tipo,versao),
 -- Falha de leitura precisa aparecer; total ausente nunca vira zero.
 check(total_tabela is not null or coalesce(leitura_erro,'')<>'')
);
create index xml_revisoes_contrato on le_admin.xml_revisoes(contrato_id,tipo,versao desc);

-- Custos ficam separados para que só financeiro e gestão vejam a composição.
create table le_admin.xml_custos (
 revisao_id uuid primary key references le_admin.xml_revisoes(id),
 dados jsonb not null default '{}' check(jsonb_typeof(dados)='object'),
 versao integer not null default 0,
 atualizado_por uuid references auth.users(id),
 atualizado_em timestamptz
);
create table le_admin.xml_eventos (
 id bigint generated always as identity primary key,
 contrato_id text not null, revisao_id uuid references le_admin.xml_revisoes(id),
 acao text not null, autor uuid not null references auth.users(id),
 data timestamptz not null default now(), anterior jsonb, atual jsonb
);
create table le_admin.xml_conferencias (
 id uuid primary key default gen_random_uuid(),
 revisao_id uuid not null references le_admin.xml_revisoes(id),
 contrato_id text not null,
 valores_hash text not null,
 resultado text not null check(resultado in ('Dentro das regras','Precisa conferir')),
 analise jsonb not null,
 observacoes text not null default '',
 conferido_por uuid not null references auth.users(id),
 conferido_em timestamptz not null default now(),
 unique(revisao_id,valores_hash)
);
create table le_admin.xml_excecoes (
 id uuid primary key default gen_random_uuid(),
 revisao_id uuid not null references le_admin.xml_revisoes(id),
 contrato_id text not null,
 valores_hash text not null,
 motivo text not null check(length(trim(motivo))>0),
 aprovadora text not null,
 autorizado_por uuid not null references auth.users(id),
 autorizado_em timestamptz not null default now(),
 unique(revisao_id,valores_hash)
);

-- Leitura financeira: Leia, gestão e as três autorizadoras.
create or replace function le_admin.xml_fin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(le_admin.jornada_papel() in ('financeiro','gestor') or exists(select 1 from le_admin.jornada_acessos where usuario_id=auth.uid() and ativo and aprovadora is not null),false)
$$;

alter table le_admin.xml_revisoes enable row level security;
alter table le_admin.xml_custos enable row level security;
alter table le_admin.xml_eventos enable row level security;
alter table le_admin.xml_conferencias enable row level security;
alter table le_admin.xml_excecoes enable row level security;
create policy xml_revisoes_ler on le_admin.xml_revisoes for select to authenticated using((le_admin.xml_fin() or le_admin.jornada_papel()='correcao') and le_admin.comercial_ler(contrato_id::uuid));
create policy xml_custos_ler on le_admin.xml_custos for select to authenticated using(le_admin.xml_fin());
create policy xml_eventos_ler on le_admin.xml_eventos for select to authenticated using(le_admin.xml_fin());
create policy xml_conferencias_ler on le_admin.xml_conferencias for select to authenticated using(le_admin.xml_fin());
create policy xml_excecoes_ler on le_admin.xml_excecoes for select to authenticated using(le_admin.xml_fin());
revoke all on le_admin.xml_revisoes,le_admin.xml_custos,le_admin.xml_eventos,le_admin.xml_conferencias,le_admin.xml_excecoes from anon,authenticated;
grant select on le_admin.xml_revisoes,le_admin.xml_custos,le_admin.xml_eventos,le_admin.xml_conferencias,le_admin.xml_excecoes to authenticated;

-- Pré-análise calculada no servidor. Uso interno: sem verificação de leitura (feita em xml_analise).
create or replace function le_admin.xml_analise_interna(p_contrato text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c leblanc.contratos; orig le_admin.xml_revisoes; fin le_admin.xml_revisoes; cu jsonb:='{}'; cu_versao integer:=0;
 orig_total numeric; orig_amb jsonb:='[]'; orig_origem text; receita_contrato numeric; receita numeric; custo numeric:=0; margem numeric; minima numeric;
 motivos jsonb:='[]'; k text; v numeric; faltam text[]:='{}'; h text; ok le_admin.xml_conferencias; ex le_admin.xml_excecoes; ok_anterior boolean:=false;
 implantado boolean; aditivos integer; prejuizo boolean:=false; resultado text; comparacao jsonb:='[]';
begin
 select * into c from leblanc.contratos where id::text=p_contrato;
 if not found then raise exception 'Contrato não encontrado'; end if;
 select exists(select 1 from le_admin.jornada_registros r where r.contrato_id=p_contrato and r.tipo='pedido' and coalesce(r.dados->>'implantacao_em','')<>'') into implantado;
 select * into fin from le_admin.xml_revisoes where contrato_id=p_contrato and tipo='final' order by versao desc limit 1;
 select * into orig from le_admin.xml_revisoes where contrato_id=p_contrato and tipo='original' order by versao desc limit 1;
 select margem_minima into minima from le_admin.jornada_config where id;
 -- XML da venda: versão registrada ou o importado na emissão do contrato.
 if orig.id is not null then orig_total:=orig.total_tabela; orig_amb:=orig.ambientes; orig_origem:='XML da venda v'||orig.versao;
 elsif jsonb_typeof(c.dados_json->'promob_original')='object' then
  orig_total:=nullif(c.dados_json->'promob_original'->>'total','')::numeric; orig_amb:=coalesce(c.dados_json->'promob_original'->'ambientes','[]'); orig_origem:='XML importado na proposta';
  if orig_total=0 then orig_total:=null; end if;
 end if;
 receita_contrato:=coalesce(nullif(c.dados_json->>'valor_negociado','')::numeric,c.valor_final);
 select count(*) into aditivos from le_admin.contrato_aditivos a where a.contrato_id::text=p_contrato and a.altera_valor;
 if fin.id is null then
  motivos:=motivos||jsonb_build_object('nivel','bloqueio','fin',false,'texto','XML final corrigido ausente: o conferente deve anexá-lo antes da implantação.');
 else
  select coalesce(x.dados,'{}'),x.versao into cu,cu_versao from le_admin.xml_custos x where x.revisao_id=fin.id;
  cu:=coalesce(cu,'{}'); cu_versao:=coalesce(cu_versao,0);
  if fin.total_tabela is null then motivos:=motivos||jsonb_build_object('nivel','conferir','fin',false,'texto','Leitura do XML final falhou: '||fin.leitura_erro); end if;
  if orig_total is null then motivos:=motivos||jsonb_build_object('nivel','conferir','fin',false,'texto','XML da venda indisponível ou sem total lido: comparação manual necessária.');
  elsif fin.total_tabela is not null and abs(fin.total_tabela-orig_total)>=0.01 then
   motivos:=motivos||jsonb_build_object('nivel','conferir','fin',false,'texto',format('Total de tabela mudou de R$ %s para R$ %s (%s%%). Diferença indica alteração do projeto, não lucro.',
    to_char(orig_total,'FM999G999G990D00'),to_char(fin.total_tabela,'FM999G999G990D00'),to_char(case when orig_total>0 then (fin.total_tabela-orig_total)/orig_total*100 else 0 end,'FM990D0')));
  end if;
  -- Comparação por ambiente (nome normalizado).
  select coalesce(jsonb_agg(jsonb_build_object('ambiente',n,'venda',a,'final',b) order by n),'[]') into comparacao from (
   select coalesce(o.n,f.n) n,o.v a,f.v b from
   (select lower(trim(x->>'descricao')) n,sum(nullif(x->>'valor','')::numeric) v from jsonb_array_elements(orig_amb) x group by 1) o
   full join (select lower(trim(x->>'descricao')) n,sum(nullif(x->>'valor','')::numeric) v from jsonb_array_elements(fin.ambientes) x group by 1) f on o.n=f.n
  ) t where a is distinct from b;
  receita:=receita_contrato;
  if nullif(cu->>'receita','') is not null then
   receita:=(cu->>'receita')::numeric;
   motivos:=motivos||jsonb_build_object('nivel','aviso','fin',true,'texto','Receita informada na conferência: '||coalesce(cu->>'receita_motivo',''));
  end if;
  if coalesce(receita,0)<=0 then motivos:=motivos||jsonb_build_object('nivel','conferir','fin',true,'texto','Receita do contrato não identificada.'); end if;
  if aditivos>0 then motivos:=motivos||jsonb_build_object('nivel',case when nullif(cu->>'receita','') is null then 'conferir' else 'aviso' end,'fin',true,'texto',aditivos||' aditivo(s) com impacto de valor: confirme a receita considerada.'); end if;
  foreach k in array array['fabrica','kits','frete','montagem','taxas','outros'] loop
   v:=nullif(cu->>k,'')::numeric;
   if v is null and k<>'outros' then faltam:=faltam||k; end if;
   custo:=custo+coalesce(v,0);
  end loop;
  if array_length(faltam,1)>0 then motivos:=motivos||jsonb_build_object('nivel','conferir','fin',true,'texto','Custos não informados: '||array_to_string(faltam,', ')||'. Informe 0 quando não se aplicar.'); end if;
  if coalesce(receita,0)>0 then margem:=round((receita-custo)/receita*100,2); end if;
  h:=md5(jsonb_build_object('revisao',fin.id,'arquivo',fin.conteudo_hash,'total',fin.total_tabela,'custos',cu,'receita_contrato',receita_contrato,'aditivos',aditivos)::text);
  if nullif(cu->>'fabrica','') is not null and coalesce(receita,0)>0 and custo>receita then
   prejuizo:=true;
   select * into ex from le_admin.xml_excecoes where revisao_id=fin.id and valores_hash=h;
   if ex.id is null then motivos:=motivos||jsonb_build_object('nivel','bloqueio','fin',true,'texto','Prejuízo previsto: custos superam a receita. Exige autorização de Priscila, Andressa ou Catelli.');
   else motivos:=motivos||jsonb_build_object('nivel','aviso','fin',true,'texto','Prejuízo autorizado por '||ex.aprovadora||': '||ex.motivo); end if;
  end if;
  if minima is null then motivos:=motivos||jsonb_build_object('nivel','aviso','fin',true,'texto','Margem mínima não configurada: a pré-análise não trava por margem.');
  elsif margem is not null and margem<minima and not prejuizo then motivos:=motivos||jsonb_build_object('nivel','conferir','fin',true,'texto',format('Margem de %s%% abaixo do mínimo de %s%%.',to_char(margem,'FM990D00'),to_char(minima,'FM990D00'))); end if;
  if c.dados_json->>'regras_versao' is distinct from '2026-09-28' then motivos:=motivos||jsonb_build_object('nivel','aviso','fin',true,'texto','Contrato anterior às regras de 28/09: confira receita e composição no documento original.'); end if;
  select * into ok from le_admin.xml_conferencias where revisao_id=fin.id and valores_hash=h;
  select exists(select 1 from le_admin.xml_conferencias where contrato_id=p_contrato and id is distinct from ok.id) into ok_anterior;
  if ok.id is null and ok_anterior then motivos:=motivos||jsonb_build_object('nivel','aviso','fin',false,'texto','OK anterior invalidado: XML, receita ou custos mudaram depois da conferência.'); end if;
 end if;
 resultado:=case when exists(select 1 from jsonb_array_elements(motivos) m where m->>'nivel'='bloqueio') then 'Bloqueado'
  when exists(select 1 from jsonb_array_elements(motivos) m where m->>'nivel'='conferir') then 'Precisa conferir' else 'Dentro das regras' end;
 return jsonb_build_object('contrato_id',p_contrato,'resultado',resultado,'motivos',motivos,'implantado',implantado,
  'final',case when fin.id is null then null else jsonb_build_object('id',fin.id,'versao',fin.versao,'arquivo',fin.arquivo,'nome_arquivo',fin.nome_arquivo,'hash',fin.conteudo_hash,'fornecedor',fin.fornecedor,'total_tabela',fin.total_tabela,'leitura_erro',fin.leitura_erro,'ambientes',fin.ambientes,'criado_em',fin.criado_em,'criado_por',fin.criado_por,'observacoes',fin.observacoes) end,
  'original',jsonb_build_object('origem',orig_origem,'total_tabela',orig_total,'ambientes',orig_amb,'arquivo',coalesce(orig.arquivo,c.dados_json->>'promob_arquivo')),
  'comparacao',comparacao,'receita_contrato',receita_contrato,'receita',receita,'custos',cu,'custos_versao',cu_versao,'custo_total',case when fin.id is null then null else custo end,
  'margem',margem,'margem_minima',minima,'valores_hash',h,
  'ok_valido',ok.id is not null,'ok',case when ok.id is null then null else jsonb_build_object('por',ok.conferido_por,'em',ok.conferido_em,'observacoes',ok.observacoes,'resultado',ok.resultado) end);
end $$;

-- Consulta para a interface: financeiro vê tudo; conferente vê situação sem valores internos.
create or replace function le_admin.xml_analise(p_contrato text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;
begin
 if auth.uid() is null or not le_admin.comercial_ler(p_contrato::uuid) or not (le_admin.xml_fin() or le_admin.jornada_papel()='correcao') then raise exception 'Conferência não disponível para este acesso'; end if;
 a:=le_admin.xml_analise_interna(p_contrato);
 if le_admin.xml_fin() then return a; end if;
 return jsonb_build_object('contrato_id',a->'contrato_id','resultado',a->'resultado','implantado',a->'implantado','final',a->'final','original',a->'original','comparacao',a->'comparacao','ok_valido',a->'ok_valido',
  'ok',case when a->'ok' is null or jsonb_typeof(a->'ok')='null' then null else jsonb_build_object('em',a->'ok'->'em') end,
  'motivos',coalesce((select jsonb_agg(case when (m->>'fin')::boolean then jsonb_build_object('nivel',m->'nivel','fin',true,'texto','Pendência financeira em análise pela Leia.') else m end) from jsonb_array_elements(a->'motivos') m),'[]'));
end $$;

-- Painel da Leia: pedidos ainda não implantados com XML final ou projeto aprovado.
create or replace function le_admin.xml_painel() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not le_admin.xml_fin() then raise exception 'Painel restrito ao financeiro e à gestão'; end if;
 return coalesce((select jsonb_agg(le_admin.xml_analise_interna(r.contrato_id)||jsonb_build_object('registro_id',r.id,'cliente_nome',r.dados->>'cliente_nome','aprovacao_em',r.dados->>'aprovacao_em','entrega_prazo',r.dados->>'entrega_prazo') order by r.dados->>'entrega_prazo' nulls last) from le_admin.jornada_registros r
  where r.tipo='pedido' and coalesce(r.dados->>'implantacao_em','')='' and (coalesce(r.dados->>'aprovacao_em','')<>'' or coalesce(r.dados->>'correcao_em','')<>'' or exists(select 1 from le_admin.xml_revisoes x where x.contrato_id=r.contrato_id and x.tipo='final'))),'[]');
end $$;

create or replace function le_admin.xml_registrar(p_contrato text,p_tipo text,p_dados jsonb) returns le_admin.xml_revisoes language plpgsql security definer set search_path='' as $$
declare papel text:=le_admin.jornada_papel(); r le_admin.xml_revisoes; atual le_admin.xml_revisoes; n integer; a jsonb; total numeric; erro text;
begin
 if auth.uid() is null or papel is null then raise exception 'Acesso não autorizado'; end if;
 if p_tipo not in ('original','final') or jsonb_typeof(p_dados)<>'object' then raise exception 'Registro de XML inválido'; end if;
 if p_tipo='final' and papel not in ('correcao','gestor') then raise exception 'Somente o conferente anexa o XML final corrigido'; end if;
 if p_tipo='original' and papel not in ('vendedor','correcao','gestor','financeiro') then raise exception 'Acesso não autorizado'; end if;
 if not le_admin.comercial_ler(p_contrato::uuid) then raise exception 'Contrato não disponível'; end if;
 if p_tipo='final' and not exists(select 1 from le_admin.jornada_registros where contrato_id=p_contrato and tipo='pedido') then raise exception 'Inicie a jornada do contrato primeiro'; end if;
 if exists(select 1 from le_admin.jornada_registros where contrato_id=p_contrato and tipo='pedido' and coalesce(dados->>'implantacao_em','')<>'') and p_tipo='final' then raise exception 'Pedido já implantado: registre a alteração como aditivo'; end if;
 if coalesce(p_dados->>'arquivo','')='' or split_part(p_dados->>'arquivo','/',1)<>auth.uid()::text or not le_admin.jornada_comprovante(p_dados->>'arquivo') then raise exception 'Anexe o arquivo XML antes de registrar a versão'; end if;
 if coalesce(p_dados->>'conteudo_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'Identificador do conteúdo inválido'; end if;
 a:=coalesce(p_dados->'ambientes','[]');
 if jsonb_typeof(a)<>'array' or jsonb_array_length(a)>500 or exists(select 1 from jsonb_array_elements(a) x where jsonb_typeof(x)<>'object' or (nullif(x->>'valor','') is not null and (x->>'valor')::numeric<0)) then raise exception 'Ambientes inválidos'; end if;
 total:=nullif(p_dados->>'total_tabela','')::numeric; erro:=nullif(trim(coalesce(p_dados->>'leitura_erro','')),'');
 if total is not null and total<=0 then total:=null; erro:=coalesce(erro,'Total de tabela não encontrado no arquivo'); end if;
 if total is null and erro is null then raise exception 'Informe a falha de leitura quando o total não for lido'; end if;
 perform pg_advisory_xact_lock(hashtext('xml:'||p_contrato));
 select * into atual from le_admin.xml_revisoes where contrato_id=p_contrato and tipo=p_tipo order by versao desc limit 1;
 if atual.conteudo_hash=p_dados->>'conteudo_hash' then raise exception 'Este arquivo já é a versão vigente'; end if;
 n:=coalesce(atual.versao,0)+1;
 insert into le_admin.xml_revisoes(contrato_id,tipo,versao,arquivo,nome_arquivo,conteudo_hash,fornecedor,ambientes,total_tabela,leitura_erro,observacoes,criado_por)
 values(p_contrato,p_tipo,n,p_dados->>'arquivo',coalesce(nullif(p_dados->>'nome_arquivo',''),'arquivo.xml'),p_dados->>'conteudo_hash',nullif(p_dados->>'fornecedor',''),a,round(total,2),erro,coalesce(p_dados->>'observacoes',''),auth.uid()) returning * into r;
 insert into le_admin.xml_eventos(contrato_id,revisao_id,acao,autor,atual) values(p_contrato,r.id,'xml_'||p_tipo,auth.uid(),to_jsonb(r));
 return r;
end $$;

create or replace function le_admin.xml_custos_salvar(p_revisao uuid,p_custos jsonb,p_versao integer default 0) returns le_admin.xml_custos language plpgsql security definer set search_path='' as $$
declare r le_admin.xml_revisoes; x le_admin.xml_custos; d jsonb:='{}'; k text; v numeric;
begin
 if not le_admin.xml_fin() or le_admin.jornada_papel() not in ('financeiro','gestor') then raise exception 'Somente o financeiro registra custos'; end if;
 select * into r from le_admin.xml_revisoes where id=p_revisao;
 if not found or r.tipo<>'final' then raise exception 'Versão do XML final não encontrada'; end if;
 if exists(select 1 from le_admin.xml_revisoes where contrato_id=r.contrato_id and tipo='final' and versao>r.versao) then raise exception 'Existe versão mais recente do XML final'; end if;
 if exists(select 1 from le_admin.jornada_registros where contrato_id=r.contrato_id and tipo='pedido' and coalesce(dados->>'implantacao_em','')<>'') then raise exception 'Pedido já implantado: a conferência está encerrada'; end if;
 if jsonb_typeof(p_custos)<>'object' then raise exception 'Custos inválidos'; end if;
 for k in select key from jsonb_each(p_custos) loop
  if k not in ('fabrica','kits','frete','montagem','taxas','outros','outros_descricao','receita','receita_motivo','fonte_fabrica') then raise exception 'Campo de custo desconhecido: %',k; end if;
 end loop;
 foreach k in array array['fabrica','kits','frete','montagem','taxas','outros','receita'] loop
  if nullif(p_custos->>k,'') is not null then
   v:=round((p_custos->>k)::numeric,2);
   if v<0 then raise exception 'Valor negativo em %',k; end if;
   d:=d||jsonb_build_object(k,v);
  end if;
 end loop;
 foreach k in array array['outros_descricao','receita_motivo','fonte_fabrica'] loop
  if nullif(trim(coalesce(p_custos->>k,'')),'') is not null then d:=d||jsonb_build_object(k,trim(p_custos->>k)); end if;
 end loop;
 if d ? 'receita' and not d ? 'receita_motivo' then raise exception 'Justifique a receita informada manualmente'; end if;
 if coalesce((d->>'outros')::numeric,0)>0 and not d ? 'outros_descricao' then raise exception 'Descreva os outros custos'; end if;
 select * into x from le_admin.xml_custos where revisao_id=p_revisao for update;
 if coalesce(x.versao,0)<>coalesce(p_versao,0) then raise exception 'Custos atualizados por outra pessoa. Recarregue antes de salvar.'; end if;
 insert into le_admin.xml_custos(revisao_id,dados,versao,atualizado_por,atualizado_em) values(p_revisao,d,1,auth.uid(),now())
 on conflict(revisao_id) do update set dados=excluded.dados,versao=le_admin.xml_custos.versao+1,atualizado_por=auth.uid(),atualizado_em=now() returning * into x;
 insert into le_admin.xml_eventos(contrato_id,revisao_id,acao,autor,atual) values(r.contrato_id,r.id,'custos',auth.uid(),d);
 return x;
end $$;

create or replace function le_admin.xml_conferir(p_revisao uuid,p_hash text,p_observacoes text default '') returns le_admin.xml_conferencias language plpgsql security definer set search_path='' as $$
declare r le_admin.xml_revisoes; a jsonb; c le_admin.xml_conferencias;
begin
 if le_admin.jornada_papel() not in ('financeiro','gestor') then raise exception 'Somente a Leia ou a gestão registram o OK financeiro'; end if;
 select * into r from le_admin.xml_revisoes where id=p_revisao;
 if not found or r.tipo<>'final' then raise exception 'Versão do XML final não encontrada'; end if;
 perform pg_advisory_xact_lock(hashtext('xml:'||r.contrato_id));
 a:=le_admin.xml_analise_interna(r.contrato_id);
 if a->'final'->>'id' is distinct from p_revisao::text then raise exception 'Existe versão mais recente do XML final. Recarregue a conferência'; end if;
 if (a->>'implantado')::boolean then raise exception 'Pedido já implantado'; end if;
 if a->>'valores_hash' is distinct from p_hash then raise exception 'Valores mudaram desde que você abriu a conferência. Recarregue e confira novamente'; end if;
 if a->>'resultado'='Bloqueado' then raise exception 'Pré-análise bloqueada: resolva os bloqueios antes do OK'; end if;
 if (a->>'ok_valido')::boolean then raise exception 'Esta versão já foi conferida'; end if;
 insert into le_admin.xml_conferencias(revisao_id,contrato_id,valores_hash,resultado,analise,observacoes,conferido_por)
 values(p_revisao,r.contrato_id,p_hash,a->>'resultado',a,coalesce(p_observacoes,''),auth.uid()) returning * into c;
 insert into le_admin.xml_eventos(contrato_id,revisao_id,acao,autor,atual) values(r.contrato_id,r.id,'ok_financeiro',auth.uid(),to_jsonb(c));
 return c;
end $$;

create or replace function le_admin.xml_autorizar_excecao(p_revisao uuid,p_hash text,p_motivo text) returns le_admin.xml_excecoes language plpgsql security definer set search_path='' as $$
declare nome text; r le_admin.xml_revisoes; a jsonb; e le_admin.xml_excecoes;
begin
 select aprovadora into nome from le_admin.jornada_acessos where usuario_id=auth.uid() and ativo;
 if nome is null then raise exception 'Somente Priscila, Andressa ou Catelli podem autorizar'; end if;
 if coalesce(trim(p_motivo),'')='' then raise exception 'Justifique a autorização'; end if;
 select * into r from le_admin.xml_revisoes where id=p_revisao;
 if not found or r.tipo<>'final' then raise exception 'Versão do XML final não encontrada'; end if;
 a:=le_admin.xml_analise_interna(r.contrato_id);
 if a->'final'->>'id' is distinct from p_revisao::text or a->>'valores_hash' is distinct from p_hash then raise exception 'Valores mudaram. Recarregue antes de autorizar'; end if;
 if not exists(select 1 from jsonb_array_elements(a->'motivos') m where m->>'texto' like 'Prejuízo previsto%') then raise exception 'Não há prejuízo pendente de autorização'; end if;
 insert into le_admin.xml_excecoes(revisao_id,contrato_id,valores_hash,motivo,aprovadora,autorizado_por) values(p_revisao,r.contrato_id,p_hash,trim(p_motivo),nome,auth.uid()) returning * into e;
 insert into le_admin.xml_eventos(contrato_id,revisao_id,acao,autor,atual) values(r.contrato_id,r.id,'excecao_prejuizo',auth.uid(),to_jsonb(e));
 return e;
end $$;

create or replace function le_admin.xml_margem_minima(p_margem numeric) returns void language plpgsql security definer set search_path='' as $$
declare anterior numeric;
begin
 if le_admin.jornada_papel() not in ('financeiro','gestor') then raise exception 'Somente financeiro ou gestão configuram a margem mínima'; end if;
 if p_margem is not null and (p_margem<0 or p_margem>=100) then raise exception 'Margem mínima deve estar entre 0 e 99,99%%'; end if;
 select margem_minima into anterior from le_admin.jornada_config where id;
 update le_admin.jornada_config set margem_minima=p_margem,atualizado_em=now() where id;
 insert into le_admin.xml_eventos(contrato_id,acao,autor,anterior,atual) values('config','margem_minima',auth.uid(),to_jsonb(anterior),to_jsonb(p_margem));
end $$;

-- Trava no servidor: implantação somente com XML final e OK da Leia da versão vigente.
create or replace function le_admin.xml_exigir_ok() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='pedido' and coalesce(new.dados->>'implantacao_em','')<>'' and (tg_op='INSERT' or coalesce(old.dados->>'implantacao_em','')='') then
  if not coalesce((le_admin.xml_analise_interna(new.contrato_id)->>'ok_valido')::boolean,false) then
   raise exception 'Implantação exige XML final corrigido e o OK da Leia para a versão vigente';
  end if;
 end if;
 return new;
end $$;
create trigger xml_exigir_ok before insert or update on le_admin.jornada_registros for each row execute function le_admin.xml_exigir_ok();

revoke all on function le_admin.xml_fin(),le_admin.xml_analise_interna(text),le_admin.xml_analise(text),le_admin.xml_painel(),le_admin.xml_registrar(text,text,jsonb),le_admin.xml_custos_salvar(uuid,jsonb,integer),le_admin.xml_conferir(uuid,text,text),le_admin.xml_autorizar_excecao(uuid,text,text),le_admin.xml_margem_minima(numeric),le_admin.xml_exigir_ok() from public,anon,authenticated;
grant execute on function le_admin.xml_fin(),le_admin.xml_analise(text),le_admin.xml_painel(),le_admin.xml_registrar(text,text,jsonb),le_admin.xml_custos_salvar(uuid,jsonb,integer),le_admin.xml_conferir(uuid,text,text),le_admin.xml_autorizar_excecao(uuid,text,text),le_admin.xml_margem_minima(numeric) to authenticated;
notify pgrst,'reload schema';
commit;
