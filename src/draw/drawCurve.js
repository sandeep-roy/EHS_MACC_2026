// ======================================================================
// drawCurve.js — MACC ENVELOPE curve (top of bars) with smoothing + markers
// ======================================================================

import { state } from "../state.js";

export function drawCurve() {
  const svg = state.svg;
  const layer = svg.querySelector("#curveLayer");
  layer.innerHTML = "";

  const tip = state.tooltip;
  const rows = state.rows;
  const { x, y } = state.scales;   // <-- USE MAC scale (NOT yCum)

  if (!rows || rows.length === 0) return;

  // --------------------------------------------
  // Build MAC envelope points
  // --------------------------------------------
  const pts = rows.map(r => ({
    x: x(r.x1),       // end of bar (cumulative abatement)
    y: y(r.mac),      // MAC value (top of bar)
    row: r
  }));

  if (pts.length < 2) return;

  // --------------------------------------------
  // Build cubic spline path
  // --------------------------------------------
  let dStr = `M ${pts[0].x},${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i+1];

    const cp1x = p0.x + (p1.x - p0.x)*0.33;
    const cp1y = p0.y + (p1.y - p0.y)*0.33;
    const cp2x = p0.x + (p1.x - p0.x)*0.66;
    const cp2y = p0.y + (p1.y - p0.y)*0.66;

    dStr += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
  }

  const path = document.createElementNS(svg.namespaceURI,"path");
  path.setAttribute("d",dStr);
  path.setAttribute("fill","none");
  path.setAttribute("stroke","#0066cc");
  path.setAttribute("stroke-width","2.5");
  layer.appendChild(path);

  // --------------------------------------------
  // Markers (dots)
  // --------------------------------------------
  pts.forEach(p=>{
    const dot = document.createElementNS(svg.namespaceURI,"circle");
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", "#0066cc");
    dot.__row = p.row;
    layer.appendChild(dot);
  });

  // --------------------------------------------
  // Tooltip for envelope curve
  // --------------------------------------------
  svg.addEventListener("mousemove", evt => {
    const el = document.elementFromPoint(evt.clientX, evt.clientY);

    if (el && el.tagName === "circle" && el.__row) {
      const d = el.__row;

      tip.style.display = "block";
      tip.style.left = `${evt.clientX + 12}px`;
      tip.style.top  = `${evt.clientY - 20}px`;

      tip.innerHTML = `
        <b>${d.name}</b><br>
        <u>MACC Envelope</u><br>
        Cumulative Abatement: ${d.x1.toLocaleString()} tCO₂e<br>
        MAC: ${d.mac} EUR/tCO₂e<br>
        Abatement: ${d.abate}
      `;
      return;
    }
  });
}
