/* Interface: render da tela inicial e da lista, ações, folhas (sheets), toast e eventos. */
import Sortable from "sortablejs";
import { norm, guessCat, splitItems, learn, allCats, catById, sortedCatsFor, addCustomCat, openCatManager } from "./categorias.js";
import { S, shopping, myCreated, pendingBlank, expanded, hold, holdTimers, drafts, draftTimers, $, esc } from "./estado.js";
import { itemsOf, newId, write } from "./dados.js";
import { openHelp, envName, openProfile, openAmbientes } from "./ambientes.js";
import { valoresOn, itemValor, catValor, listaValor, priceSheetHTML, bindPriceSheet } from "./precos.js";
import { sgHidden, currentSuggestions, logTrip, suggestHTML, lsSet, showFbPrompt, openFeedback } from "./sugestoes.js";
import { ICON_GRIP, ICON_CHECK, ICON_MORE, ICON_TRASH, ICON_UNDO, ICON_BROOM, ICON_COPY, ICON_CHECKBIG, ICON_PEOPLE, ICON_TAG, ICON_PLUS, ICON_CHECK_XL, ICON_CHEV, ICON_SPARK, ICON_BASKET, ICON_RECEIPT, ICON_SORT, ICON_BACK } from "./icones.js";
import { openImportar } from "./nfce.js";

/* ---------------- render ---------------- */
export function render(){
  if (S.dragging) { S.pendingRender = true; return; }
  document.body.classList.toggle("ro", S.readonly);
  const ini = (S.meName||"").trim().split(/\s+/).filter(Boolean).map(w=>w[0]).join("").slice(0,2).toUpperCase();
  $("profileBtn").classList.toggle("has-dot", !!S.fbUnread);
  /* foto do Google por cima das iniciais (que ficam por baixo: sem salto se a foto falhar ou demorar) */
  { const btn = $("profileBtn"); let im = btn.querySelector("img.av-img"); const src = S.photoFailed ? "" : (S.mePhotoData || S.mePhoto || "");
    if (src) {
      if (!im) { im = new Image(); im.className = "av-img"; im.alt = ""; im.referrerPolicy = "no-referrer"; im.onerror = () => { S.photoFailed = true; im.remove(); }; btn.appendChild(im); }
      if (im.getAttribute("src") !== src) im.src = src;
    } else if (im) im.remove(); }
  $("avatarInitial").textContent = ini || (envName(S.env)||"·").trim().charAt(0).toUpperCase() || "·";
  $("envChipName").textContent = envName(S.env) || "Ambiente";
  $("homeView").hidden = S.view !== "home";
  $("listView").hidden = S.view !== "list";
  $("listView").classList.toggle("reorder", !!S.reorder);
  $("fab").hidden = S.view !== "home" || S.readonly || S.mode === "loading";
  $("addbar").hidden = S.view !== "list" || S.readonly || !!S.reorder;
  if (S.view === "home") renderHome(); else renderList();
}

/* esqueleto: só aparece quando não há nada guardado; mesmas medidas dos cards reais */
const SK_HOME = `<div class="lists sk" aria-busy="true" aria-label="Carregando">${'<div class="lcard sk-card"><i></i><i></i></div>'.repeat(3)}</div>`;
const SK_LIST = `<div class="sk" aria-busy="true" aria-label="Carregando">${'<div class="cat sk-cat"><i class="sk-h"></i><i></i><i></i><i></i></div>'.repeat(2)}</div>`;
/* só mexe no DOM se o HTML mudou: dados novos iguais aos guardados não piscam nem mexem na rolagem */
function setHTML(el, html){ if (el._html !== html) { el.innerHTML = html; el._html = html; } }
export function renderHome(){
  const body = $("homeBody");
  if (S.mode === "remote" && S.bootDone && !S.env) {
    setHTML(body, `<div class="empty"><div class="basket">${ICON_BASKET}</div><strong>Entre num ambiente</strong>Peça o link de convite para quem criou a lista.<div style="margin-top:16px"><button class="btn primary" data-act="join-code">Colar link de convite</button></div></div>`);
    return;
  }
  if (S.mode === "loading" || (S.mode === "remote" && !(S.loaded.lists && S.loaded.items))) {
    setHTML(body, SK_HOME); return;
  }
  const q = norm(S.search);
  const all = [...S.lists].map(([id,l]) => ({id, ...l}))
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  const match = l => {
    if (!q) return true;
    if (norm(l.title).includes(q)) return true;
    return itemsOf(l.id).some(i => norm(i.text).includes(q));
  };
  const active = all.filter(l => !l.done && match(l));
  const done = all.filter(l => l.done && match(l));

  if (!all.length) {
    setHTML(body, `<div class="empty"><div class="basket">${ICON_BASKET}</div><strong>Nenhuma lista ainda</strong>${S.readonly ? "Quando alguém criar uma lista, ela aparece aqui." : "Toque no + para criar a primeira lista de compras."}<div style="margin-top:18px"><button class="btn" data-act="join-code">Recebeu um convite? Cole o link</button></div></div>`);
    return;
  }
  const tabDone = !!S.showDone, shown = tabDone ? done : active;
  let html = `<div class="pillrow"><button class="fpill" data-act="tab-active" aria-pressed="${!tabDone}">Ativas · ${active.length}</button><button class="fpill" data-act="tab-done" aria-pressed="${tabDone}">Concluídas · ${done.length}</button><button class="iconbtn" data-act="cats" aria-label="Categorias">${ICON_TAG}</button></div>`;
  if (!shown.length) html += `<div class="empty">${q ? `Nada encontrado para “${esc(S.search)}”.` : tabDone ? "Nenhuma lista concluída ainda." : "Nenhuma lista ativa. Toque no + para criar uma."}</div>`;
  else html += `<div class="lists">${shown.map(cardHTML).join("")}</div>`;
  setHTML(body, html);
}
export function cardHTML(l){
  const its = itemsOf(l.id);
  const total = its.length, checked = its.filter(i=>i.checked).length;
  const pct = total ? Math.round(checked/total*100) : 0;
  const lv = valoresOn() ? listaValor(its) : {text: ""};
  return `<article class="lcard ${l.done?"done":"active"}" data-open="${esc(l.id)}" tabindex="0" role="button" aria-label="Abrir ${esc(l.title||"lista sem nome")}">
    <div class="ltop"><h2>${esc(l.title || "Lista sem nome")}</h2>${lv.text ? `<span class="lval">${esc(lv.text)}</span>` : ""}</div>
    <div class="bar6"><i style="width:${l.done?100:pct}%"></i></div>
    <div class="lfoot"><span>${checked} de ${total} ${total === 1 ? "item" : "itens"}</span><span>${l.done?100:pct}%</span></div>
  </article>`;
}

/* list view: reconciliação por chave para não derrubar o foco/teclado enquanto alguém digita */
export const liMap = new Map();
export const secMap = new Map();
export let catsSortable = null;

