/* Versão mostrada no menu: a do app instalado (APK) e, se houver, a do bundle OTA (Capgo). */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

export let versaoTexto = "";
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
