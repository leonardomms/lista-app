/* Importar nota (NFC-e): funções puras, sem imports do app (testadas em scripts/nfce-match-test.mjs).
   Casar linhas da nota com os itens do app, achar o local do emissor e calcular o preço de cada linha. */

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const GLUE = new Set(["de", "do", "da", "dos", "das", "com", "sem", "para", "pra", "e", "em", "a", "o"]);
const UNIT = new Set(["kg", "g", "gr", "l", "lt", "ml", "un", "und", "unid", "cx", "pct", "pc", "dz", "fd"]);
/* palavras de nome de loja que não identificam ninguém ("Mercado", "Farmácia"...) */
const GENERIC = new Set(["mercado", "supermercado", "super", "mini", "minimercado", "loja", "lojas", "farmacia", "farmacias", "drogaria", "padaria", "acougue", "feira", "casa", "comercio", "ltda", "me", "sa", "eireli", "principal", "segundo", "outro", "novo"]);

/* "ARROZ TIO JOAO T1 5KG" -> ["arroz","tio","joao"]: sem acento, sem tamanhos/números, sem ligações */
export function tokens(s){
  return norm(s).split(" ").filter(t => t.length >= 2 && !/\d/.test(t) && !GLUE.has(t) && !UNIT.has(t));
}
const sing = t => t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
/* token da nota (r, muitas vezes abreviado) bate com token do item (c)? igual, plural, ou abreviação ("integ" -> "integral") */
function same(r, c){
  if (r === c || sing(r) === sing(c)) return true;
  return r.length >= 3 && r.length < c.length && c.startsWith(r);
}

/* pontua um candidato {key,label} contra a linha */
function score(rt, cand){
  const ct = cand._t || (cand._t = tokens(cand.key));
  if (!ct.length) return null;
  let matched = 0, first = false;
  for (const c of ct) {
    const i = rt.findIndex(r => same(r, c));
    if (i >= 0) { matched++; if (i === 0) first = true; }
  }
  if (!matched) return null;
  const full = matched === ct.length;
  if (!full && !(matched >= 2 && matched / ct.length >= 0.5)) return null;
  return {cand, full, matched, first, cover: matched / ct.length};
}
const better = (a, b) => (b.full - a.full) || (b.matched - a.matched) || (b.first - a.first) || (b.cover - a.cover);

/* candidatos ordenados do mais para o menos parecido com a linha (só os que pontuam) */
export function rank(line, candidates){
  const rt = tokens(line.name);
  return candidates.map(c => score(rt, c)).filter(Boolean).sort(better);
}
/* sugestão para uma linha da nota {code,name}:
   links = {"cnpj|código": chaveDoItem} (já confirmados antes); devolve {key, label, conf} com conf "lembrado" | "alta" | "media", ou null */
export function matchLine(line, candidates, links, cnpj){
  const lk = line.code && links && links[cnpj + "|" + line.code];
  if (lk) { const c = candidates.find(x => x.key === lk); return {key: lk, label: c ? c.label : lk, conf: "lembrado"}; }
  const r = rank(line, candidates); if (!r.length) return null;
  const top = r[0], rival = r.find(x => x.cand.key !== top.cand.key);
  const empate = rival && rival.full === top.full && rival.matched === top.matched;        // outro item igualmente parecido
  const conf = top.full && top.first && !empate ? "alta" : "media";
  return {key: top.cand.key, label: top.cand.label, conf};
}
export function matchAll(lines, candidates, links, cnpj){
  return lines.map(l => matchLine(l, candidates, links, cnpj));
}

/* preço do item em reais: total/qtde quando comprou mais de uma unidade, senão o total da linha. Desconto da nota não entra. */
export function linePrice(line){
  const cents = line.qty > 1 ? Math.round(line.total / line.qty) : line.total;
  return cents / 100;
}

const digits = s => String(s || "").replace(/\D/g, "");
export const findPlaceByCnpj = (places, cnpj) => (places || []).find(p => digits(p.cnpj) && digits(p.cnpj) === digits(cnpj)) || null;
/* local sem CNPJ cujo nome claramente é o do emissor ("Zaffari" x "COMPANHIA ZAFFARI COM E IND"): só se for um único */
export function suggestPlaceLink(places, issuerName){
  const it = tokens(issuerName);
  const hits = (places || []).filter(p => {
    if (digits(p.cnpj)) return false;
    const pt = tokens(p.name).filter(t => !GENERIC.has(t));
    return pt.length > 0 && pt.every(t => it.some(r => same(t, r) || same(r, t)));
  });
  return hits.length === 1 ? hits[0] : null;
}
/* "COMERCIO DE MEDICAMENTOS BRAIR LTDA" -> "Comercio de Medicamentos Brair Ltda" (cabe no campo de 40 letras) */
export function prettyName(s){
  const t = String(s || "").trim().toLowerCase().split(/\s+/).map((w, i) => i && GLUE.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return t.slice(0, 40).trim();
}

/* chave de 44 dígitos do que foi colado/lido (link, QR "?p=chave|2|...", ou a própria chave com espaços); null se não achar */
export function chaveDe(texto){
  const t = String(texto || "").trim();
  if (/^[\d\s.-]+$/.test(t)) { const d = digits(t); return d.length === 44 ? d : null; }
  const m = t.match(/(?:chaveNFe=|[?&]p=)(\d{44})/i) || t.match(/(?:^|\D)(\d{44})(?:\D|$)/);
  return m ? m[1] : null;
}