export function renderList(){
  const list = S.lists.get(S.listId);
  if (!list) {
    if (S.mode === "remote" && !S.loaded.lists) { setHTML($("catsWrap"), SK_LIST); return; }
    S.view = "home"; S.listId = null; render(); toast("Essa lista foi excluída."); return;
  }
  const ti = $("titleInput");
  if (document.activeElement !== ti && ti.value !== (list.title||"")) ti.value = list.title || "";
  ti.readOnly = S.readonly;

  const its = itemsOf(S.listId);
  const open = its.filter(i=>!i.checked), cart = its.filter(i=>i.checked);
  const animOK = !S.dragging && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const before = new Map();
  const secBefore = new Map();
  if (animOK) {
    for (const [cid, sec] of secMap) if (sec.isConnected) secBefore.set(cid, sec.getBoundingClientRect().top);
    for (const [id, li] of liMap) if (li.isConnected) { const r = li.getBoundingClientRect(); const sr = li.closest(".cat"); if (r.height && sr) before.set(id, {sec: sr.dataset.cat, off: r.top - sr.getBoundingClientRect().top}); }
  }
  $("pbar").hidden = !its.length;
  $("lpDone").textContent = `${cart.length} de ${its.length} ${its.length === 1 ? "item" : "itens"}`;
  const lv = valoresOn() ? listaValor(its) : {text: "", falta: 0};
  /* à direita do progresso: o valor total da lista (vazio sem valores) */
  $("lpLeft").textContent = lv.text;
  $("lpLeft").title = lv.text ? (lv.falta ? `Estimativa · ${lv.falta} ${lv.falta === 1 ? "item" : "itens"} sem preço` : "Estimativa da lista") : "";
  $("pbarFill").style.width = (its.length ? cart.length/its.length*100 : 0) + "%";

  // banner
  let banner = "";
  if (S.mode === "local") banner += `<div class="note">Modo local: esta lista está salva só neste aparelho e não sincroniza.</div>`;
  if (S.readonly) banner += `<div class="note">Você pode ver esta lista, mas não editar.</div>`;
  if (S.reorder && !S.readonly) banner += `<div class="reorder-bar"><span>Arraste pelas alças para reordenar itens e categorias.</span><button class="btn primary" data-act="reorder-off">Pronto</button></div>`;
  /* lista toda riscada: sem tela nem aviso fixo; a lista fica como está (com os itens riscados) e só um toast avisa */
  if (list.done && open.length) banner += `<div class="banner"><p><strong>Lista concluída</strong>Você ainda pode editar, ou reabrir para usar de novo.</p>${S.readonly?"":'<button class="btn primary" data-act="reuse">Usar de novo</button>'}</div>`;
  const bEl = $("listBanner"); if (bEl._html !== banner) { bEl.innerHTML = banner; bEl._html = banner; }
  $("catsWrap").hidden = false;
  const sgEl = $("suggest");
  const sgHTML = (S.readonly || list.done || sgHidden.has(S.listId)) ? "" : suggestHTML(S.listId, its, list);
  if (sgEl._html !== sgHTML) { sgEl.innerHTML = sgHTML; sgEl._html = sgHTML; }

  $("listEmpty").innerHTML = "";

  // seções por categoria
  const wrap = $("catsWrap");
  if (wrap._html) { wrap.innerHTML = ""; wrap._html = null; }   // tira o esqueleto
  const order = sortedCatsFor(list);
  const byCat = new Map();
  for (const it of its) { const c = order.includes(it.cat) ? it.cat : "outros"; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(it); }
  const eff = it => hold.has(it.id) ? hold.get(it.id) : !!it.checked;
  const sortSec = arr => arr.sort((a,b) => {
    const ca = eff(a), cb = eff(b);
    if (ca !== cb) return ca ? 1 : -1;
    if (!ca) return (a.order||0) - (b.order||0);
    return (b.checkedAt||0) - (a.checkedAt||0);
  });
  const isDone = cid => byCat.get(cid).every(i => eff(i));
  const present = order.filter(c => byCat.has(c));
  const cats = present.filter(c => !isDone(c)).concat(present.filter(c => isDone(c)));
  const used = new Set();

  cats.forEach((cid, idx) => {
    let sec = secMap.get(cid);
    if (!sec) { sec = makeSection(cid); secMap.set(cid, sec); }
    const cat = catById(cid);
    sec.querySelector("h3").textContent = cat.name;
    sec.querySelector(".sw").style.setProperty("--c", cat.color);
    const arr = sortSec(byCat.get(cid));
    sec.querySelector(".cv").textContent = valoresOn() ? catValor(arr) : "";
    sec.querySelector(".cn").textContent = `${arr.filter(i => eff(i)).length}/${arr.length}`;
    const allDone = arr.every(i => eff(i));
    sec.classList.toggle("all-done", allDone);
    sec.querySelector(".cat-check").setAttribute("aria-checked", allDone ? "true" : "false");
    if (!allDone) expanded.delete(cid);
    const isCollapsed = userCollapsed.has(cid) || (allDone && !expanded.has(cid));
    sec.classList.toggle("collapsed", isCollapsed);
    sec.querySelector(".cat-name").setAttribute("aria-expanded", String(!isCollapsed));
    sec.classList.toggle("noitems", !arr.length);
    sec.classList.toggle("selected", S.selectedCat === cid && !sec.classList.contains("collapsed"));
    if (wrap.children[idx] !== sec) wrap.insertBefore(sec, wrap.children[idx] || null);
    placeItems(sec.querySelector("ul"), arr, false, used);
  });
  if (S.selectedCat && !(secMap.get(S.selectedCat) && secMap.get(S.selectedCat).classList.contains("selected"))) S.selectedCat = null;   // bloco sumiu ou recolheu
  for (const [cid, sec] of secMap) if (!cats.includes(cid)) { if (sec._sortable) sec._sortable.destroy(); sec.remove(); secMap.delete(cid); }

  $("cartSec").hidden = true;

  for (const [id, li] of liMap) if (!used.has(id)) { li.remove(); liMap.delete(id); }

  // animação FLIP: seções e itens deslizam da posição antiga para a nova
  const flip = (el, dy) => {
    el.style.transition = "none"; el.style.transform = `translateY(${dy}px)`;
    void el.offsetWidth;
    el.style.transition = "transform .38s cubic-bezier(.2,.8,.2,1)"; el.style.transform = "";
    clearTimeout(el._flipT); el._flipT = setTimeout(() => { el.style.transition = ""; }, 420);
  };
  const secNow = new Map();
  for (const [cid, sec] of secMap) secNow.set(cid, sec.getBoundingClientRect().top);
  for (const [cid, sec] of secMap) { const b = secBefore.get(cid); if (b == null) continue; const dy = b - secNow.get(cid); if (Math.abs(dy) >= 1) flip(sec, dy); }
  if (before.size) for (const [id, li] of liMap) {
    const b = before.get(id); if (b == null) continue;
    const sr = li.closest(".cat"); if (!sr) continue;
    const r = li.getBoundingClientRect(); if (!r.height) continue;
    const nowOff = r.top - secNow.get(sr.dataset.cat);
    const dy = sr.dataset.cat === b.sec ? b.off - nowOff
      : (secBefore.get(b.sec) ?? 0) + b.off - (secBefore.get(sr.dataset.cat) ?? secNow.get(sr.dataset.cat)) - nowOff;
    if (Math.abs(dy) >= 1) flip(li, dy);
  }

  if (!catsSortable && Sortable) {
    catsSortable = Sortable.create(wrap, {
      handle: ".cat-grip", draggable: ".cat", animation: 160, ghostClass: "sortable-ghost",
      onChoose(){ wrap.classList.add("reordering"); },
      onUnchoose(){ wrap.classList.remove("reordering"); },
      onStart(){ S.dragging = true; selectCat(null); },
      onEnd(){
        S.dragging = false; wrap.classList.remove("reordering");
        const l = S.lists.get(S.listId); if (!l) return render();
        const visible = [...wrap.children].map(s => s.dataset.cat);
        const rest = sortedCatsFor(l).filter(c => !visible.includes(c));
        write("lists", S.listId, {catOrder: visible.concat(rest)}, "patch");
      }
    });
  }
  if (catsSortable) catsSortable.option("disabled", S.readonly || !S.reorder);
  for (const sec of secMap.values()) if (sec._sortable) sec._sortable.option("disabled", S.readonly || !S.reorder);
  updateAddChip();
  renderPeers();
}

