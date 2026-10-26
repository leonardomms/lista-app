/* Categorias: dicionário de palavras, divisão de frases em itens e o que o app aprende (sem IA). */
import { S, $, esc } from "./estado.js";
import { saveLocal, enqueue, write, onWriteError } from "./dados.js";
import { render, openSheet, toast } from "./ui.js";
import { envPath } from "./ambientes.js";
import { ICON_TRASH, ICON_UNDO, ICON_SPARK } from "./icones.js";

/* ---------------- categorias ---------------- */
export const DEFAULT_CATS = [
  {id:"fruteira",   name:"Fruteira",          color:"#6cc25a"},
  {id:"padaria",    name:"Padaria",           color:"#e0a35c"},
  {id:"acougue",    name:"Açougue",           color:"#e2675c"},
  {id:"frios",      name:"Frios e laticínios",color:"#7fb4ea"},
  {id:"mercearia",  name:"Mercearia",         color:"#c29be3"},
  {id:"congelados", name:"Congelados",        color:"#5ccbcb"},
  {id:"bebidas",    name:"Bebidas",           color:"#ec90b8"},
  {id:"limpeza",    name:"Limpeza",           color:"#8e9cf3"},
  {id:"higiene",    name:"Higiene",           color:"#66d0a0"},
  {id:"pet",        name:"Pet",               color:"#e8bf55"},
  {id:"outros",     name:"Outros",            color:"#9e978b"}
];
export const EXTRA_COLORS = ["#f08a5d","#b8de6f","#6fb1de","#de6fb1","#d8c35a","#7ad6c0","#a98be6"];

export const KW = {
  fruteira:"banana maca laranja limao uva mamao manga abacaxi melancia melao morango pera kiwi abacate tomate alface cebola alho batata cenoura beterraba pepino abobrinha abobora brocolis couve repolho pimentao chuchu mandioca aipim inhame salsinha cebolinha coentro rucula espinafre berinjela gengibre ovo ovos tangerina mexerica bergamota goiaba maracuja coco ameixa pessego quiabo vagem jilo agriao hortela manjericao salsa cheiro-verde fruta frutas verdura verduras legume legumes",
  padaria:"pao paes baguete bisnaga croissant bolo sonho rosca torrada broa sovado ciabatta brioche",
  acougue:"carne carnes frango peito coxa coxinha sobrecoxa file patinho alcatra picanha costela linguica moida acem maminha cupim lombo pernil bisteca porco suino peixe salmao tilapia camarao fraldinha contrafile musculo coracao asa asinha bife",
  frios:"queijo presunto mussarela mucarela muzzarela mortadela salame iogurte leite manteiga margarina requeijao nata bacon parmesao ricota cottage blanquet",
  mercearia:"arroz feijao macarrao massa oleo azeite acucar sal farinha cafe molho extrato milho ervilha atum sardinha biscoito bolacha cereal aveia granola fuba tempero vinagre maionese ketchup mostarda chocolate achocolatado gelatina mel geleia pipoca lentilha grao-de-bico amendoim castanha farofa tapioca polvilho fermento adocante cha-mate",
  congelados:"sorvete pizza lasanha nuggets hamburguer polpa congelado congelada empanado",
  bebidas:"agua refrigerante refri coca suco cerveja vinho energetico guarana cha kombucha espumante vodka cachaca isotonico",
  limpeza:"detergente sabao amaciante desinfetante cloro esponja vassoura lixo alcool multiuso limpador lustra-moveis veja pano rodo luva",
  higiene:"shampoo xampu condicionador sabonete desodorante absorvente fralda fraldas cotonete barbear lamina gilete hidratante protetor escova enxaguante",
  pet:"racao areia petisco sache coleira"
};
export const KW_PHRASES = [
  ["papel higienico","higiene"],["creme dental","higiene"],["pasta de dente","higiene"],["fio dental","higiene"],
  ["papel toalha","limpeza"],["agua sanitaria","limpeza"],["saco de lixo","limpeza"],["sabao em po","limpeza"],
  ["creme de leite","mercearia"],["leite condensado","mercearia"],["pao de queijo","congelados"],["peito de peru","frios"],
  ["batata frita","congelados"],["agua de coco","bebidas"],["leite de coco","mercearia"],["carne moida","acougue"],
  ["pao de forma","padaria"],["pao frances","padaria"],["queijo ralado","frios"]
];
export const KW_MAP = new Map();
for (const [cat, words] of Object.entries(KW)) for (const w of words.split(/\s+/)) if (!KW_MAP.has(w)) KW_MAP.set(w.replace(/-/g," "), cat);

