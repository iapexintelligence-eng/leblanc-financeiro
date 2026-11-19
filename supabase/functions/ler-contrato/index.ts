// ler-contrato: recebe a foto (ou o PDF escaneado) de um contrato, de quem está logado no sistema,
// e devolve os dados do cliente lidos pela IA (fluxo do n8n "LE BLANC — Ler contrato por IA").
// POST { base64, media_type }  →  { ok, dados: { cliente_nome, cliente_cpf, ..., valor_total, vendedor } }
// URL e token do n8n ficam em le_admin.integracoes (só a service role lê).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let CFG: Record<string, string> | null = null;
async function cfg() {
  if (CFG) return CFG;
  const { data } = await admin.schema("le_admin").from("integracoes").select("chave, valor").in("chave", ["ler_contrato_url", "ler_contrato_token"]);
  CFG = Object.fromEntries((data || []).map((r: { chave: string; valor: string }) => [r.chave, r.valor]));
  return CFG;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "use POST" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    const { data: u } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!u?.user) return json({ ok: false, erro: "Entre no sistema para ler o contrato." }, 401);
    const { base64, media_type } = await req.json();
    if (!base64 || typeof base64 !== "string") return json({ ok: false, erro: "Arquivo vazio." }, 400);
    if (!TIPOS.includes(media_type)) return json({ ok: false, erro: "Envie uma foto (JPG, PNG) ou um PDF." }, 415);
    if (base64.length > 14_000_000) return json({ ok: false, erro: "Arquivo grande demais para leitura automática (máx. ~10 MB)." }, 413);
    const c = await cfg();
    if (!c.ler_contrato_url || !c.ler_contrato_token) return json({ ok: false, erro: "Leitura automática não configurada." }, 500);
    const r = await fetch(c.ler_contrato_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-leblanc-token": c.ler_contrato_token },
      body: JSON.stringify({ base64, media_type }),
    });
    const txt = await r.text();
    let out: unknown;
    try { out = JSON.parse(txt); } catch { out = { ok: false, erro: "Resposta inválida da leitura: " + txt.slice(0, 200) }; }
    return json(out, r.ok ? 200 : 502);
  } catch (e) {
    return json({ ok: false, erro: String((e as Error)?.message || e) }, 500);
  }
});
