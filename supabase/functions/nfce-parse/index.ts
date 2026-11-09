// Edge Function "nfce-parse": recebe { url } (link/QR da NFC-e do RS ou a chave de 44 dígitos) e devolve a nota estruturada.
// Exige usuário logado (JWT do Supabase). Nunca busca a URL recebida: só extrai a chave e consulta um endereço fixo da Sefaz RS.
// Não grava nem registra nada da nota (CPF, nomes, itens).
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseNfce, NfceParseError } from "./parser.js";

const HOST = "sefaz.rs.gov.br";
const CONSULTA = "https://www.sefaz.rs.gov.br/ASP/AAE_ROOT/NFE/SAT-WEB-NFE-NFC_2.asp";

const CORS = {
  "Access-Control-Allow-Origin": "*",   // a autenticação é por Authorization (sem cookie), então "*" não expõe a sessão de ninguém
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...CORS, "Content-Type": "application/json"}});
const fail = (status: number, code: string, message: string) => json({error: {code, message}}, status);

/* chave de acesso a partir do link (chaveNFe=..., QR code p=chave|2|...) ou da própria chave; só RS (43), modelo 65 (NFC-e) */
function chaveDe(entrada: string): string | null {
  const s = entrada.trim();
  let k: string | null = null;
  if (/^\d{44}$/.test(s)) k = s;
  else {
    let u: URL;
    try { u = new URL(s); } catch { return null; }
    if (u.protocol !== "https:" || (u.hostname !== HOST && !u.hostname.endsWith("." + HOST))) return null;
    const v = u.searchParams.get("chaveNFe") || (u.searchParams.get("p") || "").split("|")[0];
    k = /^\d{44}$/.test(v) ? v : null;
  }
  return k && k.slice(0, 2) === "43" && k.slice(20, 22) === "65" ? k : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: CORS});
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "unauthorized", "Entre na sua conta.");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return fail(401, "unauthorized", "Sessão inválida.");

  let url = "";
  try { url = String((await req.json()).url || ""); } catch { /* cai na validação abaixo */ }
  const chave = chaveDe(url);
  if (!chave) return fail(400, "invalid_url", "Só aceito link ou chave de NFC-e do RS (sefaz.rs.gov.br).");

  let html: string;
  try {
    const r = await fetch(CONSULTA, {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({HML: "false", chaveNFe: chave, Action: "Avançar"}),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return fail(502, "sefaz_error", `A Sefaz respondeu ${r.status}.`);
    html = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
  } catch {
    return fail(504, "sefaz_unreachable", "Não consegui falar com a Sefaz agora.");
  }

  try {
    const nota = parseNfce(html);
    if (nota.accessKey !== chave) return fail(502, "key_mismatch", "A Sefaz devolveu outra nota.");
    return json(nota);
  } catch (e) {
    if (e instanceof NfceParseError || e?.name === "NfceParseError") return fail(e.code === "not_found" ? 404 : 502, e.code, e.message);   // "layout changed: ..." ou nota inexistente
    return fail(500, "internal", "Erro ao ler a nota.");
  }
});