/* grupos recolhidos à mão (além dos totalmente riscados, que recolhem sozinhos) */
export const userCollapsed = new Set();
export function toggleCollapse(cid){
  const sec = secMap.get(cid); if (!sec) return;
  const allDone = sec.classList.contains("all-done");
  if (sec.classList.contains("collapsed")) { userCollapsed.delete(cid); if (allDone) expanded.add(cid); }
  else { userCollapsed.add(cid); expanded.delete(cid); }
  render();
}
export function makeSection(cid){
  const sec = document.createElement("section");
  sec.className = "cat"; sec.dataset.cat = cid;
  sec.innerHTML = `<div class="cat-head"><span class="cat-grip" aria-label="Arrastar categoria">${ICON_GRIP}</span><button class="cat-name" aria-expanded="true" aria-label="Recolher ou abrir o grupo"><i class="sw"></i><h3></h3></button><span class="cv"></span><span class="cn"></span><span class="cat-toggle" aria-hidden="true">${ICON_CHEV}</span><button class="cat-check" role="checkbox" aria-checked="false" aria-label="Riscar todos os itens da categoria">${ICON_CHECK}</button></div><ul class="items" data-cat="${esc(cid)}"></ul><button class="add-in-cat">${ICON_PLUS}<span>Adicionar item</span></button>`;
  const ul = sec.querySelector("ul");
  if (Sortable) {
    sec._sortable = Sortable.create(ul, {
      group: "items", handle: ".grip", animation: 160, ghostClass: "sortable-ghost", fallbackOnBody: true, filter: ".done", preventOnFilter: false,
      disabled: S.readonly || !S.reorder,
      onStart(){ S.dragging = true; selectCat(null); },
      onEnd(evt){
        S.dragging = false;
        const li = evt.item, id = li.dataset.id, cat = evt.to.dataset.cat;
        const it = S.items.get(id);
        if (!it) return render();
        let pv = li.previousElementSibling, nx = li.nextElementSibling;
        while (pv && pv.classList.contains("done")) pv = pv.previousElementSibling;
        while (nx && nx.classList.contains("done")) nx = nx.nextElementSibling;
        const po = pv && S.items.get(pv.dataset.id) ? S.items.get(pv.dataset.id).order : null;
        const no = nx && S.items.get(nx.dataset.id) ? S.items.get(nx.dataset.id).order : null;
        let ord = po != null && no != null ? (po+no)/2 : po != null ? po + 1 : no != null ? no - 1 : it.order;
        if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return render();
        const patch = {order: ord};
        if (cat && cat !== it.cat) patch.cat = cat;
        write("items", id, patch, "patch");
        if (patch.cat) learn(it.text, patch.cat);
        if (S.pendingRender) { S.pendingRender = false; render(); }
      }
    });
  }
  return sec;
}

export function placeItems(ul, arr, isCart, used){
  arr.forEach((it, idx) => {
    used.add(it.id);
    let li = liMap.get(it.id);
    if (!li) { li = makeLi(it.id); liMap.set(it.id, li); }
    updateLi(li, it, isCart);
    if (ul.children[idx] !== li) ul.insertBefore(li, ul.children[idx] || null);
  });
  // remove sobras que não pertencem mais a esse ul
  [...ul.children].forEach((li, i) => { if (i >= arr.length) { /* será movido ou removido */ if (!arr.some(a => a.id === li.dataset.id)) { if (!used.has(li.dataset.id)) li.remove(); } } });
}
export function makeLi(id){
  const li = document.createElement("li");
  li.className = "item"; li.dataset.id = id;
  li.innerHTML = `<span class="grip" aria-hidden="true">${ICON_GRIP}</span>
    <input class="txt" data-item-id="${esc(id)}" autocomplete="off" enterkeyhint="next" placeholder="Item" aria-label="Nome do item">
    <span class="fill"></span>
    <span class="pv"></span>
    <span class="tag" hidden><i></i><b></b></span>
    <button class="more" aria-label="Opções do item">${ICON_MORE}</button>
    <button class="check" role="checkbox" aria-checked="false" aria-label="Riscar item">${ICON_CHECK}</button>`;
  return li;
}
export function updateLi(li, it, isCart){
  li.classList.toggle("done", !!it.checked);
  li.classList.toggle("settling", !!it.checked && hold.has(it.id));
  const ck = li.querySelector(".check");
  ck.setAttribute("aria-checked", it.checked ? "true" : "false");
  ck.setAttribute("aria-label", it.checked ? "Desmarcar item" : "Riscar item");
  ck.disabled = S.readonly;
  const inp = li.querySelector(".txt");
  const val = drafts.has(it.id) ? drafts.get(it.id) : (it.text || "");
  if (document.activeElement !== inp && inp.value !== val) inp.value = val;
  inp.readOnly = S.readonly;
  li.querySelector(".pv").textContent = valoresOn() ? itemValor(it) : "";
  const tag = li.querySelector(".tag");
  tag.hidden = !isCart;
  if (isCart) { const c = catById(it.cat); tag.querySelector("i").style.setProperty("--c", c.color); tag.querySelector("b").textContent = c.name; }
}

/* ---------------- presença ---------------- */
export function renderPeers(){
  const el = $("peers");
  const ps = S.peers;
  if (!ps.length) { el.innerHTML = ""; el.onclick = null; return; }
  const nameOf = p => ((S.profiles[p.by] || {}).name) || "Alguém";
  const ini = nm => nm.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";
  const shown = ps.length > 3 ? ps.slice(0, 2) : ps;
  const extra = ps.length - shown.length;
  const avs = shown.map(p => `<span class="av" style="--c:${esc((S.profiles[p.by] || {}).color || "#ff6b1a")}">${esc(ini(nameOf(p)))}</span>`).join("")
    + (extra ? `<span class="av more-av">+${extra}</span>` : "");
  const label = ps.length === 1 ? `${nameOf(ps[0])} está nesta lista agora` : `${ps.length} pessoas nesta lista agora`;
  el.innerHTML = `<button class="peer-stack" aria-label="${esc(label)}" title="${esc(label)}">${avs}<i class="live-dot"></i></button>`;
  el.onclick = () => {
    const rows = S.peers.map(p => { const nm = nameOf(p); return `<div class="mrow"><span class="av-sm" style="--c:${esc((S.profiles[p.by] || {}).color || "#ff6b1a")}">${esc(ini(nm))}</span><div class="minfo"><b>${esc(nm)}</b></div></div>`; }).join("");
    openSheet(`<h4>Nesta lista agora</h4><p class="sub">${S.peers.length === 1 ? "1 pessoa" : S.peers.length + " pessoas"} com a lista aberta além de você.</p><div class="mlist">${rows}</div><div class="confirm"><button class="btn" data-act="close">Fechar</button></div>`, body => {
      body.onclick = e => { if (e.target.closest('[data-act="close"]')) closeSheet(); };
    });
  };
}
export function setupRoom(){
  const r = S.room;
  const refresh = (peers) => {
    const seen = new Set();
    S.peers = peers.filter(p => !p.isMe && p.kind === "viewer" && p.presence && p.presence.list === S.listId && S.listId && p.by && !seen.has(p.by) && seen.add(p.by));
    const ids = S.peers.map(p => p.by).filter(id => !S.profiles[id]);
    if (ids.length && S.userApi && S.userApi.profiles) {
      S.userApi.profiles(ids).then(ps => { Object.assign(S.profiles, ps || {}); renderPeers(); }).catch(()=>{});
    }
    renderPeers();
  };
  try { r.onPeers(ch => refresh(ch.peers), () => {}); } catch(e){}
  S._refreshPeers = () => { try { refresh(r.peers()); } catch(e){} };
  announce();
}
export function announce(){ if (S.room) { S.room.presence({list: S.view === "list" ? S.listId : null}).catch(()=>{}); if (S._refreshPeers) S._refreshPeers(); } }

