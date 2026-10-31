/* Sugestões: ritmo de compra de cada item e sugestões de quem usa o app. */
import { keyOf, guessCat, allCats } from "./categorias.js";
import { S, $, esc } from "./estado.js";
import { itemsOf, write, onWriteError, newId } from "./dados.js";
import { render, openSheet, closeSheet, toast } from "./ui.js";
import { openProfile } from "./ambientes.js";
import { ICON_PLUS, ICON_CHECK_XL, ICON_BACK } from "./icones.js";

/* ---------------- sugestões: aprende o ritmo de compra de cada item ---------------- */
export const sgHidden = new Set();
export let currentSuggestions = [];
export function logTrip(listId){
  if (S.readonly) return;
  const bought = itemsOf(listId).filter(i => i.checked && (i.text||"").trim());
  if (!bought.length) return;
  const id = newId();
  write("history", id, {listId, at: Date.now(), items: bought.map(i => ({k: keyOf(i.text), text: i.text, cat: i.cat})).filter(x => x.k)}, "set");
}
export function pastTrips(currentListId){
  const trips = [], logged = new Set();
  for (const h of S.history.values()) {
    if (!h || !Array.isArray(h.items)) continue;
    logged.add(h.listId);
    trips.push({at: h.at || 0, items: h.items});
  }
  // listas antigas com itens riscados que nunca foram concluídas também contam como uma compra
  for (const [lid, l] of S.lists) {
    if (lid === currentListId || logged.has(lid)) continue;
    const bought = itemsOf(lid).filter(i => i.checked && (i.text||"").trim());
    if (!bought.length) continue;
    trips.push({at: l.createdAt || 0, items: bought.map(i => ({k: keyOf(i.text), text: i.text, cat: i.cat}))});
  }
  return trips.sort((a, b) => a.at - b.at);
}
/* ritmo em DIAS: um item só é sugerido depois de 3 compras (com pelo menos 3 dias entre elas) e perto do intervalo típico dele */
const DIA = 86400000, MIN_COMPRAS = 3, MIN_GAP = 3, MAX_IDADE = 365, ANTECEDENCIA = 0.85;
export function computeSuggestions(listId, its, list){
  const now = Date.now();
  const trips = pastTrips(listId).filter(t => t.at && now - t.at <= MAX_IDADE * DIA);
  if (trips.length < MIN_COMPRAS) return [];
  const stats = new Map();
  for (const t of trips) {
    const seen = new Set();
    for (const it of t.items) {
      if (!it || !it.k || seen.has(it.k)) continue; seen.add(it.k);
      let st = stats.get(it.k); if (!st) { st = {at: [], text: it.text, cat: it.cat}; stats.set(it.k, st); }
      /* compras com menos de 3 dias de distância contam como uma só */
      if (!st.at.length || t.at - st.at[st.at.length - 1] >= MIN_GAP * DIA) st.at.push(t.at);
      st.text = it.text; st.cat = it.cat;
    }
  }
  const inList = new Set(its.map(i => keyOf(i.text)));
  const dismissed = new Set((list && list.dismissed) || []);
  const out = [];
  for (const [k, st] of stats) {
    if (st.at.length < MIN_COMPRAS || inList.has(k) || dismissed.has(k)) continue;
    const gaps = []; for (let i = 1; i < st.at.length; i++) gaps.push((st.at[i] - st.at[i-1]) / DIA);
    gaps.sort((a, b) => a - b);
    const interval = Math.max(MIN_GAP, Math.round(gaps[Math.floor(gaps.length / 2)]));
    const since = Math.round((now - st.at[st.at.length - 1]) / DIA);
    if (since < interval * ANTECEDENCIA) continue;
    const why = `costuma comprar a cada ~${interval} dias · faz ${since} ${since === 1 ? "dia" : "dias"}${since > interval * 1.15 ? " · atrasado" : ""}`;
    out.push({key: k, text: st.text, cat: allCats().some(c => c.id === st.cat) ? st.cat : (guessCat(st.text) || "outros"), why, score: since / interval + Math.min(st.at.length, 10) / 10});
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 14);
}
export function suggestHTML(listId, its, list){
  currentSuggestions = computeSuggestions(listId, its, list);
  if (!currentSuggestions.length) return "";
  const chips = currentSuggestions.map(sg => `<span class="sg-chip"><button class="sg-add" data-sg="${esc(sg.key)}" aria-label="Adicionar ${esc(sg.text)}">${ICON_PLUS}<span><b>${esc(sg.text)}</b><small>${esc(sg.why)}</small></span></button><button class="sg-x" data-sg-x="${esc(sg.key)}" aria-label="Não preciso de ${esc(sg.text)} desta vez">×</button></span>`).join("");
  return `<div class="suggest"><div class="sg-head"><span class="sg-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>você deve precisar de…</span>${currentSuggestions.length > 1 ? '<button data-act="sg-all">Adicionar todos</button>' : ""}<button data-act="sg-hide">Ocultar</button></div><div class="sg-chips">${chips}</div></div>`;
}

