/* Ponto de entrada: fontes, estilos, eventos, botão Voltar do Android e boot. */
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "./styles.css";

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { S, $ } from "./estado.js";
import { render, bindEvents, closeSheet, goHome } from "./ui.js";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { registrarEventosOta } from "./versao.js";
import { bindVoz } from "./voz.js";
import { startLocal, startRemote } from "./ambientes.js";
import * as D from "./data.js";
import { showLogin } from "./login.js";

/* OTA (Capgo): confirma que este código abriu bem; sem isso o plugin volta para a versão anterior. Só no app nativo. */
if (Capacitor.isNativePlatform()) { registrarEventosOta(); CapacitorUpdater.notifyAppReady().catch(() => {}); }

bindEvents();
bindVoz();

/* botão Voltar do Android: fecha a folha aberta; senão, volta da lista para a tela inicial; senão, sai do app */
if (Capacitor.isNativePlatform()) {
  App.addListener("backButton", () => {
    if (!$("sheet").hidden) closeSheet();
    else if (S.view === "list") goHome();
    else App.exitApp();
  });
}

/* ---------------- boot ---------------- */
render();
(async function boot(){
  /* sem configuração do Supabase: modo local; com Supabase e sem sessão: tela de login com Google */
  if (!D.enabled) { startLocal(); return; }
  let session = null;
  try { session = (await D.sb.auth.getSession()).data.session; } catch(e){ D.diag.err = (e && e.message) || String(e); }
  /* entrou ou saiu uma conta: recarrega para recomeçar do zero no modo certo */
  const uid = session ? session.user.id : null;
  D.diag.session = !!session;
  D.sb.auth.onAuthStateChange((_ev, s) => { if ((s ? s.user.id : null) !== uid) location.reload(); });
  /* só no desenvolvimento: permite testar com um usuário criado no painel do Supabase (signInWithPassword) */
  if (import.meta.env.DEV) window.__sb = D.sb;
  if (!session) { document.querySelector(".loading")?.remove(); showLogin(); return; }

  S.myId = uid; S.mode = "remote"; S.userApi = {profiles: D.fetchProfiles};
  try {
    const me = (await D.fetchProfiles([uid]))[uid] || {};
    const meta = session.user.user_metadata || {};   // nome vem do perfil; se vazio, do Google (user_metadata) ou do e-mail
    S.meName = me.name || meta.full_name || meta.name || (session.user.email || "").split("@")[0]; S.meColor = me.color || "";
    S.profiles[uid] = {name: S.meName, color: S.meColor};
  } catch(e){}
  render();
  await startRemote();
})();
