/* Ambientes, convites, membros e perfil. */
import { S, shopping, expanded, $, esc } from "./estado.js";
import { LS_KEY, loadLocal, enqueue, onWriteError } from "./dados.js";
import { render, liMap, secMap, announce, openList, flushAll, updateAddChip, openSheet, closeSheet, watchChange, toast } from "./ui.js";
import { sgHidden, canFeedback, openFeedback, openInbox } from "./sugestoes.js";
import { ICON_COPY, ICON_PEOPLE, ICON_TEAM, ICON_WA, ICON_MAIL, ICON_CHAT, ICON_INBOX, ICON_BACK, ICON_PENCIL_L, ICON_PLUS_L, ICON_KEY, ICON_EXIT } from "./icones.js";

export function openHelp(){
  if (!S.env) return;
  const name = envName(S.env);
  const link = APP_LINK + "#e-" + S.env;
  const msg = `Oi! Vamos fazer as compras juntos na lista “${name}”. Toque no link para entrar: ${link}`;
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
    <p class="muted"><b>É a primeira vez da pessoa no app?</b> Antes, dê acesso a ela no botão Compartilhar do Claude: convite pelo e-mail com permissão de Editor. Sem isso, o link não abre para ela.</p>
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
export const APP_LINK = "https://claude.ai/artifact/6qNZiL5496jibdDQB33vsQ";
export const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode(){ const a = new Uint32Array(12); crypto.getRandomValues(a); let c = ""; for (const n of a) c += CODE_ABC[n % CODE_ABC.length]; return c; }
export function fmtCode(c){ return String(c||"").replace(/(.{4})(?=.)/g, "$1-"); }
export function cleanCode(v){ v = String(v||""); const m = /#e-([A-Za-z0-9-]+)/.exec(v); if (m) v = m[1]; return v.toUpperCase().replace(/[^A-Z0-9]/g, ""); }
export function envPath(rest){ return "envs/" + S.env + "/" + rest; }
export function lsKey(){ return P.envs.length && S.env === P.envs[0].id ? LS_KEY : LS_KEY + ":" + S.env; }
export let unsubs = [];
export const P = {envs: [], current: null};     // ambientes que esta pessoa conhece (perfil privado)
export const PROFILE_LS = "lista-feira-perfil-v1";
export function profileRef(){ return S.mode === "remote" && S.db && S.myId ? S.db.doc("data/users/" + S.myId + "/profile") : null; }
export async function loadProfile(){
  const ref = profileRef();
  if (ref) {
    try { const snap = await ref.get(); if (snap.exists) { const d = snap.data() || {}; P.envs = Array.isArray(d.envs) ? d.envs : []; P.current = d.current || null; return; } } catch(e){}
  }
  try { const d = JSON.parse(localStorage.getItem(PROFILE_LS) || "null"); if (d) { P.envs = d.envs || []; P.current = d.current || null; } } catch(e){}
}
export function saveProfile(){
  const body = {envs: P.envs.map(e => ({id: e.id, name: e.name})), current: P.current};
  try { localStorage.setItem(PROFILE_LS, JSON.stringify(body)); } catch(e){}
  const ref = profileRef();
  if (ref) enqueue(ref.path, () => ref.set(body)).catch(()=>{});
}
export function envName(id){
  if (!id) return "";
  if (id === S.env && S.envName) return S.envName;
  const e = P.envs.find(x => x.id === id); return (e && e.name) || "Ambiente";
}
export async function createEnv(name){
  name = (name||"").trim() || "Minha casa";
  const id = newCode();
  if (S.mode === "remote") {
    try {
      await S.db.doc("envs/" + id + "/meta/info").set({name, createdAt: Date.now(), by: S.myId || null});
      if (S.myId) await S.db.doc("envs/" + id + "/members/" + S.myId).set({role: "admin", creator: true, joinedAt: Date.now()});
    }
    catch(e){ onWriteError(e); return null; }
  }
  P.envs = P.envs.concat({id, name}); saveProfile();
  return id;
}
export async function joinEnv(code){
  const id = cleanCode(code);
  if (id.length < 8) { toast("Link de convite inválido. Confira e tente de novo."); return false; }
  if (P.envs.some(e => e.id === id)) { switchEnv(id); toast(`Agora em “${envName(id)}”`); return true; }
  let name = "Ambiente compartilhado";
  if (S.mode === "remote") {
    try {
      const snap = await S.db.doc("envs/" + id + "/meta/info").get();
      if (!snap.exists) { toast("Não encontrei esse ambiente. Confira o link do convite."); return false; }
      name = (snap.data() || {}).name || name;
      if (S.myId) {
        const mref = S.db.doc("envs/" + id + "/members/" + S.myId);
        const m = await mref.get();
        if (m.exists && (m.data() || {}).removed) { toast(`Você foi removido de “${name}”. Peça para quem administra readmitir você.`); return false; }
        if (!m.exists) await mref.set({role: "member", joinedAt: Date.now()});
      }
    } catch(e){ toast("Não consegui abrir o convite agora. Tente de novo."); return false; }
  }
  P.envs = P.envs.concat({id, name}); saveProfile();
  switchEnv(id); toast(`Você entrou em “${name}”`);
  return true;
}
export function renameEnv(name){
  name = (name||"").trim(); if (!name || !S.env) return;
  S.envName = name;
  P.envs = P.envs.map(e => e.id === S.env ? {...e, name} : e); saveProfile();
  if (S.mode === "remote") {
    const ref = S.db.doc(envPath("meta/info"));
    const body = {name, createdAt: S.envCreatedAt || Date.now(), by: S.envBy || null};
    enqueue(ref.path, () => ref.set(body)).catch(onWriteError);
  }
  render();
}
export function leaveEnv(id){
  if (P.envs.length <= 1) return;
  if (S.mode === "remote" && S.myId) { const r = S.db.doc("envs/" + id + "/members/" + S.myId); enqueue(r.path, () => r.delete()).catch(()=>{}); }
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
  S.envName = (P.envs.find(e => e.id === id) || {}).name || ""; S.envCreatedAt = 0; S.envBy = null;
  shopping.clear(); expanded.clear(); sgHidden.clear();
  if (S.mode === "remote") subscribeEnv(); else { loadLocal(); S.loaded = {lists:true, items:true}; }
  try { history.replaceState(null, "", "#"); } catch(e){}
  render(); announce(); window.scrollTo(0,0);
}
export function subscribeEnv(){
  unsubs.forEach(u => { try { u(); } catch(e){} }); unsubs = [];
  S.loaded = {lists:false, items:false};
  const db = S.db, env = S.env;
  const live = fn => (...a) => { if (S.env === env) fn(...a); };
  const onErr = e => { if (e && e.code === "revoked") { S.readonly = true; render(); } };
  unsubs.push(db.collection(envPath("lists")).onSnapshot(live(snap => {
    S.lists = new Map(snap.docs.map(d => [d.id, {...d.data()}]));
    const first = !S.loaded.lists; S.loaded.lists = true;
    if (first) routeFromHash();
    render();
  }), onErr));
  unsubs.push(db.collection(envPath("items")).onSnapshot(live(snap => {
    if (S.loaded.items) { try { for (const ch of snap.docChanges()) watchChange(ch); } catch(e){} }
    S.items = new Map(snap.docs.map(d => [d.id, {...d.data()}]));
    S.loaded.items = true; render();
  }), onErr));
  unsubs.push(db.collection(envPath("history")).onSnapshot(live(snap => {
    S.history = new Map(snap.docs.map(d => [d.id, {...d.data()}]));
    render();
  }), onErr));
  unsubs.push(db.doc(envPath("config/learned")).onSnapshot(live(snap => {
    const d = snap.exists ? snap.data() : null;
    S.learned = d && d.map && typeof d.map === "object" ? d.map : {};
    updateAddChip();
  }), onErr));
  unsubs.push(db.doc(envPath("config/categories")).onSnapshot(live(snap => {
    const d = snap.exists ? snap.data() : null;
    S.customCats = d && Array.isArray(d.list) ? d.list : [];
    S.catOverrides = d && d.overrides && typeof d.overrides === "object" ? d.overrides : {};
    render();
  }), onErr));
  S.members = new Map(); S.membersLoaded = false; S.metaLoaded = false; S.memberChecked = false;
  unsubs.push(db.collection(envPath("members")).onSnapshot(live(snap => {
    S.members = new Map(snap.docs.map(d => [d.id, {...d.data()}]));
    S.membersLoaded = true; ensureMember();
    if (S._drawMembers && $("mList")) S._drawMembers();
  }), onErr));
  unsubs.push(db.doc(envPath("meta/info")).onSnapshot(live(snap => {
    const d = snap.exists ? snap.data() : null;
    if (d) {
      S.envName = d.name || S.envName; S.envCreatedAt = d.createdAt || 0; S.envBy = d.by || null;
      const e = P.envs.find(x => x.id === env);
      if (e && d.name && e.name !== d.name) { e.name = d.name; saveProfile(); }
    }
    S.metaLoaded = true; ensureMember();
    render();
  }), onErr));
}
// move as listas da versão antiga (sem ambientes) para o primeiro ambiente do dono
export async function migrateLegacy(db, envId){
  for (const c of ["lists", "items", "history"]) {
    let snap; try { snap = await db.collection(c).get(); } catch(e){ continue; }
    for (const d of snap.docs) {
      try { await db.collection("envs/" + envId + "/" + c).doc(d.id).set({...d.data()}); await db.collection(c).doc(d.id).delete(); } catch(e){}
    }
  }
  for (const k of ["categories", "learned"]) {
    try { const sn = await db.doc("config/" + k).get(); if (sn.exists) { await db.doc("envs/" + envId + "/config/" + k).set({...sn.data()}); await db.doc("config/" + k).delete(); } } catch(e){}
  }
}

/* ---------------- membros ---------------- */
export function isAdmin(){ if (S.mode !== "remote") return true; const m = S.members && S.members.get(S.myId); return !!(m && m.role === "admin" && !m.removed); }
export function activeMembers(){ return [...(S.members || new Map())].filter(([, m]) => !m.removed); }
export function ensureMember(){
  if (S.mode !== "remote" || !S.myId || !S.membersLoaded || !S.metaLoaded) return;
  const mine = S.members.get(S.myId);
  if (mine && mine.removed) { kickedOut(S.env); return; }
  if (mine || S.memberChecked || S.readonly) return;
  S.memberChecked = true;
  const creator = S.envBy === S.myId;
  const body = {role: (creator || !S.members.size) ? "admin" : "member", joinedAt: Date.now()};
  if (creator) body.creator = true;
  const ref = S.db.doc(envPath("members/" + S.myId));
  enqueue(ref.path, () => ref.set(body)).catch(()=>{});
}
export function kickedOut(id){
  const nm = envName(id);
  P.envs = P.envs.filter(e => e.id !== id);
  if (P.envs.length) switchEnv(P.envs[0].id);
  else { unsubs.forEach(u => { try { u(); } catch(e){} }); unsubs = []; S.env = null; P.current = null; saveProfile(); S.view = "home"; render(); }
  toast(`Você foi removido de “${nm}”`);
}
export function setMember(uid, body){
  if (S.mode !== "remote") return;
  if (body) S.members.set(uid, body); else S.members.delete(uid);
  if (S._drawMembers && $("mList")) S._drawMembers();
  const ref = S.db.doc(envPath("members/" + uid));
  enqueue(ref.path, () => body ? ref.set(body) : ref.delete()).catch(onWriteError);
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
  openSheet(`<h4>Membros de “${esc(envName(S.env))}”</h4><p class="sub">${admin ? "Como administrador, você pode tornar alguém admin ou remover a pessoa do ambiente." : "Só administradores podem gerenciar membros."}</p>
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
      if (e.target.closest('[data-act="back"]')) openProfile();
    };
  });
}

/* ---------------- perfil ---------------- */
export function openProfile(view){
  const cur = S.env;
  if (view === "rename" || view === "new" || view === "code") {
    const cfg = {
      rename: {t:"Renomear ambiente", sub:"", ph:"Ex.: Casa da mãe", v:envName(cur), btn:"Salvar"},
      new: {t:"Novo ambiente", sub:"Cada ambiente tem listas, categorias e sugestões próprias.", ph:"Ex.: Casa da mãe", v:"", btn:"Criar"},
      code: {t:"Entrar com link de convite", sub:"Cole aqui o link que você recebeu.", ph:"https://claude.ai/artifact/…", v:"", btn:"Entrar"}
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
  const rows = P.envs.map(e => `<button class="env-row" data-env="${esc(e.id)}" aria-pressed="${e.id === cur}"><span class="env-dot"></span><span class="env-name">${esc(envName(e.id))}</span>${e.id === cur ? "<small>atual</small>" : ""}</button>`).join("");
  openSheet(`<div class="prof-head"><span class="av-lg" style="--c:${esc(S.meColor || "#ff6b1a")}">${esc(ini)}</span><div><b>${esc(S.meName || (S.mode === "local" ? "Modo local" : "Você"))}</b><small>${cur ? "em " + esc(envName(cur)) : "sem ambiente"}</small></div></div>
    ${rows ? `<p class="sub sect">ambientes</p><div class="env-list">${rows}</div>` : ""}
    <div class="menu">
      ${S.readonly || !cur ? "" : `<button data-act="invite">${ICON_PEOPLE}Convidar para “${esc(envName(cur))}”</button>
      <button data-act="members">${ICON_TEAM}Membros${S.mode === "remote" ? ` (${activeMembers().length})` : ""}</button>
      ${isAdmin() ? `<button data-act="rename">${ICON_PENCIL_L}Renomear este ambiente</button>` : ""}`}
      ${S.readonly ? "" : `<button data-act="new">${ICON_PLUS_L}Novo ambiente</button>`}
      <button data-act="code">${ICON_KEY}Entrar com link de convite</button>
      ${canFeedback() ? `<button data-act="feedback">${ICON_CHAT}Enviar sugestão</button>` : ""}
      ${S.isOwner && S.mode === "remote" ? `<button data-act="inbox">${ICON_INBOX}Sugestões recebidas${S.fbUnread ? ` <span class="chip">${S.fbUnread} nova${S.fbUnread > 1 ? "s" : ""}</span>` : ""}</button>` : ""}
      ${P.envs.length > 1 ? `<button class="red" data-act="leave">${ICON_EXIT}Sair de “${esc(envName(cur))}”</button>` : ""}
    </div><div id="leaveBox"></div>`, body => {
    body.onclick = e => {
      const r = e.target.closest("[data-env]");
      if (r) { if (r.dataset.env !== S.env) { switchEnv(r.dataset.env); toast(`Agora em “${envName(r.dataset.env)}”`); } closeSheet(); return; }
      const b = e.target.closest("[data-act]"); if (!b) return;
      const a = b.dataset.act;
      if (a === "invite") { closeSheet(); setTimeout(openHelp, 240); }
      else if (a === "members") openMembers();
      else if (a === "feedback") openFeedback("perfil");
      else if (a === "inbox") openInbox();
      else if (a === "rename" || a === "new" || a === "code") openProfile(a);
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
