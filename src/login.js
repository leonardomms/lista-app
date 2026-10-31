/* Login com Google: seletor nativo de contas (Credential Manager) -> idToken -> Supabase signInWithIdToken.
   O nonce cru vai para o Supabase e o hash (SHA-256 em hex) vai para o Google, como o Supabase confere. */
import { SocialLogin } from "@capgo/capacitor-social-login";
import { sb, diag } from "./data.js";
import { $ } from "./estado.js";
import { limpar } from "./cache.js";
import { ICON_BASKET } from "./icones.js";

const WEB_CLIENT_ID = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || "").trim();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
let iniciado = false;

export async function loginComGoogle(){
  if (!WEB_CLIENT_ID) throw new Error("Falta o VITE_GOOGLE_WEB_CLIENT_ID neste build.");
  if (!iniciado) { await SocialLogin.initialize({google: {webClientId: WEB_CLIENT_ID}}); iniciado = true; }
  const raw = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hashed = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  const res = await SocialLogin.login({provider: "google", options: {nonce: hashed}   /* sem scopes: com eles o plugin exigiria mexer na MainActivity; nome e e-mail já vêm no idToken */});
  const token = res && res.result && res.result.idToken;
  if (!token) throw new Error("O Google não devolveu o token de acesso.");
  const { error } = await sb.auth.signInWithIdToken({provider: "google", token, nonce: raw});
  if (error) throw error;
}

export async function sair(){
  try { await SocialLogin.logout({provider: "google"}); } catch(e){}
  limpar();
  await sb.auth.signOut();
}

const msgErro = e => {
  const m = String((e && e.message) || e || "");
  if (/cancel|dismiss|NoCredential|user.*(closed|abort)/i.test(m)) return "Login cancelado. Toque no botão para tentar de novo.";
  if (/network|fetch|timeout/i.test(m)) return "Sem conexão no momento. Tente de novo em instantes.";
  return "Não deu para entrar com o Google. " + m.slice(0, 140);
};

/* tela de login por cima de tudo; ao entrar, o onAuthStateChange do main.js recarrega o app */
export function showLogin(){
  const el = document.createElement("div");
  el.className = "login";
  el.innerHTML = `<div class="empty"><div class="basket">${ICON_BASKET}</div><strong>Lista da Feira</strong>Entre para criar e dividir suas listas de compras.
    <div style="margin-top:22px"><button class="btn primary" id="loginGoogle">Entrar com Google</button></div>
    <p class="login-err" id="loginErr" role="alert" hidden></p></div>`;
  document.body.appendChild(el);
  const btn = $("loginGoogle"), err = $("loginErr");
  btn.onclick = async () => {
    btn.disabled = true; err.hidden = true; btn.textContent = "Entrando…";
    try { await loginComGoogle(); }
    catch(e){ diag.err = String((e && e.message) || e); err.textContent = msgErro(e); err.hidden = false; btn.disabled = false; btn.textContent = "Entrar com Google"; }
  };
}