/* ---------------- ações ---------------- */
export function createList(){
  const id = newId();
  const now = Date.now();
  write("lists", id, {title:"", createdAt:now, done:false, catOrder:[]}, "set");
  openList(id, true);
}
/* bloco selecionado: só um por vez, não persiste; sem render, para a tela não pular debaixo do dedo */
export function selectCat(cid){
  S.selectedCat = cid || null;
  secMap.forEach((sec, id) => sec.classList.toggle("selected", id === S.selectedCat && !sec.classList.contains("collapsed")));
  updateAddChip();
}
export function openList(id, focusTitle){
  selectCat(null);
  S.view = "list"; S.listId = id; S.addCatManual = false; S.peek = false; S.reorder = false; userCollapsed.clear();
  liMap.forEach(li => li.remove()); liMap.clear();
  secMap.forEach(s => { if (s._sortable) s._sortable.destroy(); s.remove(); }); secMap.clear();
  $("titleInput").value = (S.lists.get(id)||{}).title || "";
  render(); window.scrollTo(0,0); announce();
  try { history.replaceState(null, "", "#l-" + id); } catch(e){}
  if (focusTitle) setTimeout(() => $("titleInput").focus(), 50);
}
export function goHome(){
  selectCat(null);
  flushAll();
  const id = S.listId, l = S.lists.get(id);
  if (l && !S.readonly) {
    const its = itemsOf(id);
    if (!its.length && !(l.title||"").trim()) write("lists", id, null, "del");
  }
  S.view = "home"; S.listId = null; S.reorder = false;
  try { history.replaceState(null, "", "#"); } catch(e){}
  render(); announce(); window.scrollTo(0,0);
}
export function nextOrderInCat(listId, cat){
  const its = itemsOf(listId);
  const inCat = its.filter(i => i.cat === cat && !i.checked);
  const pool = inCat.length ? inCat : its;
  return pool.length ? Math.max(...pool.map(i => i.order || 0)) + 1 : 1;
}
export function addItem(text, cat, focusAfter){
  text = (text||"").trim(); if (!text || !S.listId) return;
  const c = cat || guessCat(text) || "outros";
  userCollapsed.delete(c);
  const id = newId();
  myCreated.add(id);
  write("items", id, {listId:S.listId, text, cat:c, order:nextOrderInCat(S.listId, c), checked:false, checkedAt:0, createdAt:Date.now(), by:S.myId||null}, "set");
  if (S.lists.get(S.listId) && S.lists.get(S.listId).done) write("lists", S.listId, {done:false}, "patch");
  return id;
}
export function insertAfter(itemId){
  const it = S.items.get(itemId); if (!it) return;
  const sib = itemsOf(it.listId).filter(i => i.cat === it.cat && !i.checked && i.order > it.order).sort((a,b)=>a.order-b.order)[0];
  const order = sib ? (it.order + sib.order)/2 : it.order + 1;
  const id = newId();
  myCreated.add(id);
  write("items", id, {listId:it.listId, text:"", cat:it.cat, order, checked:false, checkedAt:0, createdAt:Date.now(), by:S.myId||null}, "set");
  const li = liMap.get(id);
  if (li) li.querySelector(".txt").focus();
}
export function toggleItem(id){
  const it = S.items.get(id); if (!it) return;
  flushDraft(id);
  const checked = !it.checked;
  if (checked) shopping.add(it.listId);
  if (!hold.has(id)) hold.set(id, !!it.checked);
  clearTimeout(holdTimers.get(id));
  holdTimers.set(id, setTimeout(() => { hold.delete(id); holdTimers.delete(id); render(); }, 600));
  write("items", id, {checked, checkedAt: checked ? Date.now() : 0}, "patch");
  const lid = it.listId, l0 = S.lists.get(lid);
  if (!checked && l0 && l0.done) write("lists", lid, {done:false}, "patch");
  if (checked) setTimeout(() => {
    const l = S.lists.get(lid), all = itemsOf(lid);
    if (l && !l.done && all.length && all.every(i => i.checked)) { S.peek = false; logTrip(lid); write("lists", lid, {done:true}, "patch"); toast("Compra finalizada. Tudo riscado!"); }
  }, 800);
}
export function toggleCat(cid){
  const sec = [...document.querySelectorAll("#catsWrap .cat")].find(s => s.dataset.cat === cid); if (!sec) return;
  const its = [...sec.querySelectorAll("li.item")].map(li => { const it = S.items.get(li.dataset.id); return it && {...it, id: li.dataset.id}; }).filter(Boolean);
  if (!its.length) return;
  const checked = its.some(i => !i.checked);   // algum aberto: riscar todos; senão desmarcar todos
  const lid = its[0].listId;
  for (const it of its) {
    if (!!it.checked === checked) continue;
    flushDraft(it.id);
    const id = it.id;
    if (!hold.has(id)) hold.set(id, !!it.checked);
    clearTimeout(holdTimers.get(id));
    holdTimers.set(id, setTimeout(() => { hold.delete(id); holdTimers.delete(id); render(); }, 600));
    write("items", id, {checked, checkedAt: checked ? Date.now() : 0}, "patch");
  }
  if (checked) shopping.add(lid);
  const l0 = S.lists.get(lid);
  if (!checked && l0 && l0.done) write("lists", lid, {done:false}, "patch");
  if (checked) setTimeout(() => {
    const l = S.lists.get(lid), all = itemsOf(lid);
    if (l && !l.done && all.length && all.every(i => i.checked)) { S.peek = false; logTrip(lid); write("lists", lid, {done:true}, "patch"); toast("Compra finalizada. Tudo riscado!"); }
  }, 800);
}
export function deleteItem(id, silent){
  const it = S.items.get(id); if (!it) return;
  drafts.delete(id);
  const copy = {...it};
  write("items", id, null, "del");
  if (!silent && (copy.text||"").trim()) toast(`“${copy.text}” removido`, () => { myCreated.add(id); write("items", id, copy, "set"); });
}
export function setDraft(id, val){
  drafts.set(id, val);
  clearTimeout(draftTimers.get(id));
  draftTimers.set(id, setTimeout(() => flushDraft(id), 600));
}
export function flushDraft(id){
  clearTimeout(draftTimers.get(id)); draftTimers.delete(id);
  if (!drafts.has(id)) return;
  const val = drafts.get(id); drafts.delete(id);
  const it = S.items.get(id);
  if (it && it.text !== val) write("items", id, {text: val}, "patch");
  /* item criado pelo "+" de um bloco: a palavra digitada ali ensina a categoria do bloco */
  if (it && blankManual.has(id) && val.trim()) { blankManual.delete(id); learn(val, it.cat); }
}
const blankManual = new Set();
export function flushAll(){ [...drafts.keys()].forEach(flushDraft); flushTitle(); }
export let titleTimer = null;
export function flushTitle(){
  clearTimeout(titleTimer); titleTimer = null;
  const l = S.lists.get(S.listId); if (!l) return;
  const v = $("titleInput").value;
  if ((l.title||"") !== v) write("lists", S.listId, {title: v}, "patch");
}
export function checkAll(){
  const lid = S.listId, its = itemsOf(lid).filter(i => !i.checked);
  if (!its.length) return;
  shopping.add(lid);
  its.forEach(i => { flushDraft(i.id); write("items", i.id, {checked:true, checkedAt:Date.now()}, "patch"); });
  setTimeout(() => {
    const l = S.lists.get(lid), all = itemsOf(lid);
    if (l && !l.done && all.length && all.every(i => i.checked)) { S.peek = false; logTrip(lid); write("lists", lid, {done:true}, "patch"); toast("Compra finalizada. Tudo riscado!"); }
  }, 800);
}
export function uncheckAll(){
  const its = itemsOf(S.listId).filter(i => i.checked);
  its.forEach(i => write("items", i.id, {checked:false, checkedAt:0}, "patch"));
}
export function clearChecked(){
  const its = itemsOf(S.listId).filter(i => i.checked);
  if (!its.length) return;
  its.forEach(i => write("items", i.id, null, "del"));
  toast(its.length === 1 ? "1 item riscado removido" : its.length + " itens riscados removidos", () => its.forEach(i => { const {id, ...d} = i; myCreated.add(id); write("items", id, d, "set"); }));
}
export function duplicateList(){
  const src = S.lists.get(S.listId); if (!src) return;
  const id = newId();
  write("lists", id, {title:(src.title || "Lista") + " (cópia)", createdAt:Date.now(), done:false, catOrder:src.catOrder||[]}, "set");
  itemsOf(S.listId).forEach(i => { const nid = newId(); myCreated.add(nid); write("items", nid, {listId:id, text:i.text, cat:i.cat, order:i.order, checked:false, checkedAt:0, createdAt:Date.now(), by:S.myId||null}, "set"); });
  openList(id);
  toast("Lista duplicada");
}
export function deleteList(){
  const id = S.listId; const its = itemsOf(id);
  S.view = "home"; S.listId = null;
  write("lists", id, null, "del");
  its.forEach(i => write("items", i.id, null, "del", {localOnly: true}));
  render(); announce();
  toast("Lista excluída");
}


