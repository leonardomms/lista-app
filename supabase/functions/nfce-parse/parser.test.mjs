/* node --test supabase/functions/nfce-parse/ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNfce, toCents, NfceParseError } from "./parser.js";

const html = readFileSync(new URL("./fixtures/nfce-rs-farmacia.html", import.meta.url), "utf8");
const nota = parseNfce(html);

test("emissor", () => {
  assert.equal(nota.issuer.cnpj, "88212113041981");
  assert.equal(nota.issuer.name, "COMERCIO DE MEDICAMENTOS BRAIR LTDA");
  assert.match(nota.issuer.address, /OSVALDO ARANHA.*VENANCIO AIRES, RS/);
});
test("data e chave", () => {
  assert.equal(nota.date, "2026-11-07T09:55:34-03:00");
  assert.equal(nota.accessKey, "43261188212113041981650060000080771653267769");
});
test("itens: quantidade, campos e centavos inteiros", () => {
  assert.equal(nota.items.length, 8);
  assert.deepEqual(nota.items[0], {code: "100013947", name: "LACTOSIL 10000 FCC 30CP APSEN", qty: 3, unit: "UN", unitPrice: 5489, total: 16467});
  assert.equal(nota.items[5].unitPrice, 1090);   // "10,9" (uma casa) vira 1090
  for (const i of nota.items) assert.ok(Number.isInteger(i.unitPrice) && Number.isInteger(i.total));
});
test("soma dos itens = total; desconto à parte", () => {
  assert.equal(nota.items.reduce((s, i) => s + i.total, 0), nota.total);
  assert.equal(nota.total, 54676);
  assert.equal(nota.discount, 15905);
});
test("não vaza dados do consumidor", () => {
  const out = JSON.stringify(nota);
  assert.doesNotMatch(out, /CPF|CONSUMIDOR|\d{3}\.\d{3}\.\d{3}-\d{2}/);
});
test("falha alto quando o layout muda", () => {
  assert.throws(() => parseNfce("<html>nada</html>"), NfceParseError);
  assert.throws(() => parseNfce(html.replace(/id="Item \+ \d+"/g, 'id="x"')), /layout changed: nenhum item/);
  assert.throws(() => parseNfce(html.replace("Valor total R$", "Total")), /layout changed: valor total/);
  assert.throws(() => parseNfce(html.replace(/CNPJ:/, "Doc:")), /layout changed: CNPJ/);
  assert.throws(() => parseNfce(html.replace(">164,67<", ">164,68<")), /soma dos itens/);
  assert.throws(() => parseNfce(html.replace("CHAVE DE ACESSO", "CHAVE")), /chave de acesso/);
});
test("chave inexistente (página vazia) não é layout changed", () => {
  const vazia = "<html><title>Consulta Completa da NFC-e</title><body>Administração Tributária</body></html>";
  assert.throws(() => parseNfce(vazia), e => e.code === "not_found");
});
test("toCents", () => {
  assert.equal(toCents("1.234,50", "x"), 123450);
  assert.equal(toCents("0,99", "x"), 99);
  assert.equal(toCents("10", "x"), 1000);
  assert.throws(() => toCents("abc", "x"), /layout changed/);
});
