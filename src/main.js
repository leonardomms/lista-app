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
import { isNetErr, atualizarSelo } from "./rede.js";

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
  /* "logado" = há sessão guardada no aparelho. Sem rede, nada de chamada: o app abre na hora com a conta guardada.
     Com rede, o getSession valida/renova o token (com prazo); falha de rede nunca vira "deslogado". */
  const guardada = D.cachedSession();
  if (navigator.onLine === false) session = guardada;
  else {
    try { const r = await D.comPrazo(() => D.sb.auth.getSession(), 6000); session = r.data.session; if (!session && r.error && isNetErr(r.error)) session = guardada; }
    catch(e){ D.diag.err = (e && e.message) || String(e); if (isNetErr(e)) session = guardada; }
  }
  /* entrou ou saiu uma conta: recarrega para recomeçar do zero no modo certo */
  const uid = session ? session.user.id : null;
  D.diag.session = !!session;
  /* só recarrega para entrar numa conta nova ou sair de verdade (SIGNED_OUT); evento sem sessão por falha de rede não conta */
  D.sb.auth.onAuthStateChange((ev, s) => { if (ev === "SIGNED_OUT" ? !!uid : !!(s && s.user.id !== uid)) location.reload(); });
  /* só no desenvolvimento: permite testar com um usuário criado no painel do Supabase (signInWithPassword) */
  if (import.meta.env.DEV) window.__sb = D.sb;
  if (!session) { document.querySelector(".loading")?.remove(); showLogin(); return; }

  atualizarSelo();
  S.myId = uid; S.mode = "remote"; S.userApi = {profiles: D.fetchProfiles};
  /* nome e cor: do cache local na hora; o servidor atualiza em seguida, se houver rede */
  const meta = session.user.user_metadata || {};   // nome vem do perfil; se vazio, do Google (user_metadata) ou do e-mail
  const euKey = "lista-eu-v1:" + uid;
  let eu = {}; try { eu = JSON.parse(localStorage.getItem(euKey) || "{}") || {}; } catch(e){}
  const aplicaEu = me => { S.meName = me.name || meta.full_name || meta.name || (session.user.email || "").split("@")[0]; S.meColor = me.color || ""; S.profiles[uid] = {name: S.meName, color: S.meColor}; };
  aplicaEu(eu);
  /* e-mail e foto vêm da sessão guardada (valem offline); a foto também fica em cache como data URL para não piscar as iniciais */
  S.meEmail = session.user.email || eu.email || "";
  S.mePhoto = meta.avatar_url || meta.picture || eu.photo || "";
  const fotoKey = "lista-foto-v1:" + uid;
  if (S.mePhoto) {
    let f = null; try { f = JSON.parse(localStorage.getItem(fotoKey) || "null"); } catch(e){}
    if (f && f.url === S.mePhoto && f.data) S.mePhotoData = f.data;
    else if (navigator.onLine !== false) {
      const url = S.mePhoto;
      fetch(url, {referrerPolicy: "no-referrer"}).then(r => r.ok ? r.blob() : null).then(b => {
        if (!b || b.size > 80000) return;
        const fr = new FileReader();
        fr.onload = () => { S.mePhotoData = fr.result; try { localStorage.setItem(fotoKey, JSON.stringify({url, data: fr.result})); } catch(e){} render(); };
        fr.readAsDataURL(b);
      }).catch(() => {});
    }
  }
  if (navigator.onLine !== false) {
    try { const me = (await D.comPrazo(() => D.fetchProfiles([uid])))[uid] || {}; aplicaEu(me); try { localStorage.setItem(euKey, JSON.stringify({...me, email: S.meEmail, photo: S.mePhoto})); } catch(e){} }
    catch(e){}
  }
  render();
  await startRemote();
})();
