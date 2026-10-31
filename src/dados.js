/* Camada de dados usada pela tela: escrita otimista (atualiza o estado na hora) e, no modo remoto,
   envio ao Supabase pelo src/data.js. A confirmação chega pelo Realtime (ver ambientes.js). */
import { S } from "./estado.js";
import { render, toast } from "./ui.js";
import { lsKey, resyncEnv } from "./ambientes.js";
import * as D from "./data.js";
import { rede, isNetErr, redeCaiu, redeOk, atualizarSelo } from "./rede.js";
import { startRemote } from "./ambientes.js";
import * as C from "./cache.js";

export function itemsOf(listId){ const out=[]; for (const [id,it] of S.items) if (it.listId === listId) out.push({id, ...it}); return out; }

/* ---------------- persistência local (modo local) ---------------- */
export const LS_KEY = "lista-feira-local-v1";
export function saveLocal(){
  try { localStorage.setItem(lsKey(), JSON.stringify({lists:[...S.lists], items:[...S.items], customCats:S.customCats, catOverrides:S.catOverrides, learned:S.learned, history:[...S.history]})); } catch(e){}
}
export function loadLocal(){
  try {
    const raw = localStorage.getItem(lsKey()); if (!raw) return;
    const d = JSON.parse(raw);
    S.lists = new Map(d.lists||[]); S.items = new Map(d.items||[]); S.customCats = d.customCats||[]; S.catOverrides = d.catOverrides||{}; S.learned = d.learned||{}; S.history = new Map(d.history||[]);
  } catch(e){}
}
export const queues = new Map();
export function enqueue(path, fn){
  const prev = queues.get(path) || Promise.resolve();
  const p = prev.catch(()=>{}).then(fn);
  queues.set(path, p);
  p.finally(() => { if (queues.get(path) === p) queues.delete(path); }).catch(()=>{});
  return p;
}
/* o id nasce no aparelho (uuid), então o eco do Realtime é reconhecido pelo mesmo id */
export function newId(){
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function apply(coll, id, data, mode){
  const m = coll === "lists" ? S.lists : coll === "history" ? S.history : S.items;
  if (mode === "del") m.delete(id);
  else if (mode === "set") m.set(id, {...data});
  else m.set(id, {...(m.get(id)||{}), ...data});
}

/* ---------------- fila offline (modo remoto) ----------------
   Toda escrita entra numa fila guardada no aparelho e só sai dela quando o servidor confirma. Sem rede, a fila espera
   (tentativas com espera crescente, e de novo ao voltar a rede ou ao reabrir o app); fechar o app não perde nada.
   As operações são idempotentes (id nasce no aparelho; "set" é upsert), então reenviar não duplica. */
const OB_KEY = () => "lista-fila-v1:" + (S.myId || "");
let outbox = null;
function obLoad(){
  if (outbox) return outbox;
  try { outbox = (JSON.parse(localStorage.getItem(OB_KEY()) || "[]") || []).map(o => ({...o, inflight: false})); } catch(e){ outbox = []; }
  return outbox;
}
function obSave(){ try { localStorage.setItem(OB_KEY(), JSON.stringify(outbox)); } catch(e){} }
export function isPending(coll, id){ return obLoad().some(o => o.coll === coll && o.id === id); }

/* junta operações do mesmo registro que ainda não saíram: edição sobre criação/edição vira uma só; apagar o que nunca foi enviado some */
function obPush(op){
  const q = obLoad();
  const prev = [...q].reverse().find(o => o.coll === op.coll && o.id === op.id && o.env === op.env);
  if (prev && !prev.inflight) {
    if ((op.mode === "patch" || op.mode === "prefs" || op.mode === "name") && (prev.mode === "set" || prev.mode === op.mode)) { prev.data = {...prev.data, ...op.data}; obSave(); return; }
    if (op.mode === "del" && prev.mode === "set") { q.splice(q.indexOf(prev), 1); obSave(); return; }
  }
  q.push(op); obSave();
}

let flushing = false, redo = false, backoff = 0, retryT = null;
export async function flushFila(){
  if (S.mode !== "remote") return;
  if (flushing) { redo = true; return; }
  flushing = true; clearTimeout(retryT);
  try {
    do {
      redo = false;
      const q = obLoad();
      while (q.length) {
        const op = q[0]; op.inflight = true;
        try { await runOp(op); }
        catch(e){
          op.inflight = false;
          if (isNetErr(e)) { redeCaiu(); backoff = Math.min(backoff ? backoff * 2 : 2000, 30000); retryT = setTimeout(flushFila, backoff); return; }
          q.shift(); obSave(); rejeitada(op, e); continue;
        }
        q.shift(); obSave(); backoff = 0; redeOk();
      }
    } while (redo);
  } finally { flushing = false; }
}
function runOp(op){
  if (op.mode === "prefs") return D.updateEnvPrefs(op.env, op.data);
  if (op.mode === "name") return D.updateEnv(op.env, {name: op.data.name});
  return D.writeRow(op.coll, op.id, op.env, op.data, op.mode);
}
/* o servidor recusou (permissão, dado inválido...): descarta a operação e volta a tela para o que o banco tem */
function rejeitada(op, e){
  if (e && e.code === "sem_permissao") { if (op.mode === "name") toast("Só quem administra o ambiente pode renomear."); }
  else onWriteError(e);
  resyncEnv();
}
/* depois de carregar do servidor ou do cache, volta a aplicar o que ainda não foi enviado, para não apagar o que o usuário fez */
export function reaplicarFila(env){
  for (const o of obLoad()) {
    if (o.env !== env) continue;
    if (o.mode === "prefs") {
      if (o.data.custom_categories) S.customCats = o.data.custom_categories;
      if (o.data.category_overrides) S.catOverrides = o.data.category_overrides;
      if (o.data.learned) S.learned = o.data.learned;
    } else if (o.mode === "name") S.envName = o.data.name;
    else apply(o.coll, o.id, o.data, o.mode);
  }
}

export function write(coll, id, data, mode, opts){
  if (S.readonly) return Promise.resolve();
  apply(coll, id, data, mode);
  render();
  if (S.mode !== "remote") { saveLocal(); return Promise.resolve(); }
  cacheSoon();
  if (opts && opts.localOnly) return Promise.resolve();      // o banco apaga em cascata
  obPush({coll, id, env: S.env, data: mode === "del" ? null : {...data}, mode});
  return flushFila();
}

/* colunas do ambiente (categorias e o que o app aprendeu); só admin pode gravar (RLS) */
export function writeEnvConfig(patch){
  cacheSoon();
  obPush({coll: "envs", id: S.env, env: S.env, data: {...patch}, mode: "prefs"});
  return flushFila();
}
export function writeEnvName(name){
  cacheSoon();
  obPush({coll: "envname", id: S.env, env: S.env, data: {name}, mode: "name"});
  return flushFila();
}

/* falta de conexão não é erro: a fila cuida e o selo "offline" avisa. Só recusa do servidor vira aviso */
export function onWriteError(e){
  if (isNetErr(e)) { redeCaiu(); return; }
  const code = e && e.code;
  if (code === "42501" || code === "sem_acesso") toast("Não deu para salvar essa alteração. Talvez você não tenha mais acesso a este ambiente.");
  else toast("Não deu para salvar essa alteração.");
  if (S.mode === "remote") resyncEnv();     // volta a tela para o que o banco tem
}

/* ---------------- cache local do ambiente (abre sem rede) ---------------- */
export function salvarCache(){
  if (S.mode !== "remote" || !S.env || !S.myId || !S.loaded.lists) return;
  C.gravar(S.myId, S.env, {lists: [...S.lists], items: [...S.items], history: [...S.history], members: [...(S.members || [])], profiles: S.profiles,
    customCats: S.customCats, catOverrides: S.catOverrides, learned: S.learned, envName: S.envName, envBy: S.envBy, inviteToken: S.inviteToken, envCreatedAt: S.envCreatedAt});
}
let cacheT = null;
export function cacheSoon(){ clearTimeout(cacheT); cacheT = setTimeout(salvarCache, 300); }
export function carregarCache(env){
  const c = C.ler(S.myId, env); if (!c) return false;
  try {
    S.lists = new Map(c.lists || []); S.items = new Map(c.items || []); S.history = new Map(c.history || []); S.members = new Map(c.members || []); Object.assign(S.profiles, c.profiles || {});
    S.customCats = c.customCats || []; S.catOverrides = c.catOverrides || {}; S.learned = c.learned || {};
    S.envName = c.envName || S.envName; S.envBy = c.envBy || null; S.inviteToken = c.inviteToken || ""; S.envCreatedAt = c.envCreatedAt || 0;
    C.info.fonte = "cache";
    return true;
  } catch(e){ return false; }
}

/* ---------------- reconexão ---------------- */
let foiOffline = false;
export function reconectar(){
  if (S.mode !== "remote") return;
  if (!(foiOffline || rede.down || C.info.fonte === "cache" || obLoad().length)) return;
  foiOffline = false; rede.down = false; atualizarSelo();
  if (!S.bootDone) { startRemote().then(() => flushFila()); return; }      // abriu sem rede e sem cache: termina a abertura agora
  flushFila().then(() => resyncEnv());
}
window.addEventListener("online", reconectar);
window.addEventListener("offline", () => { foiOffline = true; });
document.addEventListener("visibilitychange", () => { if (document.hidden) { clearTimeout(cacheT); salvarCache(); } else reconectar(); });
window.addEventListener("pagehide", () => { clearTimeout(cacheT); salvarCache(); });
