// ======================================================================
// drawCurve.js — FINAL MACC ENVELOPE CURVE (smoothed + markers + tooltip)
// ======================================================================

import { state } from "../state.js";

export function drawCurve() {
  const svg = state.svg;
  const layer = svg.querySelector("#curveLayer");
  const tip = state.tooltip;

  layer.innerHTML = "";

  const { x, y } = state.scales;   // <-- USE MAC Y-scale for envelope curve
  const rows = state.rows;

  if (!rows || rows.length === 0) return;

  // -------------------------------------------------------------
  // Build envelope points: one point at the TOP of every bar
  // -------------------------------------------------------------
  const pts = rows.map(r => ({
    x: x(r.x1),   // cumulative abatement position (end of bar)
    y: y(r.mac),  // MAC value = top of bar
    row: r
  }));

  if (pts.length < 2) return;

  // -------------------------------------------------------------
  // Create cubic Bézier spline
  // -------------------------------------------------------------
  let dStr = `M ${pts[0].x},${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];

    const cp1x = p0.x + (p1.x - p0.x) * 0.33;
    const cp1y = p0.y + (p1.y - p0.y) * 0.33;

    const cp2x = p0.x + (p1.x - p0.x) * 0.66;
    const cp2y = p0.y + (p1.y - p0.y) * 0.66;

    dStr += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
  }

  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", dStr);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#0066cc");
  path.setAttribute("stroke-width", "2.5");
  layer.appendChild(path);

  // -------------------------------------------------------------
  // Dot markers above each bar
  // -------------------------------------------------------------
  pts.forEach(pt => {
    const dot = document.createElementNS(svg.namespaceURI, "circle");
    dot.setAttribute("cx", pt.x);
    dot.setAttribute("cy", pt.y);
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", "#0066cc");
    dot.__row = pt.row;
    layer.appendChild(dot);
  });

  // -------------------------------------------------------------
  // Tooltip for ENVELOPE curve (does NOT override bar tooltip)
  // Bar tooltip remains handled separately in drawTooltip.js
  // -------------------------------------------------------------
  svg.addEventListener("mousemove", evt => {
    const el = document.elementFromPoint(evt.clientX, evt.clientY);

    if (el && el.tagName === "circle" && el.__row) {
      const d = el.__row;

      tip.style.display = "block";
      tip.style.left = `${evt.clientX + 12}px`;
      tip.style.top = `${evt.clientY - 20}px`;

      tip.innerHTML = `
        <b>${d.name}</b><br>
        <u>MACC Envelope</u><br>
        MAC: ${d.mac}<br>
        Abatement: ${d.abate}<br>
        Cumulative X: ${d.x1.toLocaleString()} tCO₂e
      `;
      return;
    }
  });
}