/* ---------------- add bar ---------------- */
/* categoria sugerida pelo histórico: item já existente cujo nome é igual ou começa com o texto (sem acento/maiúscula) */
function historyCat(text){
  const n = norm(text); if (!n) return null;
  let best = null, bestExact = false, bestAt = -1;
  for (const it of S.items.values()) {
    const k = norm(it.text);
    if (!k || !it.cat || it.cat === "outros" || !allCats().some(c => c.id === it.cat)) continue;
    const exact = k === n;
    if (!exact && !k.startsWith(n)) continue;
    const at = it.createdAt || 0;
    if (!best || (exact && !bestExact) || (exact === bestExact && at > bestAt)) { best = it.cat; bestExact = exact; bestAt = at; }
  }
  return best;
}
export function updateAddChip(){
  const chip = $("addCat"), btn = $("addBtn");
  const val = $("addInput").value, txt = val.trim();
  const listening = btn.classList.contains("listening");
  /* botão único: microfone com o campo vazio, enviar quando há texto */
  const send = !!txt && !listening;
  btn.classList.toggle("send", send);
  if (!listening) btn.setAttribute("aria-label", send ? "Adicionar" : "Ditar");
  btn.hidden = btn.dataset.novoz === "1" && !send;
  const many = splitItems(val).length;
  const sw = chip.querySelector(".sw"), label = chip.querySelector("span");
  chip.classList.remove("auto", "sug");
  if (many > 1 && !S.addCatManual) {
    sw.style.setProperty("--c", "var(--accent)");
    label.textContent = many + " itens";
    return;
  }
  let cid = null;
  if (S.addCatManual && S.addCat) cid = S.addCat;
  else if (S.selectedCat && secMap.has(S.selectedCat)) { cid = S.selectedCat; S.addCat = null; }
  else {
    cid = historyCat(val);
    S.addCat = cid;
    chip.classList.add(cid ? "sug" : "auto");
  }
  if (!cid) { label.textContent = "Auto"; return; }
  const c = catById(cid);
  sw.style.setProperty("--c", c.color);
  label.textContent = c.id === "outros" && cid !== S.selectedCat ? "Sem categoria" : c.name;
}
/* adiciona vários textos de uma vez (barra de adicionar e voz): categoria escolhida no chip (ensina o app), senão a do histórico, senão "outros" */
export function addTexts(parts){
  parts = parts.map(t => t.trim()).filter(Boolean); if (!parts.length) return;
  const manual = S.addCatManual && S.addCat ? S.addCat : null;
  if (manual) parts.forEach(t => learn(t, manual));
  const grp = !manual && S.selectedCat && secMap.has(S.selectedCat) ? S.selectedCat : null;   // grupo ativo: vale sem ensinar nada ao app
  const ids = parts.map(t => addItem(t, manual || grp || historyCat(t) || "outros")).filter(Boolean);
  if (ids.length > 1) toast(`${ids.length} itens adicionados`, () => ids.forEach(id => deleteItem(id, true)));
  S.addCatManual = false; S.addCat = null; updateAddChip();
}
export function submitAdd(){
  const inp = $("addInput");
  const v = inp.value.trim(); if (!v) return;
  const parts = splitItems(v);
  inp.value = "";
  addTexts(parts.length > 1 ? parts : [v]);
  inp.focus();
}

