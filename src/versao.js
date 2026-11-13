/* Versão mostrada no menu: a do app instalado (APK) e, se houver, a do bundle OTA (OtaKit). */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { OtaKit } from "@otakit/capacitor-updater";

export let versaoTexto = "";

/* Últimos eventos do plugin de OTA, guardados no aparelho para a gente ver no menu o que aconteceu */
const LS_OTA = "ota-eventos";
const lerOta = () => { try { return JSON.parse(localStorage.getItem(LS_OTA) || "[]"); } catch(e){ return []; } };
export function otaLinha(){ const l = lerOta(); return "OTA: " + (l.length ? l.join(" › ") : "nenhum evento ainda"); }
export function registrarEventosOta(){
  const hora = () => new Date().toTimeString().slice(0, 5);
  const reg = (tipo, det) => { try { localStorage.setItem(LS_OTA, JSON.stringify(lerOta().concat(tipo + (det ? " (" + det + ")" : "") + " " + hora()).slice(-3))); } catch(e){} };
  for (const ev of ["updateAvailable", "updateStaged", "updateApplied", "downloadFailed", "rollback"]) {
    try { OtaKit.addListener(ev, d => reg(ev, (d && (d.version || (d.bundle && d.bundle.version) || d.error)) || "")).catch(() => {}); } catch(e){}
  }
}
export async function carregarVersao(){
  if (!Capacitor.isNativePlatform()) return (versaoTexto = "Versão dev");
  let nativa = "", ota = "";
  try { nativa = (await App.getInfo()).version || ""; } catch(e){}
  try {
    const { current } = await OtaKit.getState();
    if (current && current.version && current.version !== "builtin" && current.version !== nativa) ota = current.version;
  } catch(e){}
  return (versaoTexto = "Versão " + (nativa || "?") + (ota ? " · OTA " + ota : ""));
}
