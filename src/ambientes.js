/* Ambientes, convites, membros e perfil. */
import { S, shopping, expanded, $, esc } from "./estado.js";
import { LS_KEY, loadLocal, enqueue, onWriteError, isPending, reaplicarFila, carregarCache, salvarCache, cacheSoon, writeEnvName } from "./dados.js";
import * as C from "./cache.js";
import { isNetErr, redeCaiu, redeOk } from "./rede.js";
import * as D from "./data.js";
import { sair } from "./login.js";
import { render, liMap, secMap, announce, openList, flushAll, updateAddChip, openSheet, closeSheet, watchChange, toast, setupRoom, renderPeers } from "./ui.js";
import { sgHidden, canFeedback, openFeedback, openInbox } from "./sugestoes.js";
import { versaoTexto, carregarVersao, otaLinha } from "./versao.js";
import { ICON_COPY, ICON_PEOPLE, ICON_TEAM, ICON_WA, ICON_MAIL, ICON_CHAT, ICON_INBOX, ICON_BACK, ICON_PENCIL_L, ICON_PLUS_L, ICON_KEY, ICON_EXIT } from "./icones.js";

export function openHelp(){
  if (!S.env) return;
  const name = envName(S.env);
  const code = S.mode === "remote" ? S.inviteToken : S.env;
  if (!code) { toast("Ainda carregando o convite. Tente de novo em instantes."); return; }
  const link = APP_LINK ? APP_LINK + "#e-" + code : code;
  const msg = APP_LINK ? `Oi! Vamos fazer as compras juntos na lista “${name}”. Toque no link para entrar: ${link}`
    : `Oi! Vamos fazer as compras juntos na lista “${name}”. No app, abra o perfil, toque em Entrar com link de convite e cole este código: ${link}`;
  const wa = "https://wa.me/?text=" + encodeURIComponent(msg);
  const mail = "mailto:?subject=" + encodeURIComponent(`Convite: lista de compras “${name}”`) + "&body=" + encodeURIComponent(msg);
  openSheet(`<div class="help"><h4>Convidar para “${esc(name)}”</h4>
    <p class="sub">Quem abrir o link entra direto neste ambiente e pode ver e editar as listas dele.</p>
    <div class="share-row">
      <a class="share-btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICON_WA}WhatsApp</a>
      <a class="share-btn" href="${esc(mail)}" target="_blank" rel="noopener">${ICON_MAIL}E-mail</a>
      <button class="share-btn" data-act="copy">${ICON_COPY}Copiar convite</button>
    </div>
    <input id="inviteLink" class="invite-text" readonly value="${esc(link)}" aria-label="Link do convite">
    <p class="muted" style="margin-top:12px">Se o e-mail não abrir, use Copiar convite e cole onde quiser.</p>
    ${S.mode === "remote" ? "" : '<p class="muted"><b>É a primeira vez da pessoa no app?</b> Antes, dê acesso a ela no botão Compartilhar do Claude: convite pelo e-mail com permissão de Editor. Sem isso, o link não abre para ela.</p>'}
    <div class="confirm"><button class="btn" data-act="close">Fechar</button></div></div>`, body => {
    body.onclick = e => {
      if (e.target.closest('[data-act="close"]')) { closeSheet(); return; }
      if (e.target.closest('[data-act="copy"]')) {
        const inp = $("inviteLink");
        const fallback = () => { inp.focus(); inp.select(); toast("Link selecionado. Copie e envie para a pessoa."); };
        try { navigator.clipboard.writeText(msg).then(() => toast("Convite copiado"), fallback); } catch(err){ fallback(); }
      }
    };
  });
}

