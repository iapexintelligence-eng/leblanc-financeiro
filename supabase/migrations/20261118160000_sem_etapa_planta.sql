-- A etapa "enviar planta ao corretor" sai da jornada: não gera mais prazo (planta_prazo) nem é
-- exigida para liberar a pasta do cliente. O resto do checklist (grupo, imagens e entrada
-- conferida) continua obrigatório. Troca só esses trechos da função que está no banco.
do $$
declare
  def text := pg_get_functiondef('le_admin.jornada_salvar(text,text,jsonb,uuid,integer)'::regprocedure);
  novo text := def;
  trecho text;
begin
  foreach trecho in array array[
    $t$ or not le_admin.jornada_comprovante(d->>'planta_arquivo') or coalesce(d->>'planta_enviada_em','')='')$t$,
    $t$'Liberação exige checklist completo, planta enviada e entrada confirmada'$t$,
    $t$  if coalesce(d->>'venda_data','')<>'' then d:=d||jsonb_build_object('planta_prazo',le_admin.jornada_uteis((d->>'venda_data')::date,2)); end if;
$t$
  ] loop
    if position(trecho in novo) = 0 then raise exception 'Trecho da etapa de planta não encontrado em jornada_salvar: %', left(trecho, 60); end if;
  end loop;
  novo := replace(novo, $t$ or not le_admin.jornada_comprovante(d->>'planta_arquivo') or coalesce(d->>'planta_enviada_em','')='')$t$, ')');
  novo := replace(novo, $t$'Liberação exige checklist completo, planta enviada e entrada confirmada'$t$, $t$'Liberação exige checklist completo e entrada confirmada'$t$);
  novo := replace(novo, $t$  if coalesce(d->>'venda_data','')<>'' then d:=d||jsonb_build_object('planta_prazo',le_admin.jornada_uteis((d->>'venda_data')::date,2)); end if;
$t$, '');
  execute novo;
end $$;

-- O planta_prazo que já está nas fichas antigas deixa de ser lido pelas telas e some na próxima vez que a ficha for salva.
