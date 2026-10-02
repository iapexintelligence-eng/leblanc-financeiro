begin;
create or replace function le_admin.comercial_total_forma(f jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare valor numeric:=coalesce((f->>'valor')::numeric,0); n integer:=coalesce((f->>'parcelas')::integer,1); forma text:=f->>'forma'; op text:=coalesce(f->>'operadora','Sicoob'); bandeira text:=f->>'bandeira'; mdr numeric; ant numeric:=0; fator numeric; ret numeric; coef numeric; total numeric; t jsonb;
begin
 if valor<0 then raise exception 'Valor de pagamento negativo'; end if;
 if forma='Pix / À vista' then return round(valor,2); end if;
 if forma='Financeira Santander' then
  n:=(f->>'prazoFin')::integer;
  t:='{"30":{"1":[1.0439,4.21],"2":[0.5236,4.51],"3":[0.3498,4.71],"4":[0.2655,5.84],"5":[0.21494,6.95],"6":[0.18125,8.04],"7":[0.1569,8.95],"8":[0.13887,9.99],"9":[0.12487,11.02],"10":[0.11367,12.03],"11":[0.10452,13.02],"12":[0.0969,14],"13":[0.09075,15.24],"14":[0.08524,16.2],"15":[0.08047,17.15],"16":[0.0763,18.09],"17":[0.07263,19.01],"18":[0.06937,19.91],"19":[0.06646,20.81],"20":[0.06384,21.68],"21":[0.06148,22.55],"22":[0.05934,23.4],"23":[0.05739,24.24],"24":[0.05604,25.64]},"60":{"1":[1.08973,8.23],"2":[0.53998,7.4],"3":[0.35837,6.99],"4":[0.272,8.09],"5":[0.2202,9.17],"6":[0.18569,10.24],"7":[0.16066,11.08],"8":[0.14221,12.1],"9":[0.12786,13.1],"10":[0.1164,14.09],"11":[0.10703,15.06],"12":[0.09922,16.01],"13":[0.09298,17.27],"14":[0.08733,18.21],"15":[0.08244,19.13],"16":[0.07817,20.05],"17":[0.07441,20.95],"18":[0.07107,21.83],"19":[0.06809,22.7],"20":[0.06541,23.56],"21":[0.06299,24.4],"22":[0.0608,25.23],"23":[0.0588,26.05],"24":[0.05745,27.47]}}'::jsonb -> (f->>'carencia') -> n::text;
  if t is null then raise exception 'Prazo/carência Santander inválidos'; end if;
  coef:=(t->>0)::numeric;ret:=(t->>1)::numeric;
  total:=case when f->>'absorver'='true' then valor else valor/(1-ret/100) end;
  return round(total*coef,2)*n;
 end if;
 if forma not in ('Débito','Crédito (cartão)') then raise exception 'Forma inválida'; end if;
 if forma='Débito' then n:=1; end if;
 if n<1 or n>(case when op='Cielo' then 18 else 21 end) or op not in ('Sicoob','Cielo') then raise exception 'Parcelamento/operadora inválidos'; end if;
 if op='Cielo' then
  if bandeira<>'Visa / Master / Elo' then raise exception 'Bandeira sem taxa Cielo cadastrada'; end if;
  mdr:=case when forma='Débito' then 0.79 when n=1 then 1.4 when n<=6 then 2.29 else 2.69 end;
  if forma<>'Débito' then ant:=(array[1.29,0.70,0.80,1.00,0.90,0.85,0.70,0.70,0.70,0.70,0.80,0.75])[least(n,12)];end if;
 else
  if bandeira='Amex' then
   if forma='Débito' then raise exception 'Amex débito não cadastrado'; end if;
   mdr:=case when n=1 then 4.69 else 4.99 end;
  elsif bandeira='Visa / Master / Elo' then mdr:=case when forma='Débito' then 0.89 when n=1 then 2 when n<=6 then 1.69 else 1.99 end;
  else raise exception 'Bandeira inválida';end if;
  if forma<>'Débito' and n>1 then ant:=1.55*(n+1)/2.0;end if;
 end if;
 fator:=(1-mdr/100)*(1-ant/100);
 return round(case when f->>'absorver'='true' then valor else valor/fator end,2);
end $$;
commit;
