-- Contrato assinado subido direto na "Novo registro" da jornada: em uma só operação registra a venda
-- (ou reaproveita a já lançada no Histórico de vendas), cria o contrato no sistema com o PDF anexado
-- e abre a ficha do cliente. O financeiro não é confirmado aqui: parcelas e comprovantes seguem com a Leia.

create or replace function le_admin.contrato_assinado_registrar(p_dados jsonb, p_arquivo text, p_venda_id integer default null, p_contrato uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  papel text := le_admin.jornada_papel();
  v_nome text := nullif(trim(p_dados->>'cliente_nome'), '');
  v_vendedor text := nullif(trim(p_dados->>'vendedor'), '');
  v_data date;
  v_valor numeric;
  v_venda integer;
  v_contrato uuid;
  v_numero text;
  v_email text;
  v_reg le_admin.jornada_registros;
begin
  if auth.uid() is null or papel is null or papel not in ('gestor', 'financeiro', 'vendedor') then
    raise exception 'Somente comercial, financeiro e gestão registram contrato assinado';
  end if;
  if jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Dados do contrato inválidos'; end if;
  if v_nome is null then raise exception 'Informe o nome do cliente'; end if;
  if coalesce(p_dados->>'data_contrato', '') = '' then raise exception 'Informe a data do contrato'; end if;
  v_data := (p_dados->>'data_contrato')::date;
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data do contrato não pode ser futura'; end if;
  v_valor := nullif(p_dados->>'valor', '')::numeric;
  if v_valor is not null and v_valor <= 0 then raise exception 'Valor do contrato inválido'; end if;
  if p_arquivo is null or not exists (select 1 from storage.objects o where o.bucket_id = 'jornada-documentos' and o.name = p_arquivo and split_part(o.name, '/', 1) = auth.uid()::text) then
    raise exception 'Anexe o contrato assinado';
  end if;
  if exists (select 1 from leblanc.contrato_anexos a where a.path = p_arquivo) then
    raise exception 'Este arquivo já foi usado em outro contrato';
  end if;
  select email into v_email from auth.users where id = auth.uid();

  if p_contrato is not null then
    -- Contrato que já existe no sistema (importado ou emitido): só anexa o assinado e abre a ficha.
    select c.id, c.numero into v_contrato, v_numero from leblanc.contratos c where c.id = p_contrato;
    if not found then raise exception 'Contrato não encontrado'; end if;
    if exists (select 1 from le_admin.jornada_registros r where r.tipo = 'pedido' and r.contrato_id = p_contrato::text) then
      raise exception 'Este contrato já tem ficha na jornada: abra a ficha existente';
    end if;
    v_venda := coalesce(
      nullif((select c.dados_json->>'venda_id' from leblanc.contratos c where c.id = p_contrato), '')::integer,
      nullif(substring(v_numero from '^(?:HIST|CTR)-V(\d+)$'), '')::integer);
  else
    if p_venda_id is not null then
      -- Venda já lançada no Histórico de vendas: não cria outra.
      if not exists (select 1 from le_admin.vendas v where v.id = p_venda_id) then raise exception 'Venda não encontrada'; end if;
      if exists (select 1 from leblanc.contratos c where c.dados_json->>'venda_id' = p_venda_id::text or c.numero in ('HIST-V' || p_venda_id, 'CTR-V' || p_venda_id)) then
        raise exception 'Esta venda já tem contrato no sistema: selecione-o no campo Contrato';
      end if;
      v_venda := p_venda_id;
    else
      insert into le_admin.vendas (cliente_nome, vendedor, valor_vendido, data_venda, observacoes)
      values (v_nome, v_vendedor, v_valor, v_data, 'Lançada pelo contrato assinado na jornada')
      returning id into v_venda;
    end if;
    v_numero := 'CTR-V' || v_venda;
    insert into leblanc.contratos (numero, cliente_nome, cliente_cpf, cliente_telefone, cliente_endereco, projeto_ambientes, vendor,
      modelo_contrato, valor_final, forma_pagamento, status, observacoes, dados_json)
    values (v_numero, v_nome, nullif(trim(p_dados->>'cliente_cpf'), ''), nullif(trim(p_dados->>'cliente_telefone'), ''),
      nullif(trim(p_dados->>'cliente_endereco'), ''), nullif(trim(p_dados->>'ambientes'), ''), v_vendedor,
      'leblanc', v_valor, 'avista', 'rascunho', 'Contrato assinado registrado pela jornada',
      jsonb_build_object('venda_id', v_venda, 'cliente_nome', v_nome, 'data_contrato', v_data, 'valor_final', v_valor,
        'forma_pagamento_contrato', nullif(trim(p_dados->>'forma_pagamento'), ''),
        'importacao', jsonb_build_object('lote', 'contrato-assinado', 'origem', 'contrato_assinado', 'competencia', to_char(v_data, 'YYYY-MM'),
          'venda_existente_id', p_venda_id, 'financeiro_conferido', false, 'registrado_por', v_email)))
    returning id into v_contrato;
  end if;

  insert into leblanc.contrato_anexos (contrato_id, bucket, path, tipo, nome_arquivo, enviado_por)
  values (v_contrato, 'jornada-documentos', p_arquivo, 'contrato_assinado',
    coalesce(nullif(trim(p_dados->>'arquivo_nome'), ''), regexp_replace(p_arquivo, '^.*/', '')), v_email);

  v_reg := le_admin.jornada_salvar('pedido', v_contrato::text, jsonb_build_object(
    'cliente_nome', v_nome, 'venda_data', v_data, 'tipo_venda', coalesce(nullif(p_dados->>'tipo_venda', ''), 'Normal'),
    'contrato_assinado_arquivo', p_arquivo));

  return jsonb_build_object('contrato_id', v_contrato, 'numero', v_numero, 'venda_id', v_venda, 'registro', to_jsonb(v_reg));
end $$;

revoke all on function le_admin.contrato_assinado_registrar(jsonb, text, integer, uuid) from public, anon;
grant execute on function le_admin.contrato_assinado_registrar(jsonb, text, integer, uuid) to authenticated;
