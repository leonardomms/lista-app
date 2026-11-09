/* node scripts/nfce-match-test.mjs — testa o casamento das linhas da nota (funções puras de src/nfcematch.js) */
import assert from "node:assert/strict";
import { tokens, matchLine, matchAll, rank, linePrice, findPlaceByCnpj, suggestPlaceLink, prettyName, chaveDe } from "../src/nfcematch.js";

const C = k => ({key: k, label: k});
const cands = ["arroz", "feijao", "leite", "leite condensado", "leite integral", "papel higienico", "sabao em po", "banana", "ovos", "pao"].map(C);
const L = (name, code = "1") => ({code, name});

assert.deepEqual(tokens("ARROZ TIO JOAO T1 5KG"), ["arroz", "tio", "joao"], "tira tamanhos, números e unidades");
assert.deepEqual(tokens("Feijão Preto c/ 1KG"), ["feijao", "preto"]);

const m = (name, links = {}) => matchLine(L(name, name), cands, links, "123");
assert.deepEqual(m("ARROZ TIO JOAO T1 5KG"), {key: "arroz", label: "arroz", conf: "alta"});
assert.equal(m("FEIJAO PRETO CAMIL 1KG").key, "feijao");
assert.equal(m("LEITE UHT PARMALAT 1L").key, "leite", "leite simples");
assert.equal(m("LEITE UHT INTEG PARMALAT 1L").key, "leite integral", "abreviação INTEG e item mais específico");
assert.equal(m("LEITE COND MOCOCA 395G").key, "leite condensado", "COND -> condensado");
assert.equal(m("PAPEL HIG FOLHA DUPLA 12UN").key, "papel higienico", "HIG -> higienico");
assert.equal(m("OVO BRANCO GRANDE C/12").key, "ovos", "singular x plural");
assert.equal(m("BANANA PRATA KG").conf, "alta");
assert.equal(m("DETERGENTE YPE 500ML"), null, "sem parecido: não sugere");
assert.equal(m("PAOZINHO FRANCES KG"), null, "pao não casa com paozinho");
assert.equal(m("SALSICHA HOT DOG"), null);

/* confiança média: casou, mas não pelo começo do nome ou há empate */
assert.equal(m("BISCOITO RECHEADO LEITE").conf, "media", "casou só no meio do nome");
assert.equal(matchLine(L("LEITE ACHOCOLATADO"), [C("leite"), C("achocolatado")], {}, "1").conf, "media", "empate entre dois itens");
assert.equal(matchLine(L("LEITE ACHOCOLATADO"), [C("leite"), C("achocolatado")], {}, "1").key, "leite", "empate: o que começa a frase");

/* vínculo lembrado vale mais que o nome, mesmo sem parecido; é por CNPJ + código */
const links = {"123|77": "banana"};
assert.deepEqual(matchLine(L("XPTO SEM NADA", "77"), cands, links, "123"), {key: "banana", label: "banana", conf: "lembrado"});
assert.equal(matchLine(L("XPTO SEM NADA", "77"), cands, links, "999"), null, "outro emissor não herda o vínculo");
assert.equal(matchLine(L("ARROZ TIO JOAO", "77"), cands, links, "123").key, "banana", "o vínculo manda");
assert.equal(matchLine(L("XPTO", "88"), [], {"123|88": "chocolate"}, "123").key, "chocolate", "vínculo vale mesmo se o item não está mais na lista");
assert.deepEqual(matchAll([L("ARROZ X", "1"), L("DETERGENTE", "2")], cands, {}, "1").map(x => x && x.key), ["arroz", null]);
assert.equal(rank(L("LEITE COND"), cands)[0].cand.key, "leite condensado");

/* preço: total/qtde quando qtde > 1; senão o total; centavos sem erro de float */
assert.equal(linePrice({qty: 3, total: 16467}), 54.89);
assert.equal(linePrice({qty: 1, total: 1090}), 10.9);
assert.equal(linePrice({qty: 0.532, total: 425}), 4.25, "pesável (qtde < 1): o total da linha");
assert.equal(linePrice({qty: 2.5, total: 1999}), 8, "arredonda para o centavo");

/* local */
const places = [{id: "a", name: "Zaffari", cnpj: ""}, {id: "b", name: "Farmácia", cnpj: ""}, {id: "c", name: "Mercado principal", cnpj: ""}, {id: "d", name: "Carrefour", cnpj: "45.543.915/0001-81"}];
assert.equal(findPlaceByCnpj(places, "45543915000181").id, "d", "CNPJ com ou sem pontuação");
assert.equal(findPlaceByCnpj(places, "00000000000000"), null);
assert.equal(findPlaceByCnpj([{id: "x", name: "x", cnpj: ""}], ""), null, "CNPJ vazio nunca casa");
assert.equal(suggestPlaceLink(places, "COMPANHIA ZAFFARI COMERCIO E INDUSTRIA").id, "a");
assert.equal(suggestPlaceLink(places, "COMERCIO DE MEDICAMENTOS BRAIR LTDA"), null, "só 'Farmácia' não basta");
assert.equal(suggestPlaceLink(places, "MERCADO PRINCIPAL DO ZE LTDA"), null, "nome genérico não conta");
assert.equal(suggestPlaceLink(places, "CARREFOUR COMERCIO E INDUSTRIA LTDA"), null, "local que já tem CNPJ não é oferecido");
assert.equal(suggestPlaceLink([...places, {id: "e", name: "Zaffari Centro", cnpj: ""}], "ZAFFARI CENTRO LTDA"), null, "mais de um possível: não adivinha");
assert.equal(prettyName("COMERCIO DE MEDICAMENTOS BRAIR LTDA"), "Comercio de Medicamentos Brair Ltda");
assert.ok(prettyName("A".repeat(80)).length <= 40);

/* chave */
const K = "43261188212113041981650060000080771653267769";
assert.equal(chaveDe(K), K);
assert.equal(chaveDe(K.replace(/(.{4})/g, "$1 ")), K, "chave com espaços");
assert.equal(chaveDe(`https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${K}|2|1|1|ABCDEF`), K, "QR ?p=chave|2|...");
assert.equal(chaveDe(`https://www.sefaz.rs.gov.br/x?chaveNFe=${K}&a=1`), K);
assert.equal(chaveDe("12345"), null);
assert.equal(chaveDe("olá"), null);
console.log("ok");
