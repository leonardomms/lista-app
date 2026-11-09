/* Importar nota (NFC-e do RS): lê o QR ou o link/chave, chama a Edge Function nfce-parse, casa as linhas com os itens do app
   (src/nfcematch.js, puro) e grava os preços em S.prices pelo mesmo caminho do Estágio 2 (write → fila offline, cache, Realtime).
   Memória por ambiente em S.nfce: vínculos "cnpj|código → item" e chaves de acesso já importadas. Nada do consumidor é lido nem guardado.
   Ler a nota precisa de internet; gravar depois usa a fila e funciona offline. */
import { S, esc } from "./estado.js";
import { write, newId } from "./dados.js";
import { openSheet, closeSheet, toast } from "./ui.js";
import { keyOf } from "./categorias.js";
import { placesList, addPlace, setPlaceCnpj } from "./locais.js";
import * as D from "./data.js";
import { fmt } from "./precos.js";
import { temCamera, lerQR } from "./qr.js";
import { chaveDe, matchAll, rank, linePrice, findPlaceByCnpj, suggestPlaceLink, prettyName } from "./nfcematch.js";

const ERROS = {
  offline: "Sem internet. Para ler a nota é preciso estar online.",
  unauthorized: "Sua sessão venceu. Saia da conta e entre de novo.",
  invalid_url: "Só leio notas do RS: link da Sefaz ou chave de 44 dígitos.",
  not_found: "A Sefaz não achou essa nota. Confira o código; nota muito recente pode demorar para aparecer.",
  layout_changed: "A Sefaz mudou a página e o app ainda não sabe ler essa nota.",
  sefaz_unreachable: "Não consegui falar com a Sefaz agora. Tente de novo daqui a pouco.",
  sefaz_error: "A Sefaz não respondeu direito agora. Tente de novo daqui a pouco.",
  key_mismatch: "A Sefaz devolveu outra nota. Tente de novo.",
  internal: "Não deu para ler a nota."
};
const refId = (kind, ref) => `${S.env}|${kind}|${ref}`;
const jaImportada = chave => S.nfce.has(refId("r", chave));
const fmtCnpj = d => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const dataBR = iso => new Date(iso).toLocaleDateString("pt-BR");

/* itens que o app conhece (lista, histórico de compras e preços), com o nome como foi digitado quando existe */
function candidatos(){
  const m = new Map();
  const add = (k, label) => { if (k && !m.has(k)) m.set(k, (label || "").trim() || k); };
  for (const it of S.items.values()) add(keyOf(it.text), it.text);
  for (const h of S.history.values()) for (const x of (h && h.items) || []) add(x.k, x.text);
  for (const p of S.prices.values()) add(p.key, "");
  return [...m].map(([key, label]) => ({key, label}));
}
/* vínculos já confirmados: {"cnpj|código": chaveDoItem} */
function vinculos(){
  const out = {};
  for (const r of S.nfce.values()) if (r.kind === "link" && r.key) out[r.ref] = r.key;
  return out;
}

const HINT = {lembrado: "lembrado", alta: "provável", media: "confira", manual: "escolhido"};

