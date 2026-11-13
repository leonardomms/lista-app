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
  return n ? num(c / 100) : "";
}

function salvar(it, v){
  const key = keyOf(it.text), p = parsePreco(v); if (!key || !p) return false;
  write("prices", newId(), {key, placeId: placeFor(it.cat).def, price: p, at: Date.now()}, "set");
  return true;
}

/* ---- folha do item: definir o preço à mão (vale mais que o das notas, pois é o registro mais novo), corrigir ou apagar o último ---- */
export function priceSheetHTML(it){
  const key = keyOf(it.text); if (!key || S.readonly) return "";
  const last = pricesOf(key)[0];
  const pl = last && placeById(last.placeId);
  return `<p class="sect">Preço</p><form class="priceedit" data-form="price"><label class="pricefield"><span>R$</span><input inputmode="decimal" autocomplete="off" placeholder="0,00" aria-label="Preço em reais (aceita 3,39 ou 3.39)" value="${last ? last.price.toFixed(2).replace(".", ",") : ""}"></label><button class="btn primary" type="submit">Salvar</button></form>${pl ? `<p class="price-hint">${esc(pl.name)}</p>` : ""}`;
}
export function bindPriceSheet(body, it, close){
  const f = body.querySelector('[data-form="price"]'); if (!f) return;
  const last = pricesOf(keyOf(it.text))[0];
  f.onsubmit = e => {
    e.preventDefault();
    const p = parsePreco(f.querySelector("input").value);
    if (!p && last && !f.querySelector("input").value.trim()) write("prices", last.id, null, "del");   // campo vazio + Salvar apaga o último preço
    else if (p && (!last || p !== last.price)) salvar(it, f.querySelector("input").value);   // registro novo e mais recente: passa na frente do preço da nota; os antigos ficam
    close();
  };
}
