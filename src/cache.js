/* Cache local (stale-while-revalidate): último estado conhecido por usuário + ambiente, em localStorage (JSON).
   Chave versionada "lf:v1:<uid>:<env>"; cada leitura/escrita é protegida: cache quebrado ou ausente nunca derruba o app.
   Se não couber no localStorage, a escrita falha em silêncio e o app só abre sem cache da próxima vez. */
export const VERSAO = 1;
const PREFIX = "lf:v" + VERSAO + ":";
const UID_KEY = "lf:uid";
export const info = {tem: false, idade: 0, fonte: "rede"};   // para o diagnóstico do menu

const key = (uid, env) => PREFIX + uid + ":" + env;

export function ler(uid, env){
  try {
    const raw = localStorage.getItem(key(uid, env)); if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || c.v !== VERSAO || c.uid !== uid) return null;
    info.tem = true; info.idade = c.t || 0;
    return c;
  } catch(e){ return null; }
}
export function gravar(uid, env, dados){
  try { const t = Date.now(); localStorage.setItem(key(uid, env), JSON.stringify({...dados, v: VERSAO, uid, t})); info.tem = true; info.idade = t; } catch(e){}
}
/* apaga tudo que é cache (de qualquer usuário e das versões antigas); a fila de escritas pendentes não é cache e fica */
export function limpar(){
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("lf:v") || k.startsWith("lista-cache-v") || k.startsWith("lista-envs-v")) localStorage.removeItem(k);
    info.tem = false; info.idade = 0;
  } catch(e){}
}
/* se quem entrou não é quem deixou o cache, descarta o cache antigo */
export function conferirUsuario(uid){
  try {
    const ant = localStorage.getItem(UID_KEY);
    if (ant && ant !== uid) limpar();
    localStorage.setItem(UID_KEY, uid);
  } catch(e){}
}
export function textoDiag(){
  const s = info.idade ? Math.max(0, Math.round((Date.now() - info.idade) / 1000)) + "s" : "-";
  return "cache: " + (info.tem ? "sim" : "não") + " | idade: " + s + " | fonte: " + info.fonte;
}
/* há cache de ambientes para este usuário? (decide entre esqueleto e tela imediata) */
export const ENVS_KEY = uid => PREFIX + uid + ":envs";
