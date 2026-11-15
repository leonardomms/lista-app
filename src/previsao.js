/* Previsão de gastos: funções puras, testadas em scripts/precos-test.mjs. */
/* ---- previsão: pura (sem S e sem imports), para testar; keyOf vem de fora. prices = registros {key, placeId, price, at}; placeFor(cat) = {def, fb} ---- */
const latest = (prices, key, placeId) => {
  let best = null;
  for (const p of prices) if (p.key === key && (placeId === undefined || p.placeId === placeId) && (!best || p.at >= best.at)) best = p;
  return best;
};
/* o registro mais recente do item vale, venha de nota ou da mão e de qualquer local; empate: local padrão, depois o alternativo; sem registro: null */
export function resolvePrice(key, def, fb, prices){
  const all = prices.filter(p => p.key === key); if (!all.length) return null;
  const top = Math.max(...all.map(p => p.at));
  const tie = all.filter(p => p.at === top);
  const p = tie.find(x => def && x.placeId === def) || tie.find(x => fb && x.placeId === fb) || tie[0];
  return p.price;
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
