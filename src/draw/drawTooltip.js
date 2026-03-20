import { state } from "../state.js";

export function initTooltip() {
  const svg = state.svg;
  const tip = state.tooltip;

  svg.addEventListener("mousemove", evt => {
    const el = document.elementFromPoint(evt.clientX, evt.clientY);

    if (el && el.tagName === "rect" && el.__row) {
      const d = el.__row;

      tip.style.display = "block";
      tip.style.left = evt.clientX + 12 + "px";
      tip.style.top = evt.clientY - 20 + "px";

      tip.innerHTML = `
        <b>${d.name}</b><br>
        Category: ${d.cat}<br>
        MAC: ${d.mac}<br>
        Abatement: ${d.abate}<br>
        Cumulative: ${d.cum}<br>
        NPV: ${d.npv}<br>
        Capex: ${d.capex}<br>
        Opex: ${d.opex}
      `;
    } else {
      tip.style.display = "none";
    }
  });
}