/* ---------------- sheet ---------------- */
export function openSheet(html, onMount, opts){
  const sb = $("sheetBody"); sb.onclick = sb.onchange = sb.onkeydown = null;
  sb.innerHTML = html;
  const sh = $("sheet"); sh.classList.toggle("tall", !!(opts && opts.tall)); sh.style.transform = "";
  $("scrim").hidden = false; sh.hidden = false;
  requestAnimationFrame(() => { $("scrim").classList.add("on"); sh.classList.add("on"); });
  if (onMount) onMount($("sheetBody"));
}
export function closeSheet(){
  $("scrim").classList.remove("on"); $("sheet").classList.remove("on"); $("sheet").style.transform = "";
  setTimeout(() => { if ($("sheet").classList.contains("on")) return; $("scrim").hidden = true; $("sheet").hidden = true; $("sheetBody").innerHTML = ""; $("sheet").classList.remove("tall"); }, 230);
}
/* cabeçalho de folha: título e, se houver, botão de voltar redondo (data-act="back") */
export function sheetHead(title, back){
  return `<div class="sh-head">${back ? `<button class="sh-back" data-act="back" aria-label="Voltar">${ICON_BACK}</button>` : ""}<h4>${title}</h4></div>`;
}
/* arrastar a alça para baixo fecha a folha */
export function bindSheetSwipe(){
  const sh = $("sheet"), h = $("sheetHandle"); let y0 = null, dy = 0;
  h.addEventListener("pointerdown", e => { y0 = e.clientY; dy = 0; sh.classList.add("dragging"); try { h.setPointerCapture(e.pointerId); } catch(_){} });
  h.addEventListener("pointermove", e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
  const end = e => { if (y0 == null) return; if (e && e.type === "pointerup") dy = Math.max(dy, e.clientY - y0); y0 = null; sh.classList.remove("dragging"); if (dy > 90) closeSheet(); else sh.style.transform = ""; };
  h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
}
/* categorias em pílulas de 40 px (ponto de cor + nome) e campo de nova categoria */
export function catPillsHTML(selected){
  return `<div class="pills">${allCats().map(c => `<button class="catpill" data-cat="${esc(c.id)}" aria-pressed="${c.id===selected}"><i class="sw" style="--c:${c.color}"></i><span>${esc(c.name)}</span></button>`).join("")}</div>`;
}
export function newCatFormHTML(){
  return `<form class="newcat" data-form="newcat"><input id="newCatName" placeholder="Nova categoria (ex.: Farmácia)" autocomplete="off" aria-label="Nova categoria"><button class="btn primary" type="submit">Criar</button></form>`;
}
export function openItemSheet(id){
  const it = S.items.get(id); if (!it) return;
  flushDraft(id);
  openSheet(`<h4>${esc(it.text || "Item sem nome")}</h4><p class="sub">Mover para outra categoria</p><label class="catsearch"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="catQ" type="search" placeholder="Buscar ou criar categoria" autocomplete="off" aria-label="Buscar categoria"></label>${catPillsHTML(it.cat)}<div id="catNew"></div>${priceSheetHTML(it)}
    <div class="divider"></div><button class="row-solo red" data-act="del-item">${ICON_TRASH}Excluir item</button>`, body => {
    bindPriceSheet(body, it, closeSheet);
    const q = $("catQ"), moveTo = cid => { const cur = S.items.get(id); if (cid && cur && cur.cat !== cid) { write("items", id, {cat: cid, order: nextOrderInCat(cur.listId, cid)}, "patch"); learn(cur.text, cid); } closeSheet(); };
    q.oninput = () => {
      const t = norm(q.value); let n = 0;
      body.querySelectorAll(".catpill").forEach(b => { const ok = !t || norm(b.textContent).includes(t); b.hidden = !ok; if (ok) n++; });
      $("catNew").innerHTML = t && !n ? `<button class="catpill newpill" data-newcat="1">+ Criar “${esc(q.value.trim())}”</button>` : "";
    };
    q.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); const nb = body.querySelector("[data-newcat]"); if (nb) nb.click(); else { const v = [...body.querySelectorAll(".catpill")].filter(b => !b.hidden); if (v.length === 1) v[0].click(); } } };
    body.onclick = e => {
      if (e.target.closest("[data-newcat]")) { moveTo(addCustomCat(q.value)); return; }
      const b = e.target.closest("[data-cat]");
      if (b) { const cat = b.dataset.cat; const cur = S.items.get(id); if (cur && cur.cat !== cat) { write("items", id, {cat, order: nextOrderInCat(cur.listId, cat)}, "patch"); learn(cur.text, cat); } closeSheet(); return; }
      if (e.target.closest('[data-act="del-item"]')) { deleteItem(id); closeSheet(); }
    };
  });
}
export function openAddCatSheet(){
  openSheet(`<h4>Categoria do próximo item</h4><p class="sub">Vale só para este item.</p>
    <button class="autocard" data-act="auto" aria-pressed="${!S.addCatManual}"><span class="ac-ic">${ICON_SPARK}</span><span class="ac-t"><b>Auto</b><small>Escolhe pela categoria aprendida</small></span><span class="ac-ck">${ICON_CHECK}</span></button>
    <p class="sect">Ou escolha</p>${catPillsHTML(S.addCatManual ? S.addCat : null)}${newCatFormHTML()}`, body => {
    body.onclick = e => {
      const b = e.target.closest("[data-cat]");
      if (b) { S.addCat = b.dataset.cat; S.addCatManual = true; updateAddChip(); closeSheet(); $("addInput").focus(); return; }
      if (e.target.closest('[data-act="auto"]')) { S.addCatManual = false; updateAddChip(); closeSheet(); $("addInput").focus(); }
    };
    body.querySelector('[data-form="newcat"]').onsubmit = e => {
      e.preventDefault(); const cid = addCustomCat($("newCatName").value);
      if (cid) { S.addCat = cid; S.addCatManual = true; }
      updateAddChip(); closeSheet();
    };
  });
}
export function openListMenu(){
  const l = S.lists.get(S.listId); if (!l) return;
  if (S.readonly) { openHelp(); return; }
  const row = (act, ic, label) => `<button class="row" data-act="${act}">${ic}<span class="rl">${label}</span></button>`;
  openSheet(`<h4>${esc(l.title || "Lista sem nome")}</h4>
    <p class="sect" style="margin-top:14px">Itens</p>
    <div class="grp">${row("checkall", ICON_CHECKBIG, "Marcar todos os itens")}${row("uncheck", ICON_UNDO, "Desmarcar todos os itens")}${row("clear", ICON_BROOM, "Remover itens riscados")}${row("reorder", ICON_SORT, "Reordenar itens e categorias")}</div>
    <p class="sect">Lista</p>
    <div class="grp">${row("cats", ICON_TAG, "Editar categorias")}${row("dup", ICON_COPY, "Duplicar lista")}${S.mode === "remote" ? row("nfce", ICON_RECEIPT, "Importar nota") : ""}${row("help", ICON_PEOPLE, "Compartilhar com alguém")}</div>
    <button class="row-solo red" data-act="del">Excluir lista</button><div id="confirmBox"></div>`, body => {
    body.onclick = e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const a = b.dataset.act;
      if (a === "checkall") { checkAll(); closeSheet(); }
      else if (a === "uncheck") { uncheckAll(); closeSheet(); }
      else if (a === "clear") { clearChecked(); closeSheet(); }
      else if (a === "reorder") { S.reorder = true; selectCat(null); closeSheet(); render(); }
      else if (a === "dup") { closeSheet(); duplicateList(); }
      else if (a === "cats") { closeSheet(); setTimeout(() => openCatManager(), 240); }
      else if (a === "nfce") { closeSheet(); setTimeout(openImportar, 240); }
      else if (a === "help") { closeSheet(); setTimeout(openHelp, 240); }
      else if (a === "del") {
        $("confirmBox").innerHTML = `<p class="sub" style="margin-top:12px">Excluir “${esc(l.title||"Lista sem nome")}” e todos os itens? Isso vale para todo mundo que usa a lista.</p><div class="confirm"><button class="btn" data-act="cancel">Cancelar</button><button class="btn danger" data-act="del-yes">Excluir</button></div>`;
      }
      else if (a === "cancel") { $("confirmBox").innerHTML = ""; }
      else if (a === "del-yes") { closeSheet(); deleteList(); }
    };
  });
}


