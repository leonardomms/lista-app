/* Versão mostrada no menu: a do app instalado (APK) e, se houver, a do bundle OTA (Capgo). */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

export let versaoTexto = "";

/* Últimos eventos do plugin de OTA, guardados no aparelho para a gente ver no menu o que aconteceu */
const LS_OTA = "ota-eventos";
const lerOta = () => { try { return JSON.parse(localStorage.getItem(LS_OTA) || "[]"); } catch(e){ return []; } };
export function otaLinha(){ const l = lerOta(); return "OTA: " + (l.length ? l.join(" › ") : "nenhum evento ainda"); }
export function registrarEventosOta(){
  CapacitorUpdater.addListener("updaterEvent", ev => {
    const d = (ev && ev.data) || {};
    const det = d.error || (d.bundle && d.bundle.version) || d.version || (ev.type === "updateCheckResult" ? d.kind : "") || "";
    const hora = new Date().toTimeString().slice(0, 5);
    try { localStorage.setItem(LS_OTA, JSON.stringify(lerOta().concat(ev.type + (det ? " (" + det + ")" : "") + " " + hora).slice(-3))); } catch(e){}
  }).catch(() => {});
}
export async function carregarVersao(){
  if (!Capacitor.isNativePlatform()) return (versaoTexto = "Versão dev");
  let nativa = "", ota = "";
  try { nativa = (await App.getInfo()).version || ""; } catch(e){}
  try {
    const { bundle } = await CapacitorUpdater.current();
    if (bundle && bundle.version && bundle.version !== "builtin" && bundle.version !== nativa) ota = bundle.version;
  } catch(e){}
  return (versaoTexto = "Versão " + (nativa || "?") + (ota ? " · OTA " + ota : ""));
}
