-- Views financeiras passam a respeitar as permissões das tabelas de quem consulta.
alter view le_admin.vw_fatura_rateio set (security_invoker=true);
alter view le_admin.vw_gratificacoes_pendentes set (security_invoker=true);
alter view le_admin.vw_historico_mensal set (security_invoker=true);
alter view le_admin.vw_inadimplencia set (security_invoker=true);
alter view le_admin.vw_margem_projetos set (security_invoker=true);
alter view le_admin.vw_previsao_caixa set (security_invoker=true);
alter view le_admin.vw_pro_labore set (security_invoker=true);
