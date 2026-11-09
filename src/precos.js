/* Preço por item e local. Cada preço informado é um registro novo em S.prices (nunca sobrescreve):
   {key (keyOf do item), placeId (local padrão da categoria), price, at}. Entra pela faixa que aparece ao riscar
   (ignorar não custa nada) e pode ser corrigido ou apagado na folha do item. */
import { S, $, esc } from "./estado.js";
import { write, newId } from "./dados.js";
import { keyOf } from "./categorias.js";
import { placeFor, placeById } from "./locais.js";

export const fmt = n => "R$ " + Number(n).toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
/* "4,99", "R$ 1.234,50" e "4.99" viram número; inválido vira null */
export function parsePreco(s){
  let t = String(s || "").replace(/[^\d.,]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Math.round(parseFloat(t) * 100) / 100;
  return n > 0 && n < 1e7 ? n : null;
}
/* registros do item, do mais novo para o mais antigo */
export function pricesOf(key){
  const out = [];
  for (const [id, p] of S.prices) if (p.key === key) out.push({id, ...p});
  return out.sort((a, b) => b.at - a.at);
}
/* último preço conhecido: no local pedido, senão em qualquer local */
export function lastPrice(key, placeId){
  const l = pricesOf(key);
  return l.find(p => p.placeId === placeId) || l[0] || null;
}

function salvar(it, v){
  const key = keyOf(it.text), p = parsePreco(v); if (!key || !p) return false;
  write("prices", newId(), {key, placeId: placeFor(it.cat).def, price: p, at: Date.now()}, "set");
  return true;
}

/* ---- faixa ao riscar: já vem com o último preço; "OK" confirma em um toque, ignorar não pede nada ---- */
let bar = null, barT = null, barItem = null;
export function hidePriceBar(id){
  if (id && barItem !== id) return;
  clearTimeout(barT); barItem = null;
  if (bar) bar.classList.remove("on");
}
export function askPrice(id){
  const it = S.items.get(id); if (!it || S.readonly) return;
  const key = keyOf(it.text); if (!key) return;
  const last = lastPrice(key, placeFor(it.cat).def);
  if (!bar) {
    bar = document.createElement("div"); bar.className = "pricebar"; bar.setAttribute("role", "group");
    $("toast").after(bar);
  }
  barItem = id;
  bar.innerHTML = `<span class="pb-t">${esc(it.text)}</span><input inputmode="decimal" autocomplete="off" placeholder="R$ preço" aria-label="Preço de ${esc(it.text)}" value="${last ? String(last.price.toFixed(2)).replace(".", ",") : ""}"><button class="pb-ok" aria-label="Salvar preço">OK</button><button class="pb-x" aria-label="Ignorar">×</button>`;
  const inp = bar.querySelector("input");
  const arm = ms => { clearTimeout(barT); barT = setTimeout(() => hidePriceBar(), ms); };
  inp.onfocus = () => clearTimeout(barT);
  inp.oninput = () => clearTimeout(barT);
  inp.onblur = () => arm(4000);
  inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); bar.querySelector(".pb-ok").click(); } };
  bar.querySelector(".pb-ok").onclick = () => { const cur = S.items.get(id); if (cur && inp.value.trim()) salvar(cur, inp.value); hidePriceBar(); };
  bar.querySelector(".pb-x").onclick = () => hidePriceBar();
  bar.classList.add("on"); arm(6000);
}

/* ---- folha do item: último preço, corrigir ou apagar ---- */
export function priceSheetHTML(it){
  const key = keyOf(it.text); if (!key) return "";
  const last = pricesOf(key)[0]; if (!last) return "";
  const pl = placeById(last.placeId);
  return `<form class="priceedit" data-form="price"><span class="pe-l">Último preço${pl ? " · " + esc(pl.name) : ""}</span>
    <input inputmode="decimal" autocomplete="off" aria-label="Preço" value="${last.price.toFixed(2).replace(".", ",")}"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-act="del-price">Apagar</button></form>`;
}
export function bindPriceSheet(body, it, close){
  const f = body.querySelector('[data-form="price"]'); if (!f) return;
  const last = pricesOf(keyOf(it.text))[0]; if (!last) return;
  f.onsubmit = e => {
    e.preventDefault();
    const p = parsePreco(f.querySelector("input").value);
    if (p && p !== last.price) write("prices", last.id, {price: p}, "patch");   // corrige o registro errado; os antigos ficam
    close();
  };
  f.querySelector('[data-act="del-price"]').onclick = () => { write("prices", last.id, null, "del"); close(); };
}
