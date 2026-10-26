/* Camada de dados: hoje grava no localStorage (modo local); no Passo 3 passa a falar com o Supabase. */
import { S } from "./estado.js";
import { render, toast } from "./ui.js";
import { envPath, lsKey } from "./ambientes.js";

export function itemsOf(listId){ const out=[]; for (const [id,it] of S.items) if (it.listId === listId) out.push({id, ...it}); return out; }

/* ---------------- persistência ---------------- */
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
export function newId(){
  if (S.mode === "remote") { try { return S.db.collection("items").doc().id; } catch(e){} }
  return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}
export function apply(coll, id, data, mode){
  const m = coll === "lists" ? S.lists : coll === "history" ? S.history : S.items;
  if (mode === "del") m.delete(id);
  else if (mode === "set") m.set(id, {...data});
  else m.set(id, {...(m.get(id)||{}), ...data});
}
export function write(coll, id, data, mode){
  if (S.readonly) return Promise.resolve();
  apply(coll, id, data, mode);
  render();
  if (S.mode !== "remote") { saveLocal(); return Promise.resolve(); }
  const ref = S.db.collection(envPath(coll)).doc(id);
  return enqueue(coll + "/" + id, () => mode === "del" ? ref.delete() : mode === "set" ? ref.set(data) : ref.update(data))
    .catch(onWriteError);
}

export function onWriteError(e){
  const code = e && e.code;
  if (code === "quota_exceeded") toast("O armazenamento está cheio. Apague listas antigas para liberar espaço.");
  else if (code === "invalid_argument") toast("Não deu para salvar essa alteração. Talvez você só tenha acesso de leitura.");
  else if (code === "revoked") { S.readonly = true; render(); }
  else toast("Sem conexão no momento. Tente de novo em instantes.");
}
