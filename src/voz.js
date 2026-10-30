/* Ditado por voz na barra de adicionar: no app, reconhecimento nativo do Android (@capacitor-community/speech-recognition);
   no navegador, a Web Speech API se existir. Sem nenhum dos dois, o botão some.
   Tocar começa a ouvir (a transcrição parcial aparece no campo), tocar de novo para; o texto final vira itens
   (splitItems) numa folha de confirmação, editáveis, e "Adicionar" usa o mesmo caminho da barra (addTexts). */
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { $, esc } from "./estado.js";
import { splitItems } from "./categorias.js";
import { updateAddChip, addTexts, toast, openSheet, closeSheet } from "./ui.js";
import { online } from "./rede.js";

const nativo = Capacitor.isNativePlatform();
const WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
let ouvindo = false, base = "", ultimo = "", webRec = null, encerrar = null;

function mostrar(t){
  ultimo = (t || "").trim();
  $("addInput").value = (base ? base + ", " : "") + ultimo;
  updateAddChip();
}
function estado(on){
  ouvindo = on;
  const btn = $("addBtn"), inp = $("addInput");
  btn.classList.toggle("listening", on);
  btn.setAttribute("aria-label", on ? "Parar de ouvir" : "Ditar itens por voz");
  inp.placeholder = on ? "Ouvindo… fale os itens" : "Adicionar item";
}

/* fim da escuta: se ouviu algo, abre a confirmação */
function terminar(){
  if (!ouvindo) return;
  estado(false);
  const texto = $("addInput").value.trim();
  if (ultimo) confirmar(splitItems(texto));
}

/* ---------------- confirmação ---------------- */
function confirmar(itens){
  if (!itens.length) return;
  const linha = t => `<div class="vz-row"><input value="${esc(t)}" aria-label="Item"><button class="vz-x" data-x aria-label="Remover">×</button></div>`;
  openSheet(`<h4>Adicionar ${itens.length === 1 ? "1 item" : itens.length + " itens"}?</h4><p class="sub">Confira o que entendi. Dá para corrigir ou tirar antes de adicionar.</p>
    <div class="vz-list">${itens.map(linha).join("")}</div>
    <div class="vz-act"><button class="btn" data-act="vz-cancel">Cancelar</button><button class="btn primary" data-act="vz-add">Adicionar</button></div>`, body => {
    const titulo = () => { const n = body.querySelectorAll(".vz-row").length; body.querySelector("h4").textContent = n ? `Adicionar ${n === 1 ? "1 item" : n + " itens"}?` : "Nenhum item"; };
    body.onclick = e => {
      const x = e.target.closest("[data-x]"); if (x) { x.closest(".vz-row").remove(); titulo(); return; }
      if (e.target.closest('[data-act="vz-cancel"]')) { closeSheet(); return; }
      if (e.target.closest('[data-act="vz-add"]')) {
        const textos = [...body.querySelectorAll(".vz-row input")].map(i => i.value);
        $("addInput").value = ""; closeSheet(); addTexts(textos);
      }
    };
    body.onkeydown = e => { if (e.key === "Enter" && e.target.matches(".vz-row input")) { e.preventDefault(); body.querySelector('[data-act="vz-add"]').click(); } };
  });
}

/* ---------------- Android (plugin nativo) ---------------- */
async function permissao(){
  let p = await SpeechRecognition.checkPermissions();
  if (p.speechRecognition !== "granted") p = await SpeechRecognition.requestPermissions();
  return p.speechRecognition === "granted";
}
async function ouvirNativo(){
  try {
    if (!(await permissao())) { toast("Sem permissão do microfone. Libere em Configurações > Apps > Lista da Feira > Permissões."); return; }
    await SpeechRecognition.removeAllListeners();
    SpeechRecognition.addListener("partialResults", d => { if (ouvindo && d.matches && d.matches[0]) mostrar(d.matches[0]); });
    SpeechRecognition.addListener("listeningState", d => { if (d.status === "stopped") terminar(); });
    base = $("addInput").value.trim(); ultimo = ""; estado(true);
    encerrar = () => SpeechRecognition.stop().catch(() => {});
    await SpeechRecognition.start({language: "pt-BR", partialResults: true, popup: false, maxResults: 1});
  } catch(e){
    /* parar na mão também pode rejeitar o start(); só avisa se ainda estava ouvindo e nada foi entendido */
    if (!ouvindo) return;
    estado(false);
    if (ultimo) confirmar(splitItems($("addInput").value.trim()));
    else toast("Não entendi. Toque no microfone e fale de novo.");
  }
}

/* ---------------- navegador (Web Speech API) ---------------- */
function ouvirWeb(){
  try {
    const r = new WebSR(); webRec = r;
    r.lang = "pt-BR"; r.interimResults = true; r.continuous = false;
    r.onresult = e => { let t = ""; for (const res of e.results) t += res[0].transcript; mostrar(t); };
    r.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Sem permissão do microfone neste navegador."); };
    r.onend = () => { if (webRec === r) { webRec = null; terminar(); } };
    base = $("addInput").value.trim(); ultimo = ""; estado(true);
    encerrar = () => { try { r.stop(); } catch(e){} };
    r.start();
  } catch(e){ webRec = null; estado(false); toast("Não deu para ouvir agora. Tente de novo."); }
}

export async function bindVoz(){
  const btn = $("addBtn");
  let ok = false;
  if (nativo) { try { ok = (await SpeechRecognition.available()).available; } catch(e){ ok = false; } }
  else ok = !!WebSR;
  btn.hidden = !ok;
  if (!ok) return;
  btn.onclick = () => {
    if (ouvindo) { if (encerrar) encerrar(); if (!nativo) return; terminar(); return; }
    if (!online()) { toast("Voz precisa de internet"); return; }
    if (nativo) ouvirNativo(); else ouvirWeb();
  };
}
