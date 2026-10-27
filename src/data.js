/* Camada do Supabase: cliente, conversão camelCase <-> snake_case (só aqui), leitura, escritas,
   Realtime e presença. Não mexe no estado da tela: quem chama (dados.js, ambientes.js) aplica o resultado. */
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
/* sem configuração (ex.: build sem .env), o app continua no modo local */
export const enabled = !!(URL && KEY);
export const sb = enabled ? createClient(URL, KEY) : null;

/* ---------------- conversão de campos ---------------- */
const ms = t => t ? new Date(t).getTime() : 0;
const isoOpt = n => n ? new Date(n).toISOString() : undefined;   // undefined = deixa o banco preencher
const isoNull = n => n ? new Date(n).toISOString() : null;

export const fromList = r => ({title: r.title, done: r.done, catOrder: r.cat_order || [], dismissed: r.dismissed || [], createdAt: ms(r.created_at)});
export const fromItem = r => ({listId: r.list_id, text: r.text, cat: r.cat, order: r.ord, checked: r.checked, checkedAt: ms(r.checked_at), createdAt: ms(r.created_at), by: r.created_by || null});
export const fromTrip = r => ({listId: r.list_id || null, at: ms(r.at), items: r.items || []});
export const fromMember = r => ({role: r.role, creator: r.creator, removed: r.removed, joinedAt: ms(r.joined_at)});
const FROM = {lists: fromList, items: fromItem, history: fromTrip};

const TABLE = {lists: "lists", items: "items", history: "trips"};
const COLS = {
  lists: {title: ["title"], done: ["done"], catOrder: ["cat_order"], dismissed: ["dismissed"], createdAt: ["created_at", isoOpt]},
  items: {listId: ["list_id"], text: ["text"], cat: ["cat"], order: ["ord"], checked: ["checked"], checkedAt: ["checked_at", isoNull], createdAt: ["created_at", isoOpt], by: ["created_by"]},
  history: {listId: ["list_id"], at: ["at", isoOpt], items: ["items"]},
};
export function toRow(coll, data){
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    const c = COLS[coll][k]; if (!c) continue;
    const val = c[1] ? c[1](v) : v;
    if (val === undefined || (k === "by" && !val)) continue;
    out[c[0]] = val;
  }
  return out;
}
export function convert(coll, row){ return FROM[coll](row); }

/* ---------------- leitura ---------------- */
async function fetchAll(table, env, order){
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").eq("env_id", env).order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
export async function loadEnv(env){
  const [lists, items, trips, members, e] = await Promise.all([
    fetchAll("lists", env, "created_at"), fetchAll("items", env, "created_at"), fetchAll("trips", env, "at"),
    sb.from("env_members").select("*").eq("env_id", env),
    sb.from("envs").select("*").eq("id", env).maybeSingle(),
  ]);
  if (members.error) throw members.error;
  if (e.error) throw e.error;
  if (!e.data) throw Object.assign(new Error("sem_acesso"), {code: "sem_acesso"});
  return {
    lists: lists.map(r => [r.id, fromList(r)]), items: items.map(r => [r.id, fromItem(r)]), history: trips.map(r => [r.id, fromTrip(r)]),
    members: members.data.map(r => [r.user_id, fromMember(r)]), env: e.data,
  };
}

/* ---------------- escrita ---------------- */
async function ok(q){ const { data, error } = await q; if (error) throw error; return data; }
export function writeRow(coll, id, env, data, mode){
  const t = sb.from(TABLE[coll]);
  if (mode === "del") return ok(t.delete().eq("id", id));
  if (mode === "set") return ok(t.upsert({id, env_id: env, ...toRow(coll, data)}));
  return ok(t.update(toRow(coll, data)).eq("id", id));
}
/* atualiza colunas do ambiente; sem linha devolvida = o banco (RLS) não deixou */
export async function updateEnv(env, patch){
  const rows = await ok(sb.from("envs").update(patch).eq("id", env).select("id"));
  if (!rows || !rows.length) throw Object.assign(new Error("sem_permissao"), {code: "sem_permissao"});
}

/* ---------------- ambientes e membros ---------------- */
export async function listEnvs(uid){
  const rows = await ok(sb.from("env_members").select("joined_at, envs(id, name)").eq("user_id", uid).eq("removed", false).order("joined_at"));
  return rows.filter(r => r.envs).map(r => ({id: r.envs.id, name: r.envs.name}));
}
export async function createEnv(name){ return ok(sb.from("envs").insert({name}).select("id, name").single()); }
export async function joinEnv(token){ return ok(sb.rpc("join_env", {token})); }
export function leaveEnv(env, uid){ return ok(sb.from("env_members").delete().eq("env_id", env).eq("user_id", uid)); }
export function setMember(env, uid, body){
  const q = sb.from("env_members");
  return ok(body ? q.update({role: body.role, removed: !!body.removed}).eq("env_id", env).eq("user_id", uid) : q.delete().eq("env_id", env).eq("user_id", uid));
}

/* ---------------- perfis ---------------- */
export async function fetchProfiles(ids){
  const out = {};
  if (!ids || !ids.length) return out;
  const rows = await ok(sb.from("profiles").select("id, name, color").in("id", ids));
  for (const r of rows) out[r.id] = {name: r.name, color: r.color};
  return out;
}

/* ---------------- Realtime: mudanças do ambiente ---------------- */
/* h.change(tabela, payload) a cada evento; h.resync() quando a conexão volta depois de cair */
export function subscribeEnv(env, h){
  let down = false;
  const ch = sb.channel("db:" + env);
  const on = (table, filter) => ch.on("postgres_changes", {event: "*", schema: "public", table, filter}, p => h.change(table, p));
  on("items", "env_id=eq." + env); on("lists", "env_id=eq." + env); on("trips", "env_id=eq." + env);
  on("env_members", "env_id=eq." + env); on("envs", "id=eq." + env);
  ch.subscribe(status => {
    if (status === "SUBSCRIBED") { if (down) { down = false; h.resync(); } }
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") down = true;
  });
  return () => { sb.removeChannel(ch); };
}

/* ---------------- presença: um canal por ambiente ---------------- */
/* mesma interface que o app já usa: presence(obj), onPeers(cb), peers(), close() */
export function openRoom(env, myId){
  const ch = sb.channel("env:" + env, {config: {presence: {key: myId}}});
  const subs = new Set();
  let current = {list: null}, ready = false;
  const peers = () => Object.entries(ch.presenceState()).map(([by, metas]) => {
    const m = metas[metas.length - 1] || {};
    return {by, isMe: by === myId, kind: "viewer", presence: {list: m.list || null}};
  });
  const emit = () => subs.forEach(f => f({peers: peers()}));
  ch.on("presence", {event: "sync"}, emit).subscribe(status => {
    if (status === "SUBSCRIBED") { ready = true; ch.track(current).catch(() => {}); }
    else ready = false;
  });
  return {
    presence: async obj => { current = obj; if (ready) await ch.track(obj); },
    onPeers: cb => { subs.add(cb); },
    peers,
    close: () => { subs.clear(); sb.removeChannel(ch); },
  };
}
