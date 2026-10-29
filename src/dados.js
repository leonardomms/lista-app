/* Camada de dados usada pela tela: escrita otimista (atualiza o estado na hora) e, no modo remoto,
   envio ao Supabase pelo src/data.js. A confirmação chega pelo Realtime (ver ambientes.js). */
import { S } from "./estado.js";
import { render, toast } from "./ui.js";
import { lsKey, resyncEnv } from "./ambientes.js";
import * as D from "./data.js";

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

/* escritas em andamento por registro: enquanto houver, o eco do Realtime desse registro é ignorado */
const pending = new Map();
export function isPending(coll, id){ return (pending.get(coll + "/" + id) || 0) > 0; }

export function write(coll, id, data, mode, opts){
  if (S.readonly) return Promise.resolve();
  const listId = coll === "items" ? ((data && data.listId) || (S.items.get(id) || {}).listId) : null;
  apply(coll, id, data, mode);
  render();
  if (S.mode !== "remote") { saveLocal(); return Promise.resolve(); }
  if (opts && opts.localOnly) return Promise.resolve();      // o banco apaga em cascata
  const env = S.env, key = coll + "/" + id;
  pending.set(key, (pending.get(key) || 0) + 1);
  return enqueue(key, async () => {
    const dep = listId && queues.get("lists/" + listId);      // o item só vai depois da lista existir no banco
    if (dep) await dep.catch(()=>{});
    await D.writeRow(coll, id, env, data, mode);
  }).catch(onWriteError).finally(() => pending.set(key, pending.get(key) - 1));
}

/* colunas do ambiente (categorias e o que o app aprendeu); só admin pode gravar (RLS) */
export function writeEnvConfig(patch, quiet){
  const env = S.env;
  return enqueue("envs/" + env, () => D.updateEnvPrefs(env, patch)).catch(e => {
    if (e && e.code === "sem_permissao") {
      if (!quiet) toast("Só quem administra o ambiente pode mudar as categorias.");
      resyncEnv();
    } else onWriteError(e);
  });
}

export function onWriteError(e){
  const code = e && e.code, msg = String((e && e.message) || "");
  if (code === "42501" || code === "sem_acesso") toast("Não deu para salvar essa alteração. Talvez você não tenha mais acesso a este ambiente.");
  else if (code === "23503" || code === "22P02") toast("Não deu para salvar essa alteração.");
  else if (!code || /fetch|network|timeout/i.test(msg)) toast("Sem conexão no momento. Tente de novo em instantes.");
  else toast("Não deu para salvar essa alteração.");
  if (S.mode === "remote") resyncEnv();     // volta a tela para o que o banco tem
}
