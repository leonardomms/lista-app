/* node scripts/precos-test.mjs — testa a resolução de preço e a previsão (funções puras de src/previsao.js) */
import assert from "node:assert/strict";
import { resolvePrice, forecast } from "../src/previsao.js";
const keyOf = t => t.toLowerCase().split(" ").filter(x => x && !/^\d/.test(x) && !["de","kg"].includes(x)).join(" ").replace("pão","pao");

const P = (key, placeId, price, at) => ({key, placeId, price, at});
const prices = [P("leite", "mercado", 5, 1), P("leite", "mercado", 6, 2), P("leite", "feira", 4, 3),
  P("banana", "mercado", 7, 1), P("arroz", "farmacia", 20, 1)];

assert.equal(resolvePrice("leite", "mercado", "feira", prices), 6, "padrão: o mais recente do local");
assert.equal(resolvePrice("leite", "farmacia", "feira", prices), 4, "alternativo");
assert.equal(resolvePrice("arroz", "mercado", "feira", prices), 20, "qualquer local");
assert.equal(resolvePrice("pao", "mercado", "feira", prices), null, "sem preço");
assert.equal(resolvePrice("leite", null, null, prices), 4, "sem locais: o mais recente de qualquer um");

const pf = () => ({def: "mercado", fb: "feira"});
const items = [{text: "Leite", cat: "x"}, {text: "2 kg de arroz", cat: "x"}, {text: "Pão", cat: "x"}, {text: "Banana", cat: "x", checked: true}, {text: "", cat: "x"}];
assert.deepEqual(forecast(items, prices, pf, keyOf), {total: 26, missing: 1}, "soma só os não riscados; 1 sem preço; vazio ignorado");
assert.deepEqual(forecast([{text: "Leite", cat: "x"}, {text: "Leite", cat: "x"}], [P("leite", "mercado", 0.1, 1)].concat([P("leite", "mercado", 0.2, 2)]), pf, keyOf), {total: 0.4, missing: 0}, "centavos sem erro de float");
console.log("ok");
