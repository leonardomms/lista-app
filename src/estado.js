/* Estado compartilhado da tela e utilitários pequenos. */

/* ---------------- estado ---------------- */
export const S = {
  mode:"loading", db:null, userApi:null, room:null,
  lists:new Map(), items:new Map(), history:new Map(), customCats:[], catOverrides:{}, learned:{},
  loaded:{lists:false, items:false},
  view:"home", listId:null, search:"", showDone:false, showCart:true,
  readonly:false, peers:[], profiles:{}, dragging:false, pendingRender:false,
  addCat:null, addCatManual:false, selectedCat:null
};
export const shopping = new Set();     // listas em modo compra (alguém riscou um item nesta sessão)
export const myCreated = new Set();
export const pendingBlank = new Set();
export const expanded = new Set();     // categorias concluídas que o usuário abriu
export const hold = new Map();        // itemId -> estado anterior, mantém a posição por um instante após riscar
export const holdTimers = new Map();
export const drafts = new Map();      // itemId -> texto ainda não salvo
export const draftTimers = new Map();
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