/* remove o bloco: todos os itens da categoria nesta lista (com desfazer) */
export function removeBlock(cid){
  if (S.readonly || !S.listId) return;
  const its = itemsOf(S.listId).filter(i => (i.cat || "outros") === cid);
  if (!its.length) return;
  its.forEach(i => { drafts.delete(i.id); write("items", i.id, null, "del"); });
  toast(its.length === 1 ? "Bloco removido (1 item)" : `Bloco removido (${its.length} itens)`, () => its.forEach(i => { const {id, ...d} = i; myCreated.add(id); write("items", id, d, "set"); }));
}
function openBlockMenu(cid){
  const n = itemsOf(S.listId).filter(i => (i.cat || "outros") === cid).length;
  openSheet(`<h4>${esc(catById(cid).name)}</h4><p class="sub">${n === 1 ? "1 item" : n + " itens"} neste bloco</p>
    <div class="menu"><button data-act="move-block">Mover para outra lista</button><button class="red" data-act="del-block">${ICON_TRASH}Remover bloco e ${n === 1 ? "1 item" : n + " itens"}</button></div>`, body => {
    body.onclick = e => {
      if (e.target.closest('[data-act="move-block"]')) { openMoveBlock(cid); return; }
      if (e.target.closest('[data-act="del-block"]')) { closeSheet(); removeBlock(cid); }
    };
  });
}
/* escolhe a lista de destino e leva todos os itens do bloco (mesma categoria) para ela */
function openMoveBlock(cid){
  const from = S.listId, n = itemsOf(from).filter(i => (i.cat || "outros") === cid).length;
  const others = [...S.lists].filter(([id]) => id !== from).map(([id, l]) => ({id, ...l})).sort((a, b) => (a.done - b.done) || (b.createdAt || 0) - (a.createdAt || 0));
  openSheet(`<h4>Mover “${esc(catById(cid).name)}”</h4><p class="sub">${n === 1 ? "1 item vai" : n + " itens vão"} para a lista que você escolher.</p>
    <div class="menu">${others.map(l => `<button data-to="${esc(l.id)}">${esc(l.title || "Lista sem nome")}${l.done ? " · concluída" : ""}</button>`).join("") || '<p class="sub">Não há outra lista neste ambiente.</p>'}<button class="quiet" data-act="back">Voltar</button></div>`, body => {
    body.onclick = e => {
      if (e.target.closest('[data-act="back"]')) { openBlockMenu(cid); return; }
      const b = e.target.closest("[data-to]"); if (!b) return;
      const to = b.dataset.to, its = itemsOf(from).filter(i => (i.cat || "outros") === cid).sort((a, c) => (a.order || 0) - (c.order || 0));
      const prev = its.map(i => ({id: i.id, listId: i.listId, order: i.order}));
      its.forEach(i => write("items", i.id, {listId: to, order: nextOrderInCat(to, i.cat)}, "patch"));
      if (S.lists.get(to) && S.lists.get(to).done) write("lists", to, {done: false}, "patch");
      closeSheet();
      toast(`${its.length === 1 ? "1 item movido" : its.length + " itens movidos"} para “${(S.lists.get(to) || {}).title || "Lista sem nome"}”`, () => prev.forEach(p => write("items", p.id, {listId: p.listId, order: p.order}, "patch")));
    };
  });
}
/* toque longo (550 ms) em `sel` (fora de `skip`); cancela se o dedo andar; o toque que o termina não vira clique */
let lpTimer = null, lpDone = false, lpX = 0, lpY = 0;
function bindLongPress(view, sel, skip, onPress){
  const cancel = () => { clearTimeout(lpTimer); lpTimer = null; };
  view.addEventListener("pointerdown", e => {
    const h = e.target.closest(sel); lpDone = false;
    if (!h || S.readonly || (skip && e.target.closest(skip))) return;
    lpX = e.clientX; lpY = e.clientY;
    cancel(); lpTimer = setTimeout(() => { lpTimer = null; lpDone = true; if (navigator.vibrate) navigator.vibrate(15); onPress(h); }, 550);
  });
  view.addEventListener("pointermove", e => { if (lpTimer && Math.hypot(e.clientX - lpX, e.clientY - lpY) > 8) cancel(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => view.addEventListener(t, cancel));
  view.addEventListener("scroll", cancel, true);
  view.addEventListener("contextmenu", e => { if (e.target.closest(sel)) e.preventDefault(); });
  view.addEventListener("click", e => { if (lpDone) { lpDone = false; e.stopPropagation(); e.preventDefault(); } }, true);
}

/* remove uma lista da tela inicial: o banco apaga os itens em cascata; o desfazer recria a lista e depois os itens */
function removeListById(id){
  const l = S.lists.get(id); if (!l) return;
  const its = itemsOf(id);
  write("lists", id, null, "del");
  its.forEach(i => write("items", i.id, null, "del", {localOnly: true}));
  toast("Lista removida", () => {
    write("lists", id, l, "set");
    its.forEach(i => { const {id: iid, ...d} = i; myCreated.add(iid); write("items", iid, d, "set"); });
  });
}
function openListCardMenu(id){
  const l = S.lists.get(id); if (!l) return;
  const n = itemsOf(id).length;
  openSheet(`<h4>${esc(l.title || "Lista sem nome")}</h4><p class="sub">${n === 1 ? "1 item" : n + " itens"}</p>
    <div class="menu"><button class="red" data-act="del-card">${ICON_TRASH}Remover lista</button></div>`, body => {
    body.onclick = e => { if (e.target.closest('[data-act="del-card"]')) { closeSheet(); removeListById(id); } };
  });
}

export function addBlankInCat(cat){
  if (S.readonly || !S.listId) return;
  userCollapsed.delete(cat);
  const id = newId();
  myCreated.add(id);
  blankManual.add(id);
  write("items", id, {listId:S.listId, text:"", cat, order:nextOrderInCat(S.listId, cat), checked:false, checkedAt:0, createdAt:Date.now(), by:S.myId||null}, "set");
  if (S.lists.get(S.listId) && S.lists.get(S.listId).done) write("lists", S.listId, {done:false}, "patch");
  const li = liMap.get(id); if (li) li.querySelector(".txt").focus();
}


/* ---------------- avisos do modo compra ---------------- */
export function watchChange(ch){
  const id = ch.doc.id, d = ch.doc.data() || {};
  if (ch.type === "removed") { pendingBlank.delete(id); return; }
  if (myCreated.has(id) || (d.by && S.myId && d.by === S.myId)) return;
  if (ch.type === "added") {
    if (!(d.text||"").trim()) { pendingBlank.add(id); return; }
    notifyAdded(id, d);
  } else if (ch.type === "modified" && pendingBlank.has(id) && (d.text||"").trim()) {
    pendingBlank.delete(id); notifyAdded(id, d);
  }
}
export async function notifyAdded(id, d){
  if (!shopping.has(d.listId)) return;
  let name = "Alguém";
  if (d.by && S.userApi && S.userApi.profiles) {
    try { const ps = await S.userApi.profiles([d.by]); Object.assign(S.profiles, ps || {}); name = ((ps && ps[d.by] && ps[d.by].name) || "Alguém").split(" ")[0]; } catch(e){}
  }
  const here = S.view === "list" && S.listId === d.listId;
  const lname = (S.lists.get(d.listId)||{}).title || "a lista";
  try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch(e){}
  if (here) {
    toast(`${name} adicionou “${d.text}” em ${catById(d.cat).name}`);
    setTimeout(() => { const li = liMap.get(id); if (li) { li.classList.remove("fresh"); void li.offsetWidth; li.classList.add("fresh"); li.scrollIntoView({block:"nearest", behavior:"smooth"}); } }, 50);
  } else {
    toast(`${name} adicionou “${d.text}” em ${lname}`, () => { openList(d.listId); setTimeout(() => { const li = liMap.get(id); if (li) li.classList.add("fresh"); }, 60); }, "Ver");
  }
}

/* ---------------- toast ---------------- */
export let toastTimer = null;
export function toast(msg, undo, label){
  $("toastMsg").textContent = msg;
  const u = $("toastUndo"); u.hidden = !undo; u.textContent = label || "Desfazer";
  u.onclick = () => { if (undo) undo(); hideToast(); };
  $("toast").classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, undo ? 5000 : 3000);
}
export function hideToast(){ $("toast").classList.remove("on"); }

export function bindEvents(){
  /* ---------------- eventos ---------------- */
  $("fab").onclick = createList;
  $("profileBtn").onclick = () => openProfile();
  $("envChip").onclick = () => openAmbientes();
  $("backBtn").onclick = goHome;
  $("menuBtn").onclick = openListMenu;
  $("scrim").onclick = closeSheet;
  bindSheetSwipe();
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });
  $("searchInput").addEventListener("input", e => { S.search = e.target.value; renderHome(); });
  $("homeBody").addEventListener("click", e => {
    if (e.target.closest('[data-act="join-code"]')) { openProfile("code"); return; }
    if (e.target.closest('[data-act="tab-active"]')) { S.showDone = false; renderHome(); return; }
    if (e.target.closest('[data-act="tab-done"]')) { S.showDone = true; renderHome(); return; }
    if (e.target.closest('[data-act="cats"]')) { openCatManager(); return; }
    const c = e.target.closest("[data-open]"); if (c) openList(c.dataset.open);
  });
  $("homeBody").addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { const c = e.target.closest("[data-open]"); if (c) { e.preventDefault(); openList(c.dataset.open); } }
  });
  $("titleInput").addEventListener("input", () => { clearTimeout(titleTimer); titleTimer = setTimeout(flushTitle, 600); });
  $("titleInput").addEventListener("blur", flushTitle);
  $("titleInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); flushTitle(); $("addInput").focus(); } });
  $("listBanner").addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "finish") { S.peek = false; logTrip(S.listId); write("lists", S.listId, {done:true}, "patch"); }
    if (b.dataset.act === "reuse") { S.peek = false; uncheckAll(); write("lists", S.listId, {done:false}, "patch"); }
    if (b.dataset.act === "peek") { S.peek = true; render(); }
    if (b.dataset.act === "hide-items") { S.peek = false; render(); window.scrollTo({top:0, behavior:"smooth"}); }
    if (b.dataset.act === "home") goHome();
    if (b.dataset.act === "reorder-off") { S.reorder = false; render(); }
    if (b.dataset.act === "fb") openFeedback("compra finalizada");
    if (b.dataset.act === "fb-x") { lsSet("fb-prompt", "dismissed"); render(); }
  });
  $("cartToggle").onclick = () => { S.showCart = !S.showCart; render(); };

  const listView = $("listView");
  /* seleção do bloco: toque no cabeçalho, no texto de um item ou no vazio do bloco; fora de qualquer bloco desmarca.
     Não seleciona ao tocar no check, no ⋮, nas alças nem no nome/seta da categoria; barra de adicionar, folhas e avisos não mexem */
  /* só vale toque confirmado: soltou em <500 ms, moveu <10 px, sem rolagem no gesto nem nos últimos 120 ms (inércia) */
  let tap = null, lastScroll = 0;
  window.addEventListener("scroll", () => { lastScroll = Date.now(); }, {capture: true, passive: true});
  document.addEventListener("pointerdown", e => {
    tap = (e.isPrimary !== false) ? {x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, scrolled: Date.now() - lastScroll < 120, target: e.target} : null;
    if (tap) tap.sy = window.scrollY;
  });
  document.addEventListener("pointercancel", () => { tap = null; });
  document.addEventListener("pointerup", e => {
    const t = tap; tap = null;
    if (!t || t.id !== e.pointerId || t.scrolled || S.dragging) return;
    if (Date.now() - t.t >= 500 || Math.hypot(e.clientX - t.x, e.clientY - t.y) >= 10) return;
    if (Date.now() - lastScroll < 120 || Math.abs(window.scrollY - t.sy) > 1) return;
    if (S.view !== "list" || t.target.closest("#addbar, #sheet, #scrim, .toast")) return;
    const sec = t.target.closest(".cat");
    if (!sec) { if (S.selectedCat) selectCat(null); return; }
    if (S.readonly || t.target.closest(".check, .more, .grip, .cat-head, .item")) return;
    if (S.selectedCat !== sec.dataset.cat) selectCat(sec.dataset.cat);
  });
  /* o ⋮ aparece só com o item em edição: sem isto o campo perde o foco antes do clique e o botão some */
  listView.addEventListener("mousedown", e => { if (e.target.closest(".more")) e.preventDefault(); });
  bindLongPress(listView, ".cat-head", ".cat-grip, .cat-toggle, .cat-check", h => openBlockMenu(h.closest(".cat").dataset.cat));
  /* segurar um item abre a escolha de categoria (a mesma folha do ⋮) */
  bindLongPress(listView, ".item", ".check, .grip, .more", li => { try { document.activeElement.blur(); } catch(e){} openItemSheet(li.dataset.id); });
  bindLongPress($("homeBody"), ".lcard", null, c => openListCardMenu(c.dataset.open));
  listView.addEventListener("click", e => {
    const cc = e.target.closest(".cat-check"); if (cc) { toggleCat(cc.closest(".cat").dataset.cat); return; }
    const ck = e.target.closest(".check"); if (ck) { toggleItem(ck.closest(".item").dataset.id); return; }
    const row = e.target.closest(".item"); if (row && !S.readonly && !e.target.closest(".txt, .more, .grip, .check")) { try { document.activeElement.blur(); } catch(_){} openItemSheet(row.dataset.id); return; }
    const mo = e.target.closest(".more"); if (mo) { openItemSheet(mo.closest(".item").dataset.id); return; }
    const sa = e.target.closest("[data-sg]"); if (sa) { const sg = currentSuggestions.find(x => x.key === sa.dataset.sg); if (sg) addItem(sg.text, sg.cat); return; }
    const sx = e.target.closest("[data-sg-x]"); if (sx) { const l = S.lists.get(S.listId); if (l) write("lists", S.listId, {dismissed: [...new Set([...(l.dismissed||[]), sx.dataset.sgX])]}, "patch"); return; }
    if (e.target.closest('[data-act="sg-all"]')) { const list = currentSuggestions.slice(); list.forEach(sg => addItem(sg.text, sg.cat)); toast(list.length === 1 ? "1 item adicionado" : list.length + " itens adicionados"); return; }
    if (e.target.closest('[data-act="sg-hide"]')) { sgHidden.add(S.listId); render(); return; }
    const ab = e.target.closest(".add-in-cat"); if (ab) { addBlankInCat(ab.closest(".cat").dataset.cat); return; }
    const hd = e.target.closest(".cat-head"); if (hd && !e.target.closest(".cat-grip")) { toggleCollapse(hd.closest(".cat").dataset.cat); return; }
    if (e.target.closest('[data-act="focus-add"]')) { $("addInput").focus(); return; }
  });
  listView.addEventListener("input", e => { if (e.target.classList.contains("txt")) setDraft(e.target.dataset.itemId, e.target.value); });
  listView.addEventListener("keydown", e => {
    const t = e.target; if (!t.classList || !t.classList.contains("txt")) return;
    const id = t.dataset.itemId;
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault(); flushDraft(id);
      const it = S.items.get(id);
      if (!t.value.trim()) { t.blur(); return; }
      if (it && !it.checked) insertAfter(id); else t.blur();
    } else if (e.key === "Backspace" && t.value === "") {
      e.preventDefault();
      const li = t.closest(".item"); const prev = li.previousElementSibling;
      deleteItem(id, true);
      if (prev) { const pi = prev.querySelector(".txt"); pi.focus(); pi.setSelectionRange(pi.value.length, pi.value.length); }
    }
  });
  listView.addEventListener("focusout", e => {
    const t = e.target; if (!t.classList || !t.classList.contains("txt")) return;
    const id = t.dataset.itemId;
    flushDraft(id);
    const it = S.items.get(id);
    if (it && !(it.text||"").trim()) setTimeout(() => { const cur = S.items.get(id); const li = liMap.get(id); if (cur && !(cur.text||"").trim() && !(li && li.contains(document.activeElement))) deleteItem(id, true); }, 150);
  });

  $("addInput").addEventListener("input", updateAddChip);
  $("addInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submitAdd(); } });
  $("addInput").addEventListener("paste", e => {
    const txt = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    const lines = txt.split(/\r?\n/).map(s => s.replace(/^[\s\-•*·\d.)]+/, "").trim()).filter(Boolean);
    if (lines.length > 1) { e.preventDefault(); const all = lines.flatMap(l => splitItems(l)); const ids = all.map(l => addItem(l, null)).filter(Boolean); toast(ids.length + " itens adicionados", () => ids.forEach(id => deleteItem(id, true))); }
  });
  $("addCat").onclick = openAddCatSheet;
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushAll(); });
}
