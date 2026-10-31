/* Estado da rede e selo "offline". Sem dependências, para poder ser importado de qualquer módulo. */
export const rede = {down: false};   // true quando uma chamada ao Supabase falhou por falta de conexão

export const online = () => navigator.onLine !== false && !rede.down;

/* falha de conexão (e não uma recusa do servidor): sem código do Postgres/PostgREST e com cara de rede, ou 502-504 */
export function isNetErr(e){
  if (!e) return false;
  const m = String(e.message || e), st = e.status;
  if (st === 0 || (st >= 502 && st <= 504)) return true;
  return !e.code && /fetch|network|timeout|load failed|abort|conex/i.test(m);
}

export function atualizarSelo(){
  const el = document.getElementById("offNote");
  if (el) el.hidden = online();
}
export function redeCaiu(){ if (!rede.down) { rede.down = true; atualizarSelo(); } }
export function redeOk(){ if (rede.down) { rede.down = false; } atualizarSelo(); }

window.addEventListener("offline", atualizarSelo);
window.addEventListener("online", atualizarSelo);
