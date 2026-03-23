// ======================================================================
// drawCurve.js — cumulative curve with SPLINE smoothing + markers + tooltip
// ======================================================================

import { state } from "../state.js";

export function drawCurve() {
  const svg = state.svg;
  const layer = svg.querySelector("#curveLayer");
  layer.innerHTML = "";

  const tip = state.tooltip;
  const rows = state.rows;
  const { x, yCum } = state.scales;

  if (!rows || rows.length === 0) return;

  // ------------------------------------------------------------------
  // Build list of smoothed points
  // ------------------------------------------------------------------
  const pts = rows.map(r => ({
    x: x(r.cum),
    y: yCum(r.cum),
    row: r
  }));

  if (pts.length < 2) return;

  // ------------------------------------------------------------------
  // Generate cubic Bézier spline path
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Draw the smooth curve
  // ------------------------------------------------------------------
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", dStr);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#0066cc");
  path.setAttribute("stroke-width", "2.8");
  layer.appendChild(path);

  // ------------------------------------------------------------------
  // Marker circles on the curve
  // ------------------------------------------------------------------
  pts.forEach(p => {
    const dot = document.createElementNS(svg.namespaceURI, "circle");
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", "#0066cc");
    dot.__row = p.row; // for tooltip reference
    layer.appendChild(dot);
  });

  // ------------------------------------------------------------------
  // Unified Tooltip for cumulative dots
  // (Bar tooltip handled in unified drawTooltip.js)
  // ------------------------------------------------------------------
  svg.addEventListener("mousemove", evt => {
    const el = document.elementFromPoint(evt.clientX, evt.clientY);

    if (el && el.tagName === "circle" && el.__row) {
      const d = el.__row;

      tip.style.display = "block";
      tip.style.left = `${evt.clientX + 12}px`;
      tip.style.top  = `${evt.clientY - 20}px`;

      tip.innerHTML = `
        <b>${d.name}</b><br>
        <u>Cumulative Potential</u><br>
        Cumulative: ${d.cum.toLocaleString()} tCO₂e<br>
        MAC: ${d.mac}<br>
        Abatement: ${d.abate}
      `;

      return;
    }
  });
}
