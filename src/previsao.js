/* Previsão de gastos: funções puras, testadas em scripts/precos-test.mjs. */
/* ---- previsão: pura (sem S e sem imports), para testar; keyOf vem de fora. prices = registros {key, placeId, price, at}; placeFor(cat) = {def, fb} ---- */
const latest = (prices, key, placeId) => {
  let best = null;
  for (const p of prices) if (p.key === key && (placeId === undefined || p.placeId === placeId) && (!best || p.at >= best.at)) best = p;
  return best;
};
/* 1) mais recente no local padrão, 2) no alternativo, 3) em qualquer local, 4) null */
export function resolvePrice(key, def, fb, prices){
  const p = (def && latest(prices, key, def)) || (fb && latest(prices, key, fb)) || latest(prices, key);
  return p ? p.price : null;
}
/* soma o que falta comprar (itens não riscados; preço da unidade × qty, que vale 1 se faltar); itens sem texto não contam; soma em centavos */
export function forecast(items, prices, placeFor, keyOf){
  let cents = 0, missing = 0;
  for (const it of items) {
    if (it.checked) continue;
    const key = keyOf(it.text); if (!key) continue;
    const { def, fb } = placeFor(it.cat);
    const p = resolvePrice(key, def, fb, prices);
    if (p == null) missing++; else cents += Math.round(p * 100) * (it.qty > 1 ? it.qty : 1);
  }
  return {total: cents / 100, missing};
}
