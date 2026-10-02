-- Opcional após homologação. Requer extensão pg_cron habilitada no Supabase.
-- Gera notificações INTERNAS mesmo quando ninguém está com a página aberta.
-- Não envia e-mail, WhatsApp ou mensagem externa.
select cron.schedule('leblanc-assistencias-diario','0 11 * * *',
 $$select le_admin.jornada_gerar_alertas();$$);
