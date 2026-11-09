/* Locais de compra (mercado, feira, farmácia...) e o local padrão/alternativo de cada categoria.
   Por ambiente, guardado junto com as categorias. Não aparece na lista; a tela fica em Categorias. */
import { S, $, esc } from "./estado.js";
import { saveLocal, writeEnvConfig } from "./dados.js";
import { openSheet } from "./ui.js";
import { allCats } from "./categorias.js";

/* exemplos até alguém editar (S.places / S.catPlaces == null) */
export const DEFAULT_PLACES = [
  {id:"mercado",  name:"Mercado principal", cnpj:""},
  {id:"mercado2", name:"Segundo mercado",   cnpj:""},
  {id:"feira",    name:"Feira",             cnpj:""},
  {id:"farmacia", name:"Farmácia",          cnpj:""}
];
export const DEFAULT_CAT_PLACES = {fruteira: {def:"feira", fb:"mercado"}};

export const placesList = () => Array.isArray(S.places) ? S.places : DEFAULT_PLACES;
export const placeById = id => placesList().find(p => p.id === id) || null;
/* local da categoria: {def, fb} com ids válidos; sem escolha, o padrão é o primeiro local da lista */
export function placeFor(catId){
  const m = S.catPlaces || DEFAULT_CAT_PLACES, c = m[catId] || {};
  const def = placeById(c.def) ? c.def : (placesList()[0] || {}).id || null;
  const fb = c.fb && c.fb !== def && placeById(c.fb) ? c.fb : null;
  return {def, fb};
}

function save(){
  if (S.readonly) return;
  if (S.mode !== "remote") { saveLocal(); return; }
  writeEnvConfig({places: S.places, cat_places: S.catPlaces});
}
const mat = () => { if (!Array.isArray(S.places)) S.places = DEFAULT_PLACES.map(p => ({...p})); if (!S.catPlaces) S.catPlaces = JSON.parse(JSON.stringify(DEFAULT_CAT_PLACES)); };

/* usadas por "Importar nota" (src/nfce.js) */
export function addPlace(name, cnpj){
  mat(); const p = {id: "p-" + Math.random().toString(36).slice(2, 8), name, cnpj: cnpj || ""};
  S.places = S.places.concat(p); save(); return p;
}
export function setPlaceCnpj(id, cnpj){ mat(); S.places = S.places.map(p => p.id === id ? {...p, cnpj} : p); save(); }

export function openLocais(){
  if (S.readonly) return;
  const opts = (sel, empty) => `<option value="">${empty}</option>` + placesList().map(p => `<option value="${esc(p.id)}"${p.id === sel ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  const body = () => `<h4>Locais de compra</h4><p class="sub">Onde cada categoria costuma ser comprada. Não muda a lista.</p>
    <div class="catrows" id="plRows">${placesList().map(p => `<div class="catrow plrow" data-pl="${esc(p.id)}">
      <input class="catname plname" value="${esc(p.name)}" aria-label="Nome do local" maxlength="40" autocomplete="off">
      <input class="plcnpj" value="${esc(p.cnpj || "")}" placeholder="CNPJ (opcional)" aria-label="CNPJ" inputmode="numeric" maxlength="18" autocomplete="off">
      <button class="del" data-act="pdel" aria-label="Excluir ${esc(p.name)}">×</button></div>`).join("")}</div>
    <form class="newcat" data-form="newpl"><input id="newPlName" placeholder="Novo local" aria-label="Novo local" maxlength="40" autocomplete="off"><button class="btn primary" type="submit">Criar</button></form>
    <p class="sub sect" style="margin-top:18px">POR CATEGORIA</p>
    <div class="catrows" id="cpRows">${allCats().map(c => { const p = placeFor(c.id); return `<div class="catrow cprow" data-cat="${esc(c.id)}">
      <span class="cpname">${esc(c.name)}</span>
      <select data-k="def" aria-label="Local padrão de ${esc(c.name)}">${opts(p.def, "—")}</select>
      <select data-k="fb" aria-label="Alternativo de ${esc(c.name)}">${opts(p.fb, "sem alternativo")}</select></div>`; }).join("")}</div>`;
  openSheet(body(), sheet => {
    const redraw = () => { sheet.innerHTML = body(); };
    sheet.onchange = e => {
      const t = e.target, row = t.closest("[data-pl],[data-cat]"); if (!row) return;
      mat();
      if (row.dataset.pl) {
        const p = S.places.find(x => x.id === row.dataset.pl); if (!p) return;
        if (t.classList.contains("plname")) { const v = t.value.trim(); if (v) p.name = v; else t.value = p.name; }
        else p.cnpj = t.value.trim();
        S.places = S.places.map(x => ({...x}));
        save();
        if (t.classList.contains("plname")) redraw();
      } else if (t.dataset.k) {
        const c = row.dataset.cat, cur = placeFor(c);
        const next = {...cur, [t.dataset.k]: t.value || null};
        if (next.fb === next.def) next.fb = null;
        S.catPlaces = {...S.catPlaces, [c]: next};
        save(); redraw();
      }
    };
    sheet.onclick = e => {
      const b = e.target.closest('[data-act="pdel"]'); if (!b) return;
      const id = b.closest("[data-pl]").dataset.pl;
      mat();
      S.places = S.places.filter(p => p.id !== id);
      const m = {}; for (const [c, v] of Object.entries(S.catPlaces)) m[c] = {def: v.def === id ? null : v.def, fb: v.fb === id ? null : v.fb};
      S.catPlaces = m; save(); redraw();
    };
    sheet.onsubmit = e => {
      if (e.target.dataset.form !== "newpl") return;
      e.preventDefault(); const inp = $("newPlName"), name = inp.value.trim(); if (!name) return;
      mat();
      S.places = S.places.concat({id: "p-" + Math.random().toString(36).slice(2, 8), name, cnpj: ""});
      save(); redraw();
    };
  });
}
