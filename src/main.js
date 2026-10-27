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
import { render, bindEvents, closeSheet, goHome, setupRoom } from "./ui.js";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { registrarEventosOta } from "./versao.js";
import { bindVoz } from "./voz.js";
import { P, loadProfile, createEnv, joinEnv, switchEnv, migrateLegacy, startLocal } from "./ambientes.js";
import { afterBootFeedback } from "./sugestoes.js";

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
  const c = window.claude;
  if (!c || typeof c.use !== "function") { startLocal(); return; }
  let db = null;
  try { db = await c.use("db"); } catch(e){}
  if (!db) { startLocal(); return; }
  S.mode = "remote"; S.db = db; render();
  let u = null;
  try { u = await c.use("user"); } catch(e){}
  if (u) {
    S.userApi = u;
    try { S.myId = await u.id(); } catch(e){}
    try { const w = await u.can("data.write"); if (w === false) S.readonly = true; } catch(e){}
    try { const me = await u.me(); S.meName = (me && me.name) || ""; S.meColor = (me && me.color) || ""; } catch(e){}
    try { S.isOwner = await u.isOwner(); } catch(e){}
  }
  await loadProfile();
  const inv = /^#e-([A-Za-z0-9]+)$/.exec(location.hash || "");
  if (!P.envs.length && !S.readonly) {
    let owner = false; try { owner = u ? await u.isOwner() : false; } catch(e){}
    let legacy = false;
    if (owner) { try { legacy = !(await db.collection("lists").limit(1).get()).empty; } catch(e){} }
    if (legacy || !inv) {
      S.migrating = legacy; render();
      const id = await createEnv("Minha casa");
      if (id && legacy) await migrateLegacy(db, id);
      S.migrating = false;
    }
  }
  if (inv) { await joinEnv(inv[1]); }
  if (!P.envs.length && !S.readonly) await createEnv("Minha casa");
  if (!S.env && P.envs.length) switchEnv(P.current && P.envs.some(e => e.id === P.current) ? P.current : P.envs[0].id);
  S.bootDone = true; render();
  afterBootFeedback();
  c.use("room").then(r => { if (r) { S.room = r; setupRoom(); } }).catch(()=>{});
})();