/* ---------------- ambientes ---------------- */
/* link base dos convites (Passo 5); vazio = o convite é só o código */
export const APP_LINK = import.meta.env.VITE_APP_LINK || "";
export const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode(){ const a = new Uint32Array(12); crypto.getRandomValues(a); let c = ""; for (const n of a) c += CODE_ABC[n % CODE_ABC.length]; return c; }
export function fmtCode(c){ return String(c||"").replace(/(.{4})(?=.)/g, "$1-"); }
export function cleanCode(v){ v = String(v||""); const m = /#e-([A-Za-z0-9-]+)/.exec(v); if (m) v = m[1]; return v.toUpperCase().replace(/[^A-Z0-9]/g, ""); }
/* convite do Supabase: o invite_token (hex), colado como link (#e-… ou /convite/…) ou só o código */
export function cleanToken(v){ v = String(v||""); const m = /(?:#e-|\/convite\/)([A-Za-z0-9]+)/.exec(v) || /([A-Fa-f0-9]{20,})/.exec(v); return m ? m[1].toLowerCase() : ""; }
export function lsKey(){ return P.envs.length && S.env === P.envs[0].id ? LS_KEY : LS_KEY + ":" + S.env; }
export let unsubs = [];
export const P = {envs: [], current: null};     // ambientes que esta pessoa conhece (perfil privado)
export const PROFILE_LS = "lista-feira-perfil-v1";
const profileKey = () => S.mode === "remote" ? PROFILE_LS + ":remoto" : PROFILE_LS;
export async function loadProfile(){
  try { const d = JSON.parse(localStorage.getItem(profileKey()) || "null"); if (d) { if (S.mode !== "remote") P.envs = d.envs || []; P.current = d.current || null; } } catch(e){}
}
export function saveProfile(){
  const body = S.mode === "remote" ? {current: P.current} : {envs: P.envs.map(e => ({id: e.id, name: e.name})), current: P.current};
  try { localStorage.setItem(profileKey(), JSON.stringify(body)); } catch(e){}
}
/* ambientes da pessoa = as linhas dela em env_members */
export async function loadEnvs(){
  const k = C.ENVS_KEY(S.myId);
  try { P.envs = await D.comPrazo(() => D.listEnvs(S.myId)); try { localStorage.setItem(k, JSON.stringify(P.envs)); } catch(e){} redeOk(); }
  catch(e){
    if (!isNetErr(e)) throw e;
    redeCaiu();
    let c = []; try { c = JSON.parse(localStorage.getItem(k) || "[]"); } catch(_){}
    if (!c.length) throw e;
    P.envs = c;      // sem rede: usa a última lista de ambientes conhecida
  }
}
export function envsGuardados(){ try { const c = JSON.parse(localStorage.getItem(C.ENVS_KEY(S.myId)) || "[]"); return Array.isArray(c) ? c : []; } catch(e){ return []; } }
export function envName(id){
  if (!id) return "";
  if (id === S.env && S.envName) return S.envName;
  const e = P.envs.find(x => x.id === id); return (e && e.name) || "Ambiente";
}
export async function createEnv(name){
  name = (name||"").trim() || "Minha casa";
  if (S.mode === "remote") {
    try { const e = await D.createEnv(name); P.envs = P.envs.concat({id: e.id, name: e.name}); return e.id; }
    catch(e){ if (isNetErr(e)) { redeCaiu(); toast("Sem internet. Para criar um ambiente, conecte-se."); } else onWriteError(e); return null; }
  }
  const id = newCode();
  P.envs = P.envs.concat({id, name}); saveProfile();
  return id;
}
export async function joinEnv(code){
  if (S.mode === "remote") return joinRemote(code);
  const id = cleanCode(code);
  if (id.length < 8) { toast("Link de convite inválido. Confira e tente de novo."); return false; }
  if (P.envs.some(e => e.id === id)) { switchEnv(id); toast(`Agora em “${envName(id)}”`); return true; }
  P.envs = P.envs.concat({id, name: "Ambiente compartilhado"}); saveProfile();
  switchEnv(id); toast("Você entrou em “Ambiente compartilhado”");
  return true;
}
async function joinRemote(code){
  const token = cleanToken(code);
  if (token.length < 8) { toast("Link de convite inválido. Confira e tente de novo."); return false; }
  let id;
  try { id = await D.joinEnv(token); }
  catch(e){
    const m = String((e && e.message) || "");
    toast(m.includes("convite_invalido") ? "Não encontrei esse ambiente. Confira o link do convite."
      : m.includes("removido") ? "Você foi removido desse ambiente. Peça para quem administra readmitir você."
      : m.includes("nao_autenticado") ? "Entre na sua conta para usar o convite."
      : "Não consegui abrir o convite agora. Tente de novo.");
    return false;
  }
  const had = P.envs.some(e => e.id === id);
  try { await loadEnvs(); } catch(e){}
  switchEnv(id); toast(had ? `Agora em “${envName(id)}”` : `Você entrou em “${envName(id)}”`);
  return true;
}
export function renameEnv(name){
  name = (name||"").trim(); if (!name || !S.env) return;
  S.envName = name;
  P.envs = P.envs.map(e => e.id === S.env ? {...e, name} : e); saveProfile();
  if (S.mode === "remote") writeEnvName(name);
  render();
}
export function leaveEnv(id){
  if (P.envs.length <= 1) return;
  if (S.mode === "remote" && S.myId) enqueue("members/" + id, () => D.leaveEnv(id, S.myId)).catch(onWriteError);
  P.envs = P.envs.filter(e => e.id !== id);
  if (S.env === id) switchEnv(P.envs[0].id); else saveProfile();
}
export function switchEnv(id){
  if (!id) return;
  if (S.env) flushAll();
  S.env = id; P.current = id; saveProfile();
  S.view = "home"; S.listId = null; S.peek = false; S.search = ""; $("searchInput").value = "";
  liMap.forEach(li => li.remove()); liMap.clear();
  secMap.forEach(sec => { if (sec._sortable) sec._sortable.destroy(); sec.remove(); }); secMap.clear();
  S.lists = new Map(); S.items = new Map(); S.history = new Map(); S.customCats = []; S.catOverrides = {}; S.learned = {};
  S.envName = (P.envs.find(e => e.id === id) || {}).name || ""; S.envCreatedAt = 0; S.envBy = null; S.inviteToken = "";
  closeRoom();
  shopping.clear(); expanded.clear(); sgHidden.clear();
  if (S.mode === "remote") { subscribeEnv(); S.room = D.openRoom(id, S.myId); setupRoom(); }
  else { loadLocal(); S.loaded = {lists:true, items:true}; }
  try { history.replaceState(null, "", "#"); } catch(e){}
  render(); announce(); window.scrollTo(0,0);
}
export function closeRoom(){
  if (S.room && S.room.close) { try { S.room.close(); } catch(e){} }
  S.room = null; S.peers = []; S._refreshPeers = null;
}

/* carrega as listas, itens, histórico, membros e dados do ambiente (e de novo quando preciso ressincronizar) */
let loadSeq = 0, resyncTimer = null;
export async function loadEnvData(first){
  const env = S.env, seq = ++loadSeq;
  let d;
  /* abre na hora com o que está guardado; a rede só atualiza depois, sem piscar */
  if (first && !S.loaded.lists && carregarCache(env)) {
    reaplicarFila(env);
    S.loaded = {lists:true, items:true}; S.membersLoaded = true; S.metaLoaded = true;
    routeFromHash(); render(); updateAddChip();
  }
  try { d = await D.comPrazo(() => D.loadEnv(env), 10000); }
  catch(e){
    if (S.env !== env || seq !== loadSeq) return false;
    if (e && e.code === "sem_acesso") { kickedOut(env); return false; }
    if (isNetErr(e)) {
      redeCaiu();
      /* sem rede: abre com o que ficou guardado no aparelho (e com o que ainda não foi enviado) */
      if (!S.loaded.lists && carregarCache(env)) {
        reaplicarFila(env);
        const firstLists = true;
        S.loaded = {lists:true, items:true}; S.membersLoaded = true; S.metaLoaded = true;
        if (firstLists) routeFromHash();
        render(); updateAddChip();
        return true;
      }
      if (S.loaded.lists) return false;      // já há dados na tela: o selo "offline" basta
    }
    if (first) { toast("Não consegui carregar as listas. Confira a conexão."); setTimeout(() => { if (S.env === env && !S.loaded.lists) loadEnvData(true); }, 4000); }
    return false;
  }
  if (S.env !== env || seq !== loadSeq) return false;
  S.lists = new Map(d.lists); S.items = new Map(d.items); S.history = new Map(d.history); S.members = new Map(d.members);
  applyEnvRow(d.env);
  reaplicarFila(env);      // o que ainda não foi enviado continua na tela
  redeOk(); C.info.fonte = "rede";
  const firstLists = !S.loaded.lists;
  S.loaded = {lists:true, items:true}; S.membersLoaded = true; S.metaLoaded = true;
  fetchMissingProfiles([...S.members.keys()]);
  if (firstLists) routeFromHash();
  ensureMember();
  render(); updateAddChip();
  salvarCache();
  return true;
}
/* volta a tela para o que o banco tem (depois de um erro de escrita ou de a conexão cair) */
export function resyncEnv(){
  if (S.mode !== "remote" || !S.env) return;
  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => loadEnvData(false), 300);
}
function applyEnvRow(r){
  if (!r) return;
  if (r.name) { S.envName = r.name; const e = P.envs.find(x => x.id === S.env); if (e && e.name !== r.name) e.name = r.name; }
  if (r.created_by !== undefined) S.envBy = r.created_by;
  if (r.invite_token !== undefined) S.inviteToken = r.invite_token;
  /* colunas grandes que não mudaram podem não vir no evento: só aplica o que veio */
  if (Array.isArray(r.custom_categories)) S.customCats = r.custom_categories;
  if (r.category_overrides && typeof r.category_overrides === "object") S.catOverrides = r.category_overrides;
  if (r.learned && typeof r.learned === "object") S.learned = r.learned;
}
function fetchMissingProfiles(ids){
  const need = ids.filter(id => !S.profiles[id]);
  if (!need.length) return;
  D.fetchProfiles(need).then(ps => { Object.assign(S.profiles, ps); if (S._drawMembers && $("mList")) S._drawMembers(); renderPeers(); }).catch(()=>{});
}
const sameData = (a, b) => { for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false; return true; };
const COLL = {items: "items", lists: "lists", trips: "history"};

/* um evento do Realtime; ecos do que a própria tela já aplicou são ignorados */
export function applyChange(table, p){
  const row = p.new && Object.keys(p.new).length ? p.new : p.old;
  if (table === "envs") { if (p.eventType === "DELETE") { kickedOut(S.env); return; } applyEnvRow(p.new); render(); updateAddChip(); cacheSoon(); return; }
  if (table === "env_members") {
    const uid = row && row.user_id; if (!uid) return;
    if (p.eventType === "DELETE") S.members.delete(uid); else S.members.set(uid, D.fromMember(p.new));
    fetchMissingProfiles([uid]); ensureMember();
    if (S._drawMembers && $("mList")) S._drawMembers();
    cacheSoon(); return;
  }
  const coll = COLL[table], id = row && row.id; if (!coll || !id) return;
  const map = coll === "lists" ? S.lists : coll === "history" ? S.history : S.items;
  if (p.eventType === "DELETE") {
    if (!map.has(id) || isPending(coll, id)) return;
    map.delete(id); if (coll === "items") watchChange({type: "removed", doc: {id, data: () => ({})}});
    render(); cacheSoon(); return;
  }
  if (isPending(coll, id)) return;
  const next = D.convert(coll, p.new), cur = map.get(id);
  if (cur && sameData(cur, next)) return;
  if (coll === "items" && S.loaded.items) { try { watchChange({type: cur ? "modified" : "added", doc: {id, data: () => next}}); } catch(e){} }
  map.set(id, next); render(); cacheSoon();
}

export function subscribeEnv(){
  unsubs.forEach(u => { try { u(); } catch(e){} }); unsubs = [];
  S.loaded = {lists:false, items:false};
  S.members = new Map(); S.membersLoaded = false; S.metaLoaded = false;
  const env = S.env;
  let ready = false; const queued = [];
  /* assina antes de carregar e guarda os eventos até a carga inicial terminar, para não perder nenhum */
  unsubs.push(D.subscribeEnv(env, {
    change: (table, p) => { if (S.env !== env) return; if (ready) applyChange(table, p); else queued.push([table, p]); },
    resync: () => { if (S.env === env) loadEnvData(false); },
  }));
  loadEnvData(true).then(() => { ready = true; queued.splice(0).forEach(([t, p]) => { if (S.env === env) applyChange(t, p); }); });
}

/* ---------------- membros ---------------- */
export function isAdmin(){ if (S.mode !== "remote") return true; const m = S.members && S.members.get(S.myId); return !!(m && m.role === "admin" && !m.removed); }
export function activeMembers(){ return [...(S.members || new Map())].filter(([, m]) => !m.removed); }
export function ensureMember(){
  if (S.mode !== "remote" || !S.myId || !S.membersLoaded) return;
  const mine = S.members.get(S.myId);
  if (!mine || mine.removed) kickedOut(S.env);
}
export function kickedOut(id){
  if (S.env !== id) return;
  const nm = envName(id);
  P.envs = P.envs.filter(e => e.id !== id);
  if (P.envs.length) switchEnv(P.envs[0].id);
  else { unsubs.forEach(u => { try { u(); } catch(e){} }); unsubs = []; closeRoom(); S.env = null; P.current = null; saveProfile(); S.view = "home"; render(); }
  toast(`Você foi removido de “${nm}”`);
}
export function setMember(uid, body){
  if (S.mode !== "remote") return;
  if (body) S.members.set(uid, body); else S.members.delete(uid);
  if (S._drawMembers && $("mList")) S._drawMembers();
  const env = S.env;
  enqueue("members/" + env + "/" + uid, () => D.setMember(env, uid, body)).catch(onWriteError);
}
export function openMembers(){
  const admin = isAdmin();
  const nameOf = id => (S.profiles[id] && S.profiles[id].name) || (id === S.myId ? (S.meName || "Você") : "Pessoa convidada");
  const initials = nm => nm.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";
  const rank = m => m.creator ? 0 : m.role === "admin" ? 1 : 2;
  const draw = () => {
    const act = activeMembers().sort((a, b) => rank(a[1]) - rank(b[1]) || (a[1].joinedAt||0) - (b[1].joinedAt||0));
    const removed = [...(S.members || new Map())].filter(([, m]) => m.removed);
    $("mList").innerHTML = act.map(([id, m]) => {
      const nm = nameOf(id), me = id === S.myId;
      const chips = (m.creator ? '<span class="chip">criador</span>' : m.role === "admin" ? '<span class="chip">admin</span>' : '<span class="chip ghost">membro</span>') + (me ? '<span class="chip ghost">você</span>' : "");
      const acts = admin && !m.creator && !me ? `<button class="mini" data-mact="${m.role === "admin" ? "demote" : "promote"}" data-uid="${esc(id)}">${m.role === "admin" ? "Tirar admin" : "Tornar admin"}</button><button class="mini red" data-mact="remove" data-uid="${esc(id)}">Remover</button>` : "";
      return `<div class="mrow"><span class="av-sm" style="--c:${esc((S.profiles[id] || {}).color || (me && S.meColor) || "#ff6b1a")}">${esc(initials(nm))}</span><div class="minfo"><b>${esc(nm)}</b><span>${chips}</span></div>${acts ? `<div class="macts">${acts}</div>` : ""}</div>`;
    }).join("") || (S.mode === "remote" ? '<p class="sub">Ninguém por aqui ainda.</p>' : '<p class="sub">No modo local não há membros.</p>');
    $("mRemoved").innerHTML = admin && removed.length ? '<p class="sub sect" style="margin-top:14px">removidos</p>' + removed.map(([id]) => {
      const nm = nameOf(id);
      return `<div class="mrow"><span class="av-sm" style="--c:var(--faint)">${esc(initials(nm))}</span><div class="minfo"><b>${esc(nm)}</b><span><span class="chip ghost">não entra pelo link</span></span></div><div class="macts"><button class="mini" data-mact="readmit" data-uid="${esc(id)}">Readmitir</button></div></div>`;
    }).join("") : "";
  };
  openSheet(`<h4 class="mem-title">Membros de “${esc(envName(S.env))}”${!S.readonly && S.env && admin ? `<button class="pen" data-act="rename" aria-label="Renomear este ambiente">${ICON_PENCIL_L}</button>` : ""}</h4><p class="sub">${admin ? "Como administrador, você pode tornar alguém admin ou remover a pessoa do ambiente." : "Só administradores podem gerenciar membros."}</p>
    <div id="mList" class="mlist"></div><div id="mRemoved"></div>
    <div class="menu" style="margin-top:12px"><button data-act="invite">${ICON_PEOPLE}Convidar alguém</button><button data-act="back">${ICON_BACK}Voltar</button></div>`, body => {
    S._drawMembers = draw; draw();
    const ids = [...(S.members || new Map()).keys()].filter(id => !S.profiles[id]);
    if (ids.length && S.userApi && S.userApi.profiles) S.userApi.profiles(ids).then(ps => { Object.assign(S.profiles, ps || {}); if ($("mList")) draw(); }).catch(()=>{});
    body.onclick = e => {
      const b = e.target.closest("[data-mact]");
      if (b) {
        const uid = b.dataset.uid, a = b.dataset.mact, cur = S.members.get(uid) || {};
        if (a === "remove" && !b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = "Confirmar"; setTimeout(() => { if (b.isConnected) { b.classList.remove("arm"); b.textContent = "Remover"; } }, 3000); return; }
        if (a === "promote") { setMember(uid, {...cur, role: "admin"}); toast(`${nameOf(uid).split(" ")[0]} agora é admin`); }
        else if (a === "demote") { setMember(uid, {...cur, role: "member"}); toast(`${nameOf(uid).split(" ")[0]} não é mais admin`); }
        else if (a === "remove") { setMember(uid, {...cur, role: "member", removed: true, removedAt: Date.now()}); toast(`${nameOf(uid).split(" ")[0]} foi removido do ambiente`); }
        else if (a === "readmit") { setMember(uid, null); toast("Readmitido: a pessoa pode entrar de novo pelo link"); }
        return;
      }
      if (e.target.closest('[data-act="invite"]')) { closeSheet(); setTimeout(openHelp, 240); }
      if (e.target.closest('[data-act="rename"]')) { openProfile("rename"); return; }
      if (e.target.closest('[data-act="back"]')) openProfile();
    };
  });
}

/* ---------------- perfil ---------------- */
export function openProfile(view){
  const cur = S.env;
  if (view === "newchoice") {
    openSheet(`<h4>Novo ambiente</h4><div class="menu plain" style="margin-top:8px">${S.readonly ? "" : '<button data-act="new">Criar novo</button>'}<button data-act="code">Entrar com código de convite</button><button class="quiet" data-act="back">Voltar</button></div>`, body => {
      body.onclick = e => { const b = e.target.closest("[data-act]"); if (!b) return; if (b.dataset.act === "back") openProfile(); else openProfile(b.dataset.act); };
    });
    return;
  }
  if (view === "rename" || view === "new" || view === "code") {
    const cfg = {
      rename: {t:"Renomear ambiente", sub:"", ph:"Ex.: Casa da mãe", v:envName(cur), btn:"Salvar"},
      new: {t:"Novo ambiente", sub:"Cada ambiente tem listas, categorias e sugestões próprias.", ph:"Ex.: Casa da mãe", v:"", btn:"Criar"},
      code: {t:"Entrar com código de convite", sub:"Cole aqui o link ou o código que você recebeu.", ph:"Link ou código do convite", v:"", btn:"Entrar"}
    }[view];
    openSheet(`<h4>${cfg.t}</h4>${cfg.sub ? `<p class="sub">${cfg.sub}</p>` : ""}
      <form class="newcat" data-form="envf" style="margin-top:12px"><input id="envField" placeholder="${cfg.ph}" value="${esc(cfg.v)}" autocomplete="off" maxlength="${view === "code" ? 400 : 40}" aria-label="${cfg.t}"><button class="btn primary" type="submit">${cfg.btn}</button></form>
      <div class="menu"><button data-act="back">${ICON_BACK}Voltar</button></div>`, body => {
      const f = $("envField"); setTimeout(() => { try { f.focus(); } catch(e){} }, 260);
      body.onclick = e => { if (e.target.closest('[data-act="back"]')) openProfile(); };
      body.querySelector('[data-form="envf"]').onsubmit = async e => {
        e.preventDefault(); const v = f.value;
        if (view === "rename") { renameEnv(v); closeSheet(); toast("Ambiente renomeado"); }
        else if (view === "new") { const id = await createEnv(v); if (id) { switchEnv(id); closeSheet(); toast(`Ambiente “${envName(id)}” criado`); } }
        else if (await joinEnv(v)) closeSheet();
      };
    });
    return;
  }
  const ini = (S.meName||"").trim().split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";
  const nMem = S.mode === "remote" ? activeMembers().length : 1;
  const memTxt = nMem === 1 ? "1 membro" : nMem + " membros";
  const dot = `<span class="env-dot on"></span>`;
  const multi = P.envs.length > 1;
  const envHead = cur ? `<div class="envline">${multi
      ? `<button class="env-pick" data-act="env-toggle" aria-expanded="false">${dot}<span class="env-name">${esc(envName(cur))}</span><svg class="env-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>`
      : `<span class="env-pick static">${dot}<span class="env-name">${esc(envName(cur))}</span></span>`}
    <button class="env-mem" data-act="members">${memTxt}</button></div>
    ${multi ? `<div class="env-sel" id="envSel" hidden>${P.envs.map(e => `<button class="env-opt" data-env="${esc(e.id)}" aria-pressed="${e.id === cur}"><span class="env-name">${esc(envName(e.id))}</span>${e.id === cur ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>' : ""}</button>`).join("")}</div>` : ""}` : "";
  const foto = S.photoFailed ? "" : (S.mePhotoData || S.mePhoto || "");
  openSheet(`<div class="prof-head"><span class="av-lg" style="--c:${esc(S.meColor || "#ff6b1a")}">${esc(ini)}${foto ? `<img class="av-img" src="${esc(foto)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span><div><b>${esc(S.meName || (S.mode === "local" ? "Modo local" : "Você"))}</b>${S.meEmail ? `<small class="prof-mail">${esc(S.meEmail)}</small>` : ""}</div></div>
    ${envHead}
    <div class="menu plain">
      ${S.readonly || !cur ? "" : `<button data-act="invite">Convidar para “${esc(envName(cur))}”</button>`}
      <button data-act="newchoice">Novo ambiente</button>
      ${canFeedback() ? `<button data-act="feedback">Enviar sugestão</button>` : ""}
      ${S.isOwner && S.mode === "remote" ? `<button data-act="inbox">Sugestões recebidas${S.fbUnread ? ` <span class="chip">${S.fbUnread} nova${S.fbUnread > 1 ? "s" : ""}</span>` : ""}</button>` : ""}
      ${multi ? `<button class="red" data-act="leave">Sair de “${esc(envName(cur))}”</button>` : ""}
      ${S.mode === "remote" ? `<button class="quiet" data-act="logout">Sair da conta</button>` : ""}
    </div><div id="leaveBox"></div><p class="app-version" id="appVersion">${esc(versaoTexto)}</p>
    <div id="diagBox" hidden><p class="app-version" style="margin-top:4px">${esc(otaLinha())}</p><p class="app-version" style="margin-top:4px">${esc(D.diagLinha())}</p><p class="app-version" style="margin-top:4px">${esc(C.textoDiag())}</p></div>`, body => {
    carregarVersao().then(t => { const el = $("appVersion"); if (el) el.textContent = t; });
    /* 5 toques na versão em 3 s mostram/escondem o diagnóstico */
    let taps = [];
    $("appVersion").onclick = () => { const n = Date.now(); taps = taps.filter(t => n - t < 3000).concat(n); if (taps.length >= 5) { taps = []; $("diagBox").hidden = !$("diagBox").hidden; } };
    body.onclick = e => {
      const tg = e.target.closest('[data-act="env-toggle"]');
      if (tg) { const sel = $("envSel"); sel.hidden = !sel.hidden; tg.setAttribute("aria-expanded", String(!sel.hidden)); return; }
      const r = e.target.closest("[data-env]");
      if (r) { if (r.dataset.env !== S.env) { switchEnv(r.dataset.env); toast(`Agora em “${envName(r.dataset.env)}”`); } openProfile(); return; }
      const b = e.target.closest("[data-act]"); if (!b) return;
      const a = b.dataset.act;
      if (a === "invite") { closeSheet(); setTimeout(openHelp, 240); }
      else if (a === "members") openMembers();
      else if (a === "feedback") openFeedback("perfil");
      else if (a === "inbox") openInbox();
      else if (a === "rename" || a === "new" || a === "code") openProfile(a);
      else if (a === "newchoice") openProfile("newchoice");
      else if (a === "logout") { closeSheet(); sair(); }
      else if (a === "leave") $("leaveBox").innerHTML = `<p class="sub" style="margin-top:12px">Sair de “${esc(envName(S.env))}”? As listas continuam lá para quem participa. Para voltar, você vai precisar do código.</p><div class="confirm"><button class="btn" data-act="cancel">Cancelar</button><button class="btn danger" data-act="leave-yes">Sair</button></div>`;
      else if (a === "cancel") $("leaveBox").innerHTML = "";
      else if (a === "leave-yes") { const nm = envName(S.env); leaveEnv(S.env); closeSheet(); toast(`Você saiu de “${nm}”`); }
    };
  });
}

/* ---------------- boot ---------------- */
export async function startLocal(){
  S.mode = "local";
  await loadProfile();
  if (!P.envs.length) { P.envs = [{id: newCode(), name: "Minha casa"}]; saveProfile(); }
  const inv = /^#e-([A-Za-z0-9]+)$/.exec(location.hash || "");
  if (inv) await joinEnv(inv[1]);
  if (!S.env) switchEnv(P.current && P.envs.some(e => e.id === P.current) ? P.current : P.envs[0].id);
  S.bootDone = true; routeFromHash(); render();
}
export function routeFromHash(){
  const m = /^#l-(.+)$/.exec(location.hash || "");
  if (m && S.lists.has(m[1])) openList(m[1]);
}

/* modo remoto: há sessão no Supabase. Carrega os ambientes da pessoa e abre o atual. */
export async function startRemote(){
  if (S.booting) return;
  S.booting = true;
  S.mode = "remote";
  await loadProfile();
  /* abre na hora com os ambientes e a lista guardados (a rede só atualiza depois, sem bloquear); convite no link segue o caminho normal */
  const guardados = envsGuardados();
  if (guardados.length && !/^#e-/.test(location.hash || "")) {
    P.envs = guardados;
    switchEnv(P.current && P.envs.some(e => e.id === P.current) ? P.current : P.envs[0].id);
    S.bootDone = true; S.booting = false; render();
    loadEnvs().then(() => {
      if (S.env && !P.envs.some(e => e.id === S.env)) { if (P.envs.length) switchEnv(P.envs[0].id); }
      else render();
    }).catch(() => {});
    return;
  }
  try { await loadEnvs(); }
  catch(e){
    P.envs = [];
    /* sem rede e sem nada guardado (primeiro uso): fica em "Carregando", sem aviso de erro; reconectar() tenta de novo */
    if (isNetErr(e)) { redeCaiu(); S.booting = false; return; }
    toast("Não consegui carregar seus ambientes. Confira a conexão.");
  }
  const inv = /^#e-([A-Za-z0-9]+)$/.exec(location.hash || "");
  if (inv) await joinEnv(inv[1]);
  if (!P.envs.length && !inv) { const id = await createEnv("Minha casa"); if (id) await loadEnvs().catch(()=>{}); }
  if (!S.env && P.envs.length) switchEnv(P.current && P.envs.some(e => e.id === P.current) ? P.current : P.envs[0].id);
  S.bootDone = true; S.booting = false; render();
}