/* ---------------- sugestões de quem usa o app ---------------- */
export const APP_VERSION = "16";
export const FB_KINDS = [["ideia", "Ideia"], ["problema", "Algo deu errado"], ["elogio", "Elogio"]];
export const FB_PH = {ideia: "Ex.: queria poder colocar a quantidade de cada item", problema: "O que aconteceu? O que você esperava que acontecesse?", elogio: "O que você mais gosta no app?"};
export function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
export function lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
/* desligado até o Passo 7, que porta as sugestões para a tabela feedback */
export function canFeedback(){ return false; }
export function showFbPrompt(){ return canFeedback() && !lsGet("fb-prompt") && S.history.size >= 3; }
export function openFeedback(from){
  let kind = "ideia";
  openSheet(`<h4>Enviar sugestão</h4><p class="sub">Conte o que poderia ser melhor. Vai direto para quem cuida do app.</p>
    <div class="fb-kinds">${FB_KINDS.map(([k, l]) => `<button class="fb-kind" data-kind="${k}" aria-pressed="${k === kind}">${l}</button>`).join("")}</div>
    <textarea id="fbText" class="fb-text" rows="5" maxlength="2000" aria-label="Sua sugestão" placeholder="${esc(FB_PH[kind])}"></textarea>
    <div class="confirm"><button class="btn" data-act="cancel">Cancelar</button><button class="btn primary" data-act="send">Enviar</button></div>`, body => {
    setTimeout(() => { try { $("fbText").focus(); } catch(e){} }, 260);
    body.onclick = async e => {
      const k = e.target.closest("[data-kind]");
      if (k) { kind = k.dataset.kind; body.querySelectorAll(".fb-kind").forEach(b => b.setAttribute("aria-pressed", b.dataset.kind === kind)); $("fbText").placeholder = FB_PH[kind]; return; }
      if (e.target.closest('[data-act="cancel"]')) { closeSheet(); return; }
      const send = e.target.closest('[data-act="send"]');
      if (send) {
        const text = $("fbText").value.trim(); if (!text) { $("fbText").focus(); return; }
        send.disabled = true; send.textContent = "Enviando…";
        if (await sendFeedback(kind, text, from)) {
          lsSet("fb-prompt", "sent");
          body.innerHTML = `<div class="finish" style="padding:20px 8px 8px"><div class="ring" style="width:72px;height:72px">${ICON_CHECK_XL}</div><h2>Enviado, <em>obrigado!</em></h2><p>Sua sugestão chegou. Quando ela virar realidade no app, você fica sabendo.</p><div class="finish-actions"><button class="btn" data-act="cancel">Fechar</button></div></div>`;
        } else { send.disabled = false; send.textContent = "Enviar"; }
      }
    };
  });
}
export async function sendFeedback(kind, text, from){
  if (!canFeedback()) { toast(S.mode === "local" ? "No modo local, as sugestões não são enviadas." : "Você não tem permissão para enviar sugestões."); return false; }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ctx = {screen: from || S.view, env: S.envName || "", version: APP_VERSION, device: (navigator.userAgent || "").slice(0, 180), lang: navigator.language || ""};
  try {
    await S.db.doc(`feedback/${S.myId}/msgs/${id}`).set({kind, text, at: Date.now(), ctx});
    await S.db.doc(`feedback/${S.myId}`).set({lastAt: Date.now()});
    return true;
  } catch(e){ toast("Não consegui enviar agora. Tente de novo em instantes."); return false; }
}
export async function loadInbox(){
  const out = [];
  const users = await S.db.collection("feedback").get();
  for (const u of users.docs) {
    const ms = await S.db.collection(`feedback/${u.id}/msgs`).get();
    for (const m of ms.docs) out.push({uid: u.id, id: m.id, ...m.data()});
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}
export function fmtDate(t){ try { return new Date(t).toLocaleDateString("pt-BR", {day:"2-digit", month:"short"}) + " " + new Date(t).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}); } catch(e){ return ""; } }
export function openInbox(){
  let list = [];
  const label = k => (FB_KINDS.find(x => x[0] === k) || [0, "Sugestão"])[1];
  const draw = () => {
    const box = $("inbox"); if (!box) return;
    box.innerHTML = list.length ? list.map(m => {
      const key = esc(m.uid + "|" + m.id);
      const name = (S.profiles[m.uid] && S.profiles[m.uid].name) || (m.uid === S.myId ? "Você" : "Alguém");
      const ctx = m.ctx || {};
      return `<div class="fb-card"><div class="fb-head"><b>${esc(name)}</b><span class="chip${m.kind === "elogio" ? " ghost" : ""}">${esc(label(m.kind))}</span><small>${esc(fmtDate(m.at))}</small></div>
        <p>${esc(m.text)}</p><small class="fb-ctx">${esc([ctx.screen, ctx.env, ctx.version ? "v" + ctx.version : ""].filter(Boolean).join(" · "))}</small>
        ${m.doneAt ? `<div class="fb-done">Feito${m.doneNote ? ": " + esc(m.doneNote) : ""}</div>` : `<div class="fb-act"><input data-note="${key}" placeholder="Nota para a pessoa (opcional)" aria-label="Nota para a pessoa"><button class="mini" data-done="${key}">Marcar como feito</button></div>`}</div>`;
    }).join("") : '<p class="sub">Nenhuma sugestão ainda.</p>';
  };
  openSheet(`<h4>Sugestões recebidas</h4><p class="sub">Só você vê esta lista. Ao marcar como feito, quem sugeriu é avisado no app.</p><div id="inbox" class="mlist"><div class="loading" style="padding:30px 0">Carregando…</div></div><div class="menu" style="margin-top:12px"><button data-act="back">${ICON_BACK}Voltar</button></div>`, async body => {
    body.onclick = async e => {
      if (e.target.closest('[data-act="back"]')) { openProfile(); return; }
      const d = e.target.closest("[data-done]");
      if (d) {
        const [uid, id] = d.dataset.done.split("|");
        const inp = [...body.querySelectorAll("[data-note]")].find(x => x.dataset.note === d.dataset.done);
        const note = inp ? inp.value.trim() : "";
        d.disabled = true;
        try {
          await S.db.doc(`feedback/${uid}/msgs/${id}`).update({doneAt: Date.now(), doneNote: note});
          const m = list.find(x => x.uid === uid && x.id === id); if (m) { m.doneAt = Date.now(); m.doneNote = note; }
          draw(); toast("Marcada como feita. A pessoa vai ser avisada.");
        } catch(err){ d.disabled = false; onWriteError(err); }
      }
    };
    try {
      list = await loadInbox();
      S.fbUnread = 0; lsSet("fb-seen", String(Date.now())); render();
      draw();
      const ids = [...new Set(list.map(x => x.uid))].filter(id => !S.profiles[id]);
      if (ids.length && S.userApi && S.userApi.profiles) S.userApi.profiles(ids).then(ps => { Object.assign(S.profiles, ps || {}); draw(); }).catch(()=>{});
    } catch(e){ const box = $("inbox"); if (box) box.innerHTML = '<p class="sub">Não consegui carregar agora. Tente de novo.</p>'; }
  });
}
export async function afterBootFeedback(){
  if (S.mode !== "remote" || !S.myId) return;
  // dono: conta sugestões novas para o pontinho no avatar
  if (S.isOwner) {
    try { const seen = +(lsGet("fb-seen") || 0); const all = await loadInbox(); S.fbUnread = all.filter(m => (m.at || 0) > seen && m.uid !== S.myId).length; render(); } catch(e){}
  }
  // quem sugeriu: avisa uma vez quando a sugestão foi feita
  try {
    const mine = await S.db.collection(`feedback/${S.myId}/msgs`).get();
    const done = mine.docs.map(d => ({id: d.id, ...d.data()})).filter(m => m.doneAt && !lsGet("fb-done-" + m.id));
    if (!done.length) return;
    const m = done.sort((a, b) => b.doneAt - a.doneAt)[0];
    setTimeout(() => {
      if (!$("sheet").hidden) return;
      done.forEach(x => lsSet("fb-done-" + x.id, "1"));
      openSheet(`<div class="finish" style="padding:16px 4px 4px"><div class="ring" style="width:72px;height:72px">${ICON_CHECK_XL}</div><h2>Você sugeriu, <em>nós fizemos.</em></h2></div>
        <p class="fb-quote">${esc(m.text)}</p>${m.doneNote ? `<p class="sub">${esc(m.doneNote)}</p>` : ""}${done.length > 1 ? `<p class="sub">E mais ${done.length - 1} sugest${done.length - 1 > 1 ? "ões" : "ão"} sua${done.length - 1 > 1 ? "s" : ""} também saíram do papel.</p>` : ""}
        <div class="confirm"><button class="btn primary" data-act="close">Legal!</button></div>`, body => { body.onclick = e => { if (e.target.closest('[data-act="close"]')) closeSheet(); }; });
    }, 1500);
  } catch(e){}
}
