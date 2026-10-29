// Teste de fumaça contra o Supabase real, com dois usuários anônimos (A = admin do ambiente, B = convidado).
// Uso:  npm run smoke   (lê o .env)   ou   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/smoke-test.mjs
// Pré-requisitos: "Allow anonymous sign-ins" ligado e a migration update_env_prefs aplicada.
// Cria 2 usuários anônimos e 1 ambiente de teste; o ambiente é apagado no fim (os usuários anônimos ficam no Auth).
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error("Faltam SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (ou as VITE_ equivalentes)."); process.exit(2); }

const novoCliente = () => createClient(URL, KEY, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
const results = [];
async function check(nome, fn){
  try { const r = await fn(); const ok = r === undefined || r === true; results.push([nome, ok, ok ? "" : String(r)]); console.log((ok ? "PASS" : "FAIL") + "  " + nome + (ok ? "" : "  -> " + r)); }
  catch(e){ results.push([nome, false, e.message]); console.log("FAIL  " + nome + "  -> " + (e && e.message)); }
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
const bloqueado = r => r.error ? true : (Array.isArray(r.data) && r.data.length === 0 ? true : "não foi bloqueado: " + JSON.stringify(r.data).slice(0, 80));

const A = novoCliente(), B = novoCliente();
let envId, token, listId, itemId, idA, idB;

await check("A entra como anônimo", async () => { const {data, error} = await A.auth.signInAnonymously(); if (error) return error.message; idA = data.user.id; });
await check("B entra como anônimo", async () => { const {data, error} = await B.auth.signInAnonymously(); if (error) return error.message; idB = data.user.id; });
if (!idA || !idB) { console.log("\nSem login anônimo não dá para continuar (Auth → Sign In / Providers → Allow anonymous sign-ins)."); process.exit(1); }

await check("A cria ambiente e vira admin/criador", async () => {
  const {data, error} = await A.from("envs").insert({name: "smoke-test"}).select("id, invite_token").single();
  if (error) return error.message; envId = data.id; token = data.invite_token;
  const m = await A.from("env_members").select("role, creator, removed").eq("env_id", envId).eq("user_id", idA).single();
  if (m.error) return m.error.message;
  return m.data.role === "admin" && m.data.creator && !m.data.removed ? true : "membro incorreto: " + JSON.stringify(m.data);
});
if (!envId) { console.log("\nSem ambiente não dá para continuar."); process.exit(1); }

await check("A: CRUD de lista e item (criar, ler, editar, riscar, apagar)", async () => {
  let r = await A.from("lists").insert({env_id: envId, title: "Feira"}).select("id").single(); if (r.error) return "lista: " + r.error.message; listId = r.data.id;
  r = await A.from("items").insert({env_id: envId, list_id: listId, text: "arroz", cat: "mercearia", ord: 1}).select("id").single(); if (r.error) return "item: " + r.error.message; itemId = r.data.id;
  r = await A.from("items").update({text: "arroz integral"}).eq("id", itemId).select("text"); if (r.error || r.data[0]?.text !== "arroz integral") return "editar: " + (r.error?.message || "sem linha");
  r = await A.from("items").update({checked: true, checked_at: new Date().toISOString()}).eq("id", itemId).select("checked"); if (r.error || !r.data[0]?.checked) return "riscar: " + (r.error?.message || "sem linha");
  r = await A.from("items").select("id").eq("list_id", listId); if (r.error || r.data.length !== 1) return "ler: " + (r.error?.message || r.data.length + " linhas");
  const extra = await A.from("items").insert({env_id: envId, list_id: listId, text: "x"}).select("id").single(); if (extra.error) return "item extra: " + extra.error.message;
  r = await A.from("items").delete().eq("id", extra.data.id).select("id"); if (r.error || r.data.length !== 1) return "apagar: " + (r.error?.message || "sem linha");
});

// ---- RLS: B ainda não entrou ----
await check("RLS: B não vê o ambiente nem os dados antes de entrar", async () => {
  for (const [t, col] of [["envs", "id"], ["lists", "env_id"], ["items", "env_id"], ["trips", "env_id"], ["env_members", "env_id"]]) {
    const r = await B.from(t).select("*").eq(col, envId); const b = bloqueado(r); if (b !== true) return t + ": " + b;
  }
});
await check("RLS: B não cria lista nem item no ambiente de A", async () => {
  const l = await B.from("lists").insert({env_id: envId, title: "invasão"}); if (!l.error) return "criou lista";
  const i = await B.from("items").insert({env_id: envId, list_id: listId, text: "invasão"}); if (!i.error) return "criou item";
});
await check("RLS: B não edita nem apaga o item de A", async () => {
  const u = await B.from("items").update({text: "hackeado"}).eq("id", itemId).select("id"); if (!u.error && u.data.length) return "editou";
  const d = await B.from("items").delete().eq("id", itemId).select("id"); if (!d.error && d.data.length) return "apagou";
  const chk = await A.from("items").select("text").eq("id", itemId).single(); if (chk.data?.text !== "arroz integral") return "o texto mudou";
});
await check("RLS: B não usa update_env_prefs antes de entrar", async () => {
  const r = await B.rpc("update_env_prefs", {e: envId, p_learned: {x: "pet"}});
  if (!r.error) return "permitiu";
  if (r.error.code === "PGRST202") return "a função update_env_prefs não existe: rode supabase/migrations/20261029120000_update_env_prefs.sql";
  if (!/sem_permissao/.test(r.error.message)) return r.error.message;
});
await check("join_env: token inválido é recusado (convite_invalido)", async () => {
  const r = await B.rpc("join_env", {token: "token-que-nao-existe"}); return r.error && /convite_invalido/.test(r.error.message) ? true : "esperava convite_invalido, veio: " + (r.error?.message || "sem erro");
});

// ---- Realtime: B escuta, A escreve ----
let recebido = null; let canal;
await check("Realtime: B assina o canal do ambiente", async () => {
  const j = await B.rpc("join_env", {token}); if (j.error) return "join_env: " + j.error.message; if (j.data !== envId) return "id diferente";
  await new Promise((ok, falha) => {
    canal = B.channel("smoke:" + envId)
      .on("postgres_changes", {event: "*", schema: "public", table: "items", filter: "env_id=eq." + envId}, p => { recebido = p; })
      .subscribe(s => { if (s === "SUBSCRIBED") ok(); else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") falha(new Error("canal: " + s)); });
    setTimeout(() => falha(new Error("timeout ao assinar")), 10000);
  });
});

await check("join_env: B entra pelo token (já como membro, é idempotente)", async () => {
  const r = await B.rpc("join_env", {token}); return r.error ? r.error.message : (r.data === envId ? true : "id diferente");
});
await check("B lê lista e itens depois de entrar", async () => {
  const l = await B.from("lists").select("id").eq("id", listId); const i = await B.from("items").select("id").eq("id", itemId);
  return l.data?.length === 1 && i.data?.length === 1 ? true : "não leu (" + (l.error?.message || i.error?.message || "vazio") + ")";
});
await check("Realtime: A altera um item e B recebe o evento", async () => {
  await A.from("items").update({text: "arroz parboilizado"}).eq("id", itemId);
  for (let t = 0; t < 40 && !recebido; t++) await esperar(250);
  return recebido && recebido.new?.text === "arroz parboilizado" ? true : "B não recebeu em 10 s";
});
await check("B cria item e edita o que A criou (membro escreve)", async () => {
  const r = await B.from("items").insert({env_id: envId, list_id: listId, text: "leite", cat: "frios", ord: 2}).select("id").single(); if (r.error) return "inserir: " + r.error.message;
  const u = await B.from("items").update({checked: true}).eq("id", itemId).select("id"); if (u.error || !u.data.length) return "editar item de A: " + (u.error?.message || "sem linha");
});

// ---- Permissões de admin x membro ----
await check("RLS: B (membro) não renomeia o ambiente (update em envs é só admin)", async () => {
  const r = await B.from("envs").update({name: "renomeado por B"}).eq("id", envId).select("id"); if (!r.error && r.data.length) return "renomeou";
  const chk = await A.from("envs").select("name").eq("id", envId).single(); if (chk.data?.name !== "smoke-test") return "o nome mudou";
});
await check("RLS: B (membro) não gera novo convite nem mexe em membros", async () => {
  const r = await B.rpc("rotate_invite", {e: envId}); if (!r.error) return "rotate_invite permitiu";
  const u = await B.from("env_members").update({role: "admin"}).eq("env_id", envId).eq("user_id", idB).select("role"); if (!u.error && u.data.length) return "B se promoveu a admin";
  const d = await B.from("env_members").delete().eq("env_id", envId).eq("user_id", idA).select("user_id"); if (!d.error && d.data.length) return "B removeu o criador";
});
await check("update_env_prefs: B (membro) salva categorias e aprendido", async () => {
  const r = await B.rpc("update_env_prefs", {e: envId, p_custom_categories: [{id: "c-teste", name: "Teste", color: "#fff"}], p_learned: {vela: "pet"}});
  if (r.error) return r.error.message;
  const e = await A.from("envs").select("custom_categories, learned").eq("id", envId).single();
  return e.data?.learned?.vela === "pet" && e.data.custom_categories?.[0]?.id === "c-teste" ? true : "A não vê o que B salvou: " + JSON.stringify(e.data).slice(0, 100);
});
await check("update_env_prefs: recusa tipo errado (dados_invalidos)", async () => {
  const r = await B.rpc("update_env_prefs", {e: envId, p_learned: [1, 2]}); return r.error && /dados_invalidos/.test(r.error.message) ? true : "esperava dados_invalidos";
});
await check("Remoção: A remove B e B perde o acesso na hora", async () => {
  const r = await A.from("env_members").update({removed: true}).eq("env_id", envId).eq("user_id", idB).select("removed"); if (r.error || !r.data.length) return "remover: " + (r.error?.message || "sem linha");
  const l = await B.from("items").select("id").eq("env_id", envId); const b = bloqueado(l); if (b !== true) return "B ainda lê: " + b;
  const j = await B.rpc("join_env", {token}); return j.error && /removido/.test(j.error.message) ? true : "join_env devia dizer removido";
});

// ---- limpeza ----
if (canal) await B.removeChannel(canal);
await check("Limpeza: A apaga o ambiente de teste (cascata)", async () => { const r = await A.from("envs").delete().eq("id", envId).select("id"); return r.error || !r.data.length ? (r.error?.message || "sem linha") : true; });
await A.auth.signOut(); await B.auth.signOut();

const falhas = results.filter(r => !r[1]);
console.log(`\n${results.length - falhas.length}/${results.length} PASS` + (falhas.length ? `, ${falhas.length} FAIL` : ""));
process.exit(falhas.length ? 1 : 0);
