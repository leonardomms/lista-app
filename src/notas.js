/* Histórico de notas: as notas importadas (registro 'receipt' de S.nfce, com o detalhe em `note`).
   Apagar uma nota remove também os preços que ela gravou e libera importar a mesma nota de novo. */
import { S, esc } from "./estado.js";
import { write } from "./dados.js";
import { openSheet, closeSheet, toast } from "./ui.js";
import { fmt } from "./precos.js";

const dataBR = iso => new Date(iso).toLocaleDateString("pt-BR");
const lista = () => [...S.nfce].filter(([, r]) => r.kind === "receipt" && r.note).map(([id, r]) => ({id, ...r.note}))
  .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));

export function openNotas(){
  const sheet = () => document.getElementById("sheetBody");
  const lines = n => n.lines.filter(l => l.priceId).length;
  const listHTML = () => {
    const ns = lista();
    return `<h4>Histórico de notas</h4>` + (ns.length
      ? `<p class="sub">${ns.length} ${ns.length === 1 ? "nota importada" : "notas importadas"}.</p><div class="mlist" data-clarity-mask="true">${ns.map(n => `<button class="mrow nota-row" data-act="open" data-id="${esc(n.id)}"><div class="minfo"><b>${esc(n.placeName || "Local")}</b><span>${esc(dataBR(n.date))} · ${n.lines.length} ${n.lines.length === 1 ? "item" : "itens"}</span></div><span class="nota-tot">${esc(fmt(n.total / 100))}</span></button>`).join("")}</div>`
      : `<p class="sub">Nenhuma nota ainda. As próximas notas importadas aparecem aqui.</p>`);
  };
  const detail = id => {
    const n = lista().find(x => x.id === id); if (!n) return show();
    sheet().innerHTML = `<button class="imp-back" data-act="back">‹ Voltar</button><h4 data-clarity-mask="true">${esc(n.placeName || "Local")}</h4>
      <p class="sub">${esc(dataBR(n.date))} · ${esc(fmt(n.total / 100))} · ${lines(n)} de ${n.lines.length} com preço importado</p>
      <div class="imp-rows" data-clarity-mask="true">${n.lines.map(l => `<div class="imp-row${l.priceId ? " on" : " none"}"><span class="imp-main"><span class="imp-rn">${esc(l.name)}</span><span class="imp-sug">${l.priceId ? esc(l.label) : "Não importado"}</span></span><span class="imp-p">${esc(fmt(l.price))}</span></div>`).join("")}</div>
      ${S.readonly ? "" : `<div id="delBox"><button class="btn danger" data-act="del" data-id="${esc(id)}">Apagar nota</button></div>`}`;
  };
  const show = () => { sheet().innerHTML = listHTML(); };
  openSheet(listHTML(), body => {
    body.onclick = e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const a = b.dataset.act, id = b.dataset.id;
      if (a === "open") detail(id);
      else if (a === "back") show();
      else if (a === "del") {
        const n = lista().find(x => x.id === id); if (!n) return;
        document.getElementById("delBox").innerHTML = `<p class="sub">Apagar esta nota? Os ${lines(n)} preços que ela gravou também saem. Não dá para desfazer.</p><div class="confirm"><button class="btn" data-act="cancel" data-id="${esc(id)}">Cancelar</button><button class="btn danger" data-act="del-yes" data-id="${esc(id)}">Apagar</button></div>`;
      }
      else if (a === "cancel") detail(id);
      else if (a === "del-yes") {
        const n = lista().find(x => x.id === id); if (!n || S.readonly) return;
        for (const l of n.lines) if (l.priceId) write("prices", l.priceId, null, "del");
        write("nfce", id, null, "del");
        show(); toast("Nota apagada");
      }
    };
  });
}