export function openImportar(){
  if (S.readonly || S.mode !== "remote") return;
  let nota = null, lugar = null, rows = [], cands = [], stopCam = null, pickI = -1;
  const sheet = () => document.getElementById("sheetBody");
  const parar = () => { if (stopCam) { stopCam(); stopCam = null; } };
  let h = null;      // o handler de clique identifica este sheet: se fechou ou abriu outro, respostas atrasadas não desenham nada
  const vivo = () => h && sheet().onclick === h && document.getElementById("sheet").classList.contains("on");

  /* ---- 1) entrada: câmera ou colar ---- */
  const startHTML = msg => `<h4>Importar nota</h4>
    <p class="sub">Atualiza os preços com a nota fiscal da compra (NFC-e do RS). Leia o QR ou cole o link ou a chave de 44 dígitos.</p>
    ${temCamera() ? `<button class="btn primary imp-scan" data-act="scan">Ler QR da nota</button>
    <div class="imp-cam" id="impCam" hidden><video id="impVid" playsinline muted></video><button class="btn" data-act="scan-stop">Cancelar</button></div>` : ""}
    <form class="imp-paste" data-form="imp-paste"><input id="impIn" placeholder="Link ou chave da nota" aria-label="Link ou chave da nota" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" type="submit">Ler</button></form>
    <p class="imp-msg" id="impMsg" role="status">${esc(msg || "")}</p>`;
  const start = msg => { parar(); sheet().innerHTML = startHTML(msg); };
  const msg = t => { const el = document.getElementById("impMsg"); if (el) el.textContent = t; };

  async function scan(){
    const cam = document.getElementById("impCam"), vid = document.getElementById("impVid"); if (!cam) return;
    cam.hidden = false; msg("");
    try { stopCam = await lerQR(vid, texto => { stopCam = null; if (vivo()) ler(texto); }); }
    catch(e){ cam.hidden = true; stopCam = null; msg("Não consegui abrir a câmera. Cole o link ou a chave aqui embaixo."); const i = document.getElementById("impIn"); if (i) i.focus(); }
  }

  /* ---- 2) ler a nota ---- */
  async function ler(texto){
    const chave = chaveDe(texto);
    if (!chave) return start("Não achei a chave de 44 dígitos nisso. Confira o link ou o QR.");
    if (jaImportada(chave)) return start("Esta nota já foi importada.");
    parar(); sheet().innerHTML = `<h4>Importar nota</h4><p class="sub">Lendo a nota na Sefaz…</p>`;
    try { nota = await D.parseNota(/^https?:/i.test(texto.trim()) ? texto.trim() : chave); }
    catch(e){ return vivo() ? start(ERROS[e.code] || ERROS.internal) : undefined; }
    if (!vivo()) return;
    if (jaImportada(nota.accessKey)) return start("Esta nota já foi importada.");
    resolverLocal();
  }

  /* ---- 3) local: por CNPJ; senão, vincular um local sem CNPJ de nome igual (uma pergunta) ou criar ---- */
  function resolverLocal(){
    const ach = findPlaceByCnpj(placesList(), nota.issuer.cnpj);
    if (ach) { lugar = {id: ach.id}; return revisar(); }
    const sug = suggestPlaceLink(placesList(), nota.issuer.name);
    if (!sug) { lugar = {criar: true}; return revisar(); }
    sheet().innerHTML = `<h4>Qual é o local?</h4><p class="sub">A nota é de “${esc(prettyName(nota.issuer.name))}”. É o seu local “${esc(sug.name)}”?</p>
      <div class="confirm"><button class="btn" data-act="novo-local">Não, criar outro</button><button class="btn primary" data-act="vincular" data-id="${esc(sug.id)}">Sim, é esse</button></div>`;
  }

  /* ---- 4) revisão: o incerto primeiro; lembrado e provável já vêm marcados ---- */
  function revisar(){
    cands = candidatos();
    const sug = matchAll(nota.items, cands, vinculos(), nota.issuer.cnpj);
    const grupo = c => c === "media" ? 0 : c === "alta" ? 1 : c === "lembrado" ? 2 : 3;
    rows = nota.items.map((line, n) => {
      const s = sug[n];
      return {line, n, key: s ? s.key : null, label: s ? s.label : "", conf: s ? s.conf : null, on: !!s && s.conf !== "media"};
    }).sort((a, b) => grupo(a.conf) - grupo(b.conf) || a.n - b.n);
    desenhar();
  }
  const rowHTML = (r, i) => `<div class="imp-row${r.on ? " on" : ""}${r.key ? "" : " none"}" data-i="${i}">
      <button class="imp-chk" data-act="tog" aria-pressed="${r.on}" aria-label="Importar o preço de ${esc(r.line.name)}"${r.key ? "" : " disabled"}></button>
      <button class="imp-main" data-act="pick"><span class="imp-rn">${esc(r.line.name)}</span>
        <span class="imp-sug">${r.key ? `${esc(r.label)}${r.conf ? ` <i class="imp-h ${r.conf}">${HINT[r.conf]}</i>` : ""}` : "Sem correspondência · escolher"}</span></button>
      <span class="imp-p">${esc(fmt(linePrice(r.line)))}</span></div>`;
  const goHTML = () => { const n = rows.filter(r => r.on && r.key).length; return `<button class="btn primary imp-go" data-act="go"${n ? "" : " disabled"}>${n ? `Importar ${n} ${n === 1 ? "preço" : "preços"}` : "Nada marcado"}</button>`; };
  function desenhar(){
    const ask = rows.filter(r => r.conf === "media").length;
    sheet().innerHTML = `<h4>${esc(lugar.id ? ((placesList().find(p => p.id === lugar.id) || {}).name || "") : prettyName(nota.issuer.name))}</h4>
      <p class="sub">${esc(dataBR(nota.date))} · ${nota.items.length} ${nota.items.length === 1 ? "item" : "itens"} · ${esc(fmt(nota.total / 100))}${ask ? ` · ${ask} para conferir` : ""}</p>
      <div class="imp-rows" data-clarity-mask="true">${rows.map(rowHTML).join("")}</div><div id="impGo">${goHTML()}</div>`;
  }
  const pintar = i => {
    const el = sheet().querySelector(`.imp-row[data-i="${i}"]`); if (el) el.outerHTML = rowHTML(rows[i], i);
    document.getElementById("impGo").innerHTML = goHTML();
  };

  /* ---- escolher outro item para uma linha ---- */
  function abrirPicker(i){
    pickI = i; const r = rows[i];
    const ordem = rank(r.line, cands).map(x => x.cand), vistos = new Set(ordem.map(c => c.key));
    const resto = cands.filter(c => !vistos.has(c.key)).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    const todos = ordem.concat(resto);
    const lista = q => {
      const t = keyOf(q);
      return todos.filter(c => !t || c.key.includes(t)).slice(0, 60).map(c => `<button class="imp-opt" data-act="set" data-key="${esc(c.key)}" aria-pressed="${c.key === r.key}">${esc(c.label)}</button>`).join("")
        || `<p class="sub">${cands.length ? "Nenhum item assim." : "Ainda não há itens na lista nem no histórico."}</p>`;
    };
    sheet().innerHTML = `<button class="imp-back" data-act="back">‹ Voltar</button><h4 data-clarity-mask="true">${esc(r.line.name)}</h4>
      <p class="sub">Qual item da sua lista é este? O preço vai para ele.</p>
      <input id="impQ" class="imp-q" placeholder="Buscar item" aria-label="Buscar item" autocomplete="off">
      <div class="imp-opts" id="impOpts" data-clarity-mask="true">${lista("")}</div>
      <div class="menu"><button data-act="skip">Pular este item</button></div>`;
    sheet()._lista = lista;
  }
  const voltar = () => { const sc = document.getElementById("sheet").scrollTop; desenhar(); document.getElementById("sheet").scrollTop = sc; };

  /* ---- 5) gravar: preços (como no Estágio 2), vínculos e a chave da nota ---- */
  function importar(){
    const sel = rows.filter(r => r.on && r.key); if (!sel.length) return;
    if (jaImportada(nota.accessKey)) { toast("Esta nota já foi importada"); return; }
    const cnpj = fmtCnpj(nota.issuer.cnpj);
    const placeId = lugar.id || (lugar.vincular ? (setPlaceCnpj(lugar.vincular, cnpj), lugar.vincular) : addPlace(prettyName(nota.issuer.name) || "Local da nota", cnpj).id);
    const at = Date.parse(nota.date) || Date.now();
    for (const r of sel) write("prices", newId(), {key: r.key, placeId, price: linePrice(r.line), at}, "set");
    const links = vinculos();
    for (const r of sel) {
      const ref = nota.issuer.cnpj + "|" + r.line.code;
      if (r.line.code && links[ref] !== r.key) write("nfce", refId("l", ref), {kind: "link", ref, key: r.key}, "set");
    }
    write("nfce", refId("r", nota.accessKey), {kind: "receipt", ref: nota.accessKey, key: null}, "set");
    closeAll();
    toast(`${sel.length} ${sel.length === 1 ? "preço atualizado" : "preços atualizados"}`);
  }
  const closeAll = () => { parar(); closeSheet(); };

  openSheet(startHTML(), body => {
    body.onclick = h = e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const a = b.dataset.act, row = b.closest(".imp-row"), i = row ? +row.dataset.i : -1;
      if (a === "scan") scan();
      else if (a === "scan-stop") start();
      else if (a === "vincular") { lugar = {vincular: b.dataset.id}; revisar(); }
      else if (a === "novo-local") { lugar = {criar: true}; revisar(); }
      else if (a === "tog") { if (rows[i].key) { rows[i].on = !rows[i].on; pintar(i); } }
      else if (a === "pick") abrirPicker(i);
      else if (a === "set") { const r = rows[pickI], c = cands.find(x => x.key === b.dataset.key); if (c) { r.key = c.key; r.label = c.label; r.conf = "manual"; r.on = true; } voltar(); }
      else if (a === "skip") { rows[pickI].on = false; voltar(); }
      else if (a === "back") voltar();
      else if (a === "go") importar();
    };
    body.onsubmit = e => {
      if (e.target.dataset.form !== "imp-paste") return;
      e.preventDefault(); const v = document.getElementById("impIn").value.trim(); if (v) ler(v);
    };
    body.oninput = e => { if (e.target.id === "impQ") document.getElementById("impOpts").innerHTML = body._lista(e.target.value); };
  });
}
