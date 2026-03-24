// ======================================================================
// drawCurve.js — FINAL MACC ENVELOPE CURVE (smoothed + markers + tooltip)
// ======================================================================
// This curve connects the TOP of each bar using MAC values:
//   X = cumulative abatement (x1 = end of the bar)
//   Y = MAC value (bar height)
//
// This is the correct MACC envelope curve (not cumulative potential).
// Works with domain-based zoom/pan, tooltips, markers, hide/show toggle.
// ======================================================================

import { state } from "../state.js";

export function drawCurve() {

  // If user toggled curve OFF → skip drawing
  if (state.curveVisible === false) return;

  const svg = state.svg;
  const layer = svg.querySelector("#curveLayer");
  const tip = state.tooltip;

  // Clear layer
  layer.innerHTML = "";

  const rows = state.rows;
  const { x, y } = state.scales;   // Envelope uses MAC-scale Y

  if (!rows || rows.length === 0) return;

  // ============================================================
  // Build the envelope curve points: at the TOP of each MAC bar
  // ============================================================
  const pts = rows.map(r => ({
    x: x(r.x1),        // cumulative abatement (bar end position)
    y: y(r.mac),       // MAC value (bar height)
    row: r             // full data row for tooltip
  }));

  if (pts.length < 2) return;

  // ============================================================
  // Build a cubic Bézier spline for smooth envelope curve
  // ============================================================
  let dStr = `M ${pts[0].x},${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];

    // control points for smoothing (one-third intervals)
    const cp1x = p0.x + (p1.x - p0.x) * 0.33;
    const cp1y = p0.y + (p1.y - p0.y) * 0.33;

    const cp2x = p0.x + (p1.x - p0.x) * 0.66;
    const cp2y = p0.y + (p1.y - p0.y) * 0.66;

    dStr += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
  }

  // ============================================================
  // Draw the smooth envelope curve stroke
  // ============================================================
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", dStr);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#0066cc");
  path.setAttribute("stroke-width", "2.5");
  layer.appendChild(path);

  // ============================================================
  // Draw dot markers above each bar
  // ============================================================
  pts.forEach(p => {
    const dot = document.createElementNS(svg.namespaceURI, "circle");
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", "#0066cc");
    dot.style.pointerEvents = "auto";
    dot.__row = p.row;
    layer.appendChild(dot);
  });

  // ============================================================
  // Tooltip for envelope curve markers (bar tooltip stays separate)
  // ============================================================
  svg.addEventListener("mousemove", evt => {
    const el = document.elementFromPoint(evt.clientX, evt.clientY);

    // Only react to envelope dots → circle elements with __row data
    if (el && el.tagName === "circle" && el.__row) {
      const d = el.__row;

      tip.style.display = "block";
      tip.style.left = `${evt.clientX + 12}px`;
      tip.style.top  = `${evt.clientY - 20}px`;

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
