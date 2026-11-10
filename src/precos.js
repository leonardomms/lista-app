/* Preço por item e local. Cada preço informado é um registro novo em S.prices (nunca sobrescreve):
   {key (keyOf do item), placeId (local padrão da categoria), price, at}. Entra pela faixa que aparece ao riscar
   (ignorar não custa nada) e pode ser corrigido ou apagado na folha do item. */
import { S, $, esc } from "./estado.js";
import { write, newId } from "./dados.js";
import { keyOf } from "./categorias.js";
import { placeFor, placeById } from "./locais.js";
import { resolvePrice, forecast } from "./previsao.js";
export { resolvePrice, forecast };

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

/* valores sutis na lista (por item e por categoria); ligado por padrão, escolha guardada no aparelho */
const VAL_KEY = "lista-valores-v1";
export const valoresOn = () => { try { return localStorage.getItem(VAL_KEY) !== "0"; } catch(e){ return true; } };
export const setValoresOn = on => { try { localStorage.setItem(VAL_KEY, on ? "1" : "0"); } catch(e){} };
const num = n => Number(n).toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const priceOf = it => { const key = keyOf(it.text); if (!key) return null; const { def, fb } = placeFor(it.cat); return resolvePrice(key, def, fb, [...S.prices.values()]); };
export function itemValor(it){ const p = priceOf(it); return p == null ? "" : num(p); }
/* soma de todos os itens da categoria (riscados ou não) que têm preço */
/* estimativa da lista toda: soma dos itens com preço (riscados ou não) e quantos ficaram sem preço */
export function listaValor(arr){
  const all = [...S.prices.values()]; let c = 0, n = 0, falta = 0;
  for (const it of arr) { const key = keyOf(it.text); if (!key) continue; const { def, fb } = placeFor(it.cat); const p = resolvePrice(key, def, fb, all); if (p == null) falta++; else { c += Math.round(p * 100); n++; } }
  return {text: n ? "R$ " + num(c / 100) : "", falta};
}
export function catValor(arr){
  const all = [...S.prices.values()]; let c = 0, n = 0;
  for (const it of arr) { const key = keyOf(it.text); if (!key) continue; const { def, fb } = placeFor(it.cat); const p = resolvePrice(key, def, fb, all); if (p != null) { c += Math.round(p * 100); n++; } }
  return n ? "R$ " + num(c / 100) : "";
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

/* ---- folha do item: definir o preço à mão (vale mais que o das notas, pois é o registro mais novo), corrigir ou apagar o último ---- */
export function priceSheetHTML(it){
  const key = keyOf(it.text); if (!key || S.readonly) return "";
  const last = pricesOf(key)[0];
  const pl = last && placeById(last.placeId);
  return `<form class="priceedit" data-form="price"><span class="pe-l">${last ? "Preço" + (pl ? " · " + esc(pl.name) : "") : "Definir preço"}</span>
    <input inputmode="decimal" autocomplete="off" placeholder="R$" aria-label="Preço" value="${last ? last.price.toFixed(2).replace(".", ",") : ""}"><button class="btn" type="submit">Salvar</button>${last ? `<button class="btn ghost" type="button" data-act="del-price">Apagar</button>` : ""}</form>`;
}
export function bindPriceSheet(body, it, close){
  const f = body.querySelector('[data-form="price"]'); if (!f) return;
  const last = pricesOf(keyOf(it.text))[0];
  f.onsubmit = e => {
    e.preventDefault();
    const p = parsePreco(f.querySelector("input").value);
    if (p && (!last || p !== last.price)) salvar(it, f.querySelector("input").value);   // registro novo e mais recente: passa na frente do preço da nota; os antigos ficam
    close();
  };
  const del = f.querySelector('[data-act="del-price"]');
  if (del) del.onclick = () => { write("prices", last.id, null, "del"); close(); };
}