export function norm(s){ return (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim(); }
export const STOP = ["kg","g","un","l","ml","de","do","da","pct","cx","dz","duzia"];
export function keyOf(text){ return norm(text).split(" ").filter(x => x && !/^\d/.test(x) && !STOP.includes(x)).join(" "); }
export function learnedCat(text){
  const k = keyOf(text); if (!k) return null;
  const L = S.learned || {};
  const hit = L[k] || (k.endsWith("s") ? L[k.slice(0,-1)] : null) || L[k + "s"];
  return hit && allCats().some(c => c.id === hit) ? hit : null;
}
export function guessCat(text){ return learnedCat(text) || builtinCat(text); }
/* dividir uma frase ditada/digitada em vários itens (sem IA: separadores + dicionário) */
export const QTY_RE = /^(\d+([.,]\d+)?x?|meia|meio|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|doze)$/;
export const UNITS = new Set(["kg","g","gr","l","ml","litro","litros","pacote","pacotes","pct","caixa","caixas","cx","lata","latas","garrafa","garrafas","unidade","unidades","un","duzia","duzias","maco","macos","bandeja","bandejas","pote","potes","saco","sacos","vidro","vidros","rolo","rolos","fardo","fardos"]);
export const GLUE = new Set(["de","do","da","dos","das","com","sem","para","pra"]);
export let PHRASES = null;
export function phraseSet(){
  if (!PHRASES) { PHRASES = new Set(KW_PHRASES.map(x => x[0])); for (const k of KW_MAP.keys()) if (k.includes(" ")) PHRASES.add(k); }
  return PHRASES;
}
export function knownWord(w){
  const n = norm(w); if (!n) return false;
  if (KW_MAP.has(n) || (n.endsWith("s") && KW_MAP.has(n.slice(0,-1))) || (n.endsWith("es") && KW_MAP.has(n.slice(0,-2))) || (n.endsWith("oes") && KW_MAP.has(n.slice(0,-3) + "ao"))) return true;
  return !!learnedCat(w);
}
export function segmentKnown(part){
  const words = part.split(" ").filter(Boolean);
  if (words.length < 2) return [part];
  const out = []; let pre = []; let i = 0;
  while (i < words.length) {
    const n = norm(words[i]);
    if (QTY_RE.test(n) || UNITS.has(n)) { pre.push(words[i]); i++; continue; }
    if (GLUE.has(n)) {
      if (pre.length) { pre.push(words[i]); i++; continue; }
      if (out.length && i + 1 < words.length) { out[out.length - 1] += " " + words[i] + " " + words[i + 1]; i += 2; continue; }
      return [part];
    }
    let took = 0;
    for (const len of [4, 3, 2]) {
      if (i + len > words.length) continue;
      const chunk = words.slice(i, i + len).join(" ");
      if (phraseSet().has(norm(chunk)) || learnedCat(chunk)) { took = len; break; }
    }
    if (!took && knownWord(words[i])) took = 1;
    if (!took) {
      // palavra desconhecida logo após um item é complemento dele ("macarrão integral", "sabão em pó")
      if (out.length && !pre.length) { out[out.length - 1] += " " + words[i]; i++; continue; }
      return [part];                 // começa com palavra desconhecida: melhor não arriscar dividir
    }
    out.push(pre.concat(words.slice(i, i + took)).join(" ")); pre = []; i += took;
  }
  if (pre.length) { if (!out.length) return [part]; out[out.length - 1] += " " + pre.join(" "); }
  return out.length ? out : [part];
}
export function splitItems(text){
  const t = String(text || "").replace(/\s+/g, " ").trim(); if (!t) return [];
  const parts = t.split(/\s*[,;\n]\s*|\s+(?:e|mais|tamb[eé]m)\s+/i).map(x => x.replace(/^[\s\-•*·.]+|[\s.]+$/g, "").trim()).filter(Boolean);
  const out = [];
  for (const part of parts) out.push(...segmentKnown(part));
  return out.map(x => x.charAt(0).toLowerCase() === x.charAt(0) ? x : x.charAt(0).toLowerCase() + x.slice(1)).filter(Boolean);
}
export function learn(text, cat){
  const k = keyOf(text); if (!k || !cat || S.readonly) return;
  const L = S.learned || {};
  if (L[k] === cat) return;
  if (!L[k] && builtinCat(text) === cat) return;
  S.learned = {...L, [k]: cat};
  writeLearned();
  toast(`Aprendi: “${k}” vai para ${catById(cat).name}`);
}
export function writeLearned(){
  if (S.mode !== "remote") { saveLocal(); return; }
  const body = {map: S.learned};
  enqueue(envPath("config/learned"), () => S.db.doc(envPath("config/learned")).set(body)).catch(onWriteError);
}
export function builtinCat(text){
  const t = norm(text); if (!t) return null;
  for (const [p,c] of KW_PHRASES) if (t.includes(p)) return c;
  const toks = t.split(" ").filter(x => x && !/^\d/.test(x) && !["kg","g","un","l","ml","de","do","da","pct","cx","dz","duzia"].includes(x));
  for (const tok of toks){
    if (KW_MAP.has(tok)) return KW_MAP.get(tok);
    if (tok.endsWith("s") && KW_MAP.has(tok.slice(0,-1))) return KW_MAP.get(tok.slice(0,-1));
    if (tok.endsWith("es") && KW_MAP.has(tok.slice(0,-2))) return KW_MAP.get(tok.slice(0,-2));
    if (tok.endsWith("oes") && KW_MAP.has(tok.slice(0,-3)+"ao")) return KW_MAP.get(tok.slice(0,-3)+"ao");
  }
  return null;
}

export function allCats(){
  const ov = S.catOverrides || {};
  const base = DEFAULT_CATS.filter(c => !(ov[c.id] && ov[c.id].deleted && c.id !== "outros")).map(c => {
    const o = ov[c.id]; if (!o) return c;
    return {...c, name: o.name || c.name, color: o.color || c.color};
  });
  return base.concat(S.customCats.filter(c => c && c.id && !DEFAULT_CATS.some(d => d.id === c.id)));
}
export function catById(id){ const all = allCats(); return all.find(c => c.id === id) || all.find(c => c.id === "outros") || DEFAULT_CATS[DEFAULT_CATS.length-1]; }
export const PALETTE = [...new Set(DEFAULT_CATS.map(c => c.color).concat(EXTRA_COLORS))];

export function sortedCatsFor(list){
  const base = allCats().map(c=>c.id);
  const ord = Array.isArray(list && list.catOrder) ? list.catOrder.filter(id => base.includes(id)) : [];
  return ord.concat(base.filter(id => !ord.includes(id)));
}

export function writeCats(){
  if (S.readonly) return;
  render();
  if (S.mode !== "remote") { saveLocal(); return; }
  const body = {list:S.customCats, overrides:S.catOverrides};
  enqueue(envPath("config/categories"), () => S.db.doc(envPath("config/categories")).set(body)).catch(onWriteError);
}
export function patchCat(id, patch){
  if (S.readonly) return;
  if (S.customCats.some(c => c.id === id)) S.customCats = S.customCats.map(c => c.id === id ? {...c, ...patch} : c);
  else S.catOverrides = {...S.catOverrides, [id]: {...(S.catOverrides[id]||{}), ...patch}};
  writeCats();
}
export function deleteCat(id){
  if (S.readonly || id === "outros") return 0;
  const moved = []; for (const [iid, it] of S.items) if (it.cat === id) moved.push(iid);
  moved.forEach(iid => write("items", iid, {cat:"outros"}, "patch"));
  if (S.customCats.some(c => c.id === id)) S.customCats = S.customCats.filter(c => c.id !== id);
  else S.catOverrides = {...S.catOverrides, [id]: {...(S.catOverrides[id]||{}), deleted:true}};
  writeCats();
  return moved.length;
}

export function addCustomCat(name){
  name = (name||"").trim(); if (!name) return null;
  const exist = allCats().find(c => norm(c.name) === norm(name)); if (exist) return exist.id;
  const id = "c-" + norm(name).replace(/ /g,"-").slice(0,30) + "-" + Math.random().toString(36).slice(2,6);
  S.customCats = S.customCats.concat({id, name, color: EXTRA_COLORS[S.customCats.length % EXTRA_COLORS.length]});
  writeCats();
  return id;
}

export function openCatManager(focusId){
  if (S.readonly) return;
  let openPal = null;
  const uses = id => { let n = 0; for (const it of S.items.values()) if (it.cat === id) n++; return n; };
  const rows = () => allCats().map(c => `
    <div class="catrow-wrap" data-cat="${esc(c.id)}">
      <div class="catrow">
        <button class="swbtn" data-act="pal" aria-label="Trocar cor de ${esc(c.name)}"><i style="--c:${esc(c.color)}"></i></button>
        <input class="catname" value="${esc(c.name)}" aria-label="Nome da categoria" autocomplete="off" enterkeyhint="done" maxlength="40">
        <span class="uses" title="Itens nesta categoria">${uses(c.id)}</span>
        ${c.id === "outros" ? "" : `<button class="del" data-act="del" aria-label="Excluir ${esc(c.name)}">${ICON_TRASH}</button>`}
      </div>
      ${openPal === c.id ? `<div class="palette">${PALETTE.map(col => `<button data-color="${col}" style="--c:${col}" aria-pressed="${col === c.color}" aria-label="Usar esta cor"></button>`).join("")}</div>` : ""}
    </div>`).join("");
  openSheet(`<h4>Categorias</h4><p class="sub">Toque no nome para renomear e na cor para trocar. Ao excluir, os itens vão para “Outros”.</p>
    <div class="catrows" id="catRows">${rows()}</div>
    <form class="newcat" data-form="newcat"><input id="newCatName" placeholder="Nova categoria (ex.: Farmácia)" autocomplete="off" aria-label="Nova categoria" maxlength="40"><button class="btn primary" type="submit">Criar</button></form>
    <div class="menu"><button data-act="restore">${ICON_UNDO}Restaurar categorias padrão</button>${Object.keys(S.learned||{}).length ? `<button data-act="forget">${ICON_SPARK}Esquecer o que o app aprendeu (${Object.keys(S.learned).length})</button>` : ""}</div>`, body => {
    const box = body.querySelector("#catRows");
    const redraw = () => { box.innerHTML = rows(); };
    body.onclick = e => {
      const w = e.target.closest(".catrow-wrap");
      const b = e.target.closest("[data-act],[data-color]"); if (!b) return;
      if (b.dataset.color && w) { patchCat(w.dataset.cat, {color:b.dataset.color}); openPal = null; redraw(); return; }
      const a = b.dataset.act;
      if (a === "pal" && w) { openPal = openPal === w.dataset.cat ? null : w.dataset.cat; redraw(); }
      else if (a === "del" && w) {
        if (!b.classList.contains("arm")) {
          b.classList.add("arm"); b.textContent = "Excluir?";
          setTimeout(() => { if (b.isConnected) { b.classList.remove("arm"); b.innerHTML = ICON_TRASH; } }, 3000);
        } else {
          const cid = w.dataset.cat, name = catById(cid).name;
          const n = deleteCat(cid); redraw();
          toast(n ? `“${name}” excluída. ${n} ${n === 1 ? "item foi" : "itens foram"} para Outros` : `“${name}” excluída`);
        }
      }
      else if (a === "restore") { S.catOverrides = {}; writeCats(); redraw(); toast("Categorias padrão restauradas"); }
      else if (a === "forget") { S.learned = {}; writeLearned(); b.remove(); toast("Categorias aprendidas apagadas"); }
    };
    body.onchange = e => {
      if (!e.target.classList.contains("catname")) return;
      const w = e.target.closest(".catrow-wrap"); const v = e.target.value.trim();
      if (v && v !== catById(w.dataset.cat).name) patchCat(w.dataset.cat, {name:v});
      else e.target.value = catById(w.dataset.cat).name;
    };
    body.onkeydown = e => { if (e.target.classList.contains("catname") && e.key === "Enter") { e.preventDefault(); e.target.blur(); } };
    body.querySelector('[data-form="newcat"]').onsubmit = e => {
      e.preventDefault(); const inp = $("newCatName");
      const id = addCustomCat(inp.value); inp.value = "";
      if (id) { redraw(); toast("Categoria criada"); }
    };
    if (focusId) { const inp = box.querySelector(`[data-cat="${CSS.escape(focusId)}"] .catname`); if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 260); }
  });
}
