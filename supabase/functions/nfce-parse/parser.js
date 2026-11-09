/* Parser puro da página "Consulta Completa da NFC-e" da Sefaz RS (SAT-WEB-NFE-NFC_2.asp).
   Sem rede e sem imports: roda no Deno (Edge Function) e no Node (testes). Recebe o HTML já decodificado (iso-8859-1).
   Não lê nem devolve o bloco do consumidor (CPF/nome). Se um marcador esperado não existir, lança "layout changed". */

export class NfceParseError extends Error {
  constructor(what) { super("layout changed: " + what); this.name = "NfceParseError"; this.code = "layout_changed"; }
}

const ENT = {"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"};
const limpa = h => h.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, m => ENT[m]).replace(/\s+/g, " ").trim();
const need = (v, what) => { if (v == null || v === "") throw new NfceParseError(what); return v; };

/* "1.234,50" -> 123450 ; "10,9" -> 1090 ; inválido -> erro */
export function toCents(s, what) {
  const t = String(s).trim();
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^\d+(?:,\d+)?$/.test(t)) throw new NfceParseError("valor inválido em " + what);
  return Math.round(parseFloat(t.replace(/\./g, "").replace(",", ".")) * 100);
}
const toQty = (s, what) => {
  const t = String(s).trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(t)) throw new NfceParseError("quantidade inválida em " + what);
  return parseFloat(t.replace(",", "."));
};

export function parseNfce(html) {
  if (typeof html === "string" && !html.includes("CONSULTA DA NFC-e") && html.includes("Consulta Completa da NFC-e") && !html.includes("<form")) {
    throw Object.assign(new Error("nota não encontrada na Sefaz"), {name: "NfceParseError", code: "not_found"});   // chave inexistente: página vazia
  }
  if (typeof html !== "string" || !html.includes("CONSULTA DA NFC-e")) throw new NfceParseError("página não é a consulta da NFC-e");

  /* emissor */
  const name = limpa(need((html.match(/<td[^>]*class="NFCCabecalho_SubTitulo"[^>]*>([^<]+)<\/td>/) || [])[1], "nome do emissor"));
  const cnpjRaw = need((html.match(/CNPJ:\s*([\d.\/-]{14,18})/) || [])[1], "CNPJ do emissor");
  const cnpj = cnpjRaw.replace(/\D/g, "");
  if (cnpj.length !== 14) throw new NfceParseError("CNPJ do emissor");
  const addr = [...html.matchAll(/<td[^>]*class="NFCCabecalho_SubTitulo1"[^>]*>([\s\S]*?)<\/td>/g)].map(m => limpa(m[1])).find(t => t && !/CNPJ/.test(t)) || "";

  /* data (RS: UTC-3, sem horário de verão) e chave */
  const d = need(html.match(/Data de Emiss(?:ão|&atilde;o|ao):\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/), "data de emissão");
  const date = `${d[3]}-${d[2]}-${d[1]}T${d[4]}:${d[5]}:${d[6]}-03:00`;
  const accessKey = need((html.match(/CHAVE DE ACESSO[\s\S]*?<td[^>]*>\s*((?:\d{4}\s*){11})\s*<\/td>/) || [])[1], "chave de acesso").replace(/\s/g, "");
  if (accessKey.length !== 44) throw new NfceParseError("chave de acesso");

  /* itens: <tr id="Item + N"> com 6 células: código, descrição, qtde, un, vl unit, vl total */
  const items = [];
  for (const m of html.matchAll(/<tr[^>]*id="Item \+ \d+"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => limpa(x[1]));
    if (c.length !== 6) throw new NfceParseError("item com " + c.length + " colunas (esperado 6)");
    const n = items.length + 1;
    items.push({code: c[0], name: need(c[1], "nome do item " + n), qty: toQty(c[2], "qtde do item " + n), unit: c[3], unitPrice: toCents(c[4], "vl unit do item " + n), total: toCents(c[5], "vl total do item " + n)});
  }
  if (!items.length) throw new NfceParseError("nenhum item");

  /* totais */
  const row = label => { const r = html.match(new RegExp(label + "\\s*R\\$\\s*<\\/td>\\s*<td[^>]*>\\s*([\\d.,]+)\\s*<\\/td>", "i")); return r ? toCents(r[1], label) : null; };
  const total = row("Valor total"); if (total == null) throw new NfceParseError("valor total");
  const discount = row("Valor descontos") ?? 0;
  const soma = items.reduce((s, i) => s + i.total, 0);
  if (soma !== total) throw new NfceParseError(`soma dos itens (${soma}) difere do valor total (${total})`);

  return {issuer: {cnpj, name, address: addr}, date, accessKey, items, total, discount};
}
