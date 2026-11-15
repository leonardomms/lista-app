/* Itens de uma categoria: ver, renomear, mover, excluir e adicionar (todas as listas do ambiente). */
import { S, myCreated, esc } from "./estado.js";
import { write, newId } from "./dados.js";
import { openSheet, sheetHead, toast, deleteItem, nextOrderInCat, catPillsHTML } from "./ui.js";
import { catById, learn, splitItems, writeLearned, openCatManager } from "./categorias.js";
import { ICON_TRASH, ICON_CHECK } from "./icones.js";

const listName = l => (l && l.title) || "Lista sem nome";

export function openCatItems(cid){
  if (S.readonly) return;
  let sel = new Set(), moving = false, addList = null;
  const itemsIn = () => [...S.items].filter(([, it]) => it.cat === cid)
    .sort((a, b) => listName(S.lists.get(a[1].listId)).localeCompare(listName(S.lists.get(b[1].listId))) || (a[1].order || 0) - (b[1].order || 0));
  const openLists = () => [...S.lists].filter(([, l]) => !l.done);
  const pickList = () => {
    if (addList && S.lists.has(addList)) return addList;
    if (S.listId && S.lists.has(S.listId)) return S.listId;
    const o = openLists(); return o.length ? o[0][0] : ([...S.lists][0] || [])[0] || null;
  };
  const rows = () => {
    const its = itemsIn();
    if (!its.length) return `<p class="sub" style="padding:12px 4px">Nenhum item nesta categoria.</p>`;
    return its.map(([id, it]) => `<div class="ci-row" data-id="${esc(id)}">
      <button class="ci-sel" data-act="sel" aria-pressed="${sel.has(id)}" aria-label="Selecionar">${ICON_CHECK}</button>
      <div class="ci-main"><input class="ci-name" value="${esc(it.text || "")}" aria-label="Nome do item" autocomplete="off" enterkeyhint="done" maxlength="120"><span class="ci-list">${esc(listName(S.lists.get(it.listId)))}${it.checked ? " · riscado" : ""}</span></div>
    </div>`).join("");
  };
  const words = () => Object.entries(S.learned || {}).filter(([, c]) => c === cid).map(([k]) => k);
  const wordsHTML = () => { const w = words(); return w.length ? `<h5 class="ci-h">O app aprendeu</h5><div class="ci-words">${w.map(k => `<span class="ci-word">${esc(k)}<button data-act="forget" data-k="${esc(k)}" aria-label="Esquecer ${esc(k)}">×</button></span>`).join("")}</div>` : ""; };
  const foot = () => {
    if (moving) return `<div class="ci-bar"><span>Mover ${sel.size} para…</span><button class="btn" data-act="mv-cancel">Cancelar</button></div>`;
    if (sel.size) return `<div class="ci-bar"><span>${sel.size} ${sel.size === 1 ? "selecionado" : "selecionados"}</span><button class="btn" data-act="mv">Mover</button><button class="btn danger" data-act="rm">${ICON_TRASH} Excluir</button><button class="btn" data-act="clear" aria-label="Limpar seleção">×</button></div>`;
    const ls = [...S.lists]; if (!ls.length) return `<p class="sub">Crie uma lista para adicionar itens.</p>`;
    const cur = pickList();
    return `<form class="ci-add" data-form="add"><select id="ciList" aria-label="Lista">${ls.map(([id, l]) => `<option value="${esc(id)}"${id === cur ? " selected" : ""}>${esc(listName(l))}${l.done ? " · concluída" : ""}</option>`).join("")}</select><div class="newcat"><input id="ciNew" placeholder="Novo item em ${esc(catById(cid).name)}" autocomplete="off" aria-label="Novo item" maxlength="120"><button class="btn primary" type="submit">Adicionar</button></div></form>`;
  };
  const count = () => { const n = itemsIn().length; return `${n} ${n === 1 ? "item" : "itens"}`; };

  openSheet(`${sheetHead(esc(catById(cid).name), true)}<p class="sub" id="ciCount" style="margin-bottom:10px">${count()}</p>
    <div class="sh-scroll"><div id="ciBody"></div></div><div class="cm-foot" id="ciFoot"></div>`, body => {
    const bx = body.querySelector("#ciBody"), fx = body.querySelector("#ciFoot");
    const draw = () => {
      body.querySelector("#ciCount").textContent = count();
      bx.innerHTML = moving ? catPillsHTML(null) : rows() + wordsHTML();
      fx.innerHTML = foot();
    };
    draw();
    body.onclick = e => {
      const b = e.target.closest("[data-act],.catpill"); if (!b) return;
      const row = b.closest(".ci-row");
      if (b.classList.contains("catpill")) {
        const to = b.dataset.cat; if (to === cid) return;
        const ids = [...sel];
        ids.forEach(id => { const it = S.items.get(id); if (!it) return; write("items", id, {cat: to, order: nextOrderInCat(it.listId, to)}, "patch"); learn(it.text, to); });
        toast(`${ids.length} ${ids.length === 1 ? "item movido" : "itens movidos"} para ${catById(to).name}`);
        sel = new Set(); moving = false; draw(); return;
      }
      const a = b.dataset.act;
      if (a === "back") openCatManager();
      else if (a === "sel" && row) { const id = row.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); b.setAttribute("aria-pressed", String(sel.has(id))); fx.innerHTML = foot(); }
      else if (a === "clear") { sel = new Set(); draw(); }
      else if (a === "mv") { moving = true; draw(); }
      else if (a === "mv-cancel") { moving = false; draw(); }
      else if (a === "rm") {
        const copies = [...sel].map(id => [id, S.items.get(id)]).filter(x => x[1]).map(([id, it]) => [id, {...it}]);
        copies.forEach(([id]) => deleteItem(id, true));
        toast(`${copies.length} ${copies.length === 1 ? "item removido" : "itens removidos"}`, () => copies.forEach(([id, it]) => { myCreated.add(id); write("items", id, it, "set"); }));
        sel = new Set(); draw();
      }
      else if (a === "forget") { const L = {...S.learned}; delete L[b.dataset.k]; S.learned = L; writeLearned(); draw(); }
    };
    body.onchange = e => {
      if (e.target.id === "ciList") { addList = e.target.value; return; }
      if (!e.target.classList.contains("ci-name")) return;
      const id = e.target.closest(".ci-row").dataset.id, it = S.items.get(id); if (!it) return;
      const v = e.target.value.trim();
      if (v && v !== it.text) write("items", id, {text: v}, "patch"); else e.target.value = it.text || "";
    };
    body.onkeydown = e => { if (e.target.classList.contains("ci-name") && e.key === "Enter") { e.preventDefault(); e.target.blur(); } };
    body.onsubmit = e => {
      e.preventDefault();
      const inp = body.querySelector("#ciNew"), lid = body.querySelector("#ciList").value, v = inp.value.trim();
      if (!v || !S.lists.has(lid)) return;
      addList = lid;
      const parts = splitItems(v); const texts = parts.length > 1 ? parts : [v];
      texts.forEach(t => { const id = newId(); myCreated.add(id); write("items", id, {listId: lid, text: t, cat: cid, order: nextOrderInCat(lid, cid), checked: false, checkedAt: 0, createdAt: Date.now(), by: S.myId || null}, "set"); });
      if (S.lists.get(lid).done) write("lists", lid, {done: false}, "patch");
      draw(); const n = body.querySelector("#ciNew"); if (n) n.focus();
    };
  }, {tall: true});
}
