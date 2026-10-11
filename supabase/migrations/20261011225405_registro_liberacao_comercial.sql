begin;
alter table le_admin.comercial_aprovacoes
 add column if not exists data_autorizacao date,
 add column if not exists canal_autorizacao text,
 add column if not exists comprovante_autorizacao text,
 add column if not exists observacao_autorizacao text,
 add column if not exists registrado_por_nome text;
create or replace function le_admin.comercial_registrar_liberacao(p_id uuid,p_liberado_por text,p_data date,p_canal text,p_comprovante text default null,p_observacao text default '') returns void
language plpgsql security definer set search_path='' as $$
declare a le_admin.comercial_aprovacoes; c leblanc.contratos; acesso le_admin.jornada_acessos;
begin
 select * into acesso from le_admin.jornada_acessos where usuario_id=auth.uid() and ativo;
 if auth.uid() is null or acesso.aprovadora is null then raise exception 'Somente a diretoria autorizada pode registrar esta liberação'; end if;
 if p_liberado_por is null or p_liberado_por not in ('Priscila','Andressa','Catelli') then raise exception 'Informe Priscila, Andressa ou Catelli como responsável pela autorização'; end if;
 if p_data is null or p_data>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe uma data de autorização válida, sem data futura'; end if;
 if p_canal is null or p_canal not in ('Sistema','WhatsApp','E-mail','Presencial') then raise exception 'Informe o canal da autorização'; end if;
 if p_canal='Sistema' and p_liberado_por is distinct from acesso.aprovadora then raise exception 'No sistema, autorize com seu próprio acesso'; end if;
 if p_canal<>'Sistema' then
  if nullif(trim(p_comprovante),'') is null or split_part(p_comprovante,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='jornada-documentos' and name=p_comprovante) then raise exception 'Anexe o comprovante da autorização recebida'; end if;
 end if;
 select * into a from le_admin.comercial_aprovacoes where id=p_id;
 if not found then raise exception 'Solicitação inexistente'; end if;
 select * into c from leblanc.contratos where id::text=a.contrato_id for update;
 select * into a from le_admin.comercial_aprovacoes where id=p_id for update;
 if c.id is null or le_admin.comercial_hash(c.dados_json) is distinct from a.versao_hash then raise exception 'Proposta mudou. Atualize o contrato e confira a solicitação atual'; end if;
 if a.aprovado_em is not null then raise exception 'Esta versão já foi autorizada. O registro original está preservado'; end if;
 update le_admin.comercial_aprovacoes set aprovado_por=auth.uid(),aprovadora=p_liberado_por,aprovado_em=now(),data_autorizacao=p_data,canal_autorizacao=p_canal,comprovante_autorizacao=case when p_canal='Sistema' then null else p_comprovante end,observacao_autorizacao=p_observacao,registrado_por_nome=acesso.nome where id=p_id;
 perform le_admin.comercial_salvar(a.contrato_id,c.dados_json);
 insert into leblanc.contrato_historico(contrato_id,numero,acao,descricao,editado_por,alteracoes)
 values(c.id,c.numero,'liberacao','Autorização de '||p_liberado_por||' via '||p_canal,auth.uid()::text,jsonb_build_object('solicitacao',p_id,'data_autorizacao',p_data,'canal',p_canal,'registrado_por',auth.uid(),'versao_hash',a.versao_hash));
end $$;
-- Compatibilidade com telas anteriores: autorização direta registra identidade e data do servidor.
create or replace function le_admin.comercial_aprovar(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare nome text;
begin
 select aprovadora into nome from le_admin.jornada_acessos where usuario_id=auth.uid() and ativo;
 perform le_admin.comercial_registrar_liberacao(p_id,nome,(now() at time zone 'America/Sao_Paulo')::date,'Sistema',null,'');
end $$;
revoke all on function le_admin.comercial_registrar_liberacao(uuid,text,date,text,text,text),le_admin.comercial_aprovar(uuid) from public,anon;
grant execute on function le_admin.comercial_registrar_liberacao(uuid,text,date,text,text,text),le_admin.comercial_aprovar(uuid) to authenticated;
create or replace function le_admin.comercial_liberacoes_contrato(p_contrato text) returns setof jsonb language sql security invoker set search_path='' as $$
 select to_jsonb(a)||jsonb_build_object('versao_atual',a.versao_hash=le_admin.comercial_hash(c.dados_json))
 from le_admin.comercial_aprovacoes a join leblanc.contratos c on c.id::text=a.contrato_id
 where a.contrato_id=p_contrato order by a.criado_em desc
$$;
revoke all on function le_admin.comercial_liberacoes_contrato(text) from public,anon;
grant execute on function le_admin.comercial_liberacoes_contrato(text) to authenticated;
notify pgrst,'reload schema';
commit;
