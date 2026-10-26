/* Ditado por voz na barra de adicionar. */
import { $ } from "./estado.js";
import { updateAddChip, submitAdd, toast } from "./ui.js";

/* ---------------- voz ---------------- */
export let voiceRec = null;
export function startVoice(){
  const btn = $("addBtn"), inp = $("addInput");
  if (voiceRec) { try { voiceRec.stop(); } catch(e){} return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    try {
      const base = inp.value.trim();
      const r = new SR(); voiceRec = r; let failed = false, heard = false;
      // se nada for ouvido em alguns segundos (microfone bloqueado em silêncio), cai na dica do teclado
      const guard = setTimeout(() => { if (!heard && voiceRec === r) { failed = true; try { r.abort(); } catch(e){} } }, 5000);
      r.lang = "pt-BR"; r.interimResults = true; r.continuous = false;
      r.onresult = e => { heard = true; let t = ""; for (const res of e.results) t += res[0].transcript; inp.value = (base ? base + ", " : "") + t.trim(); updateAddChip(); btn.classList.add("listening"); };
      r.onerror = () => { failed = true; };
      r.onend = () => { clearTimeout(guard); if (voiceRec !== r) return; voiceRec = null; btn.classList.remove("listening"); if (failed && !heard) voiceFallback(); else if (inp.value.trim()) submitAdd(); };
      btn.classList.add("listening"); r.start(); return;
    } catch(e){ voiceRec = null; }
  }
  voiceFallback();
}
export function voiceFallback(){
  $("addBtn").classList.remove("listening");
  $("addInput").focus();
  toast("Use o microfone do teclado para ditar.");
}

export function bindVoz(){
  $("addBtn").onclick = () => {
    if (voiceRec) { const r = voiceRec; voiceRec = null; try { r.abort(); } catch(e){} $("addBtn").classList.remove("listening"); if ($("addInput").value.trim()) submitAdd(); return; }
    startVoice();
  };
}
