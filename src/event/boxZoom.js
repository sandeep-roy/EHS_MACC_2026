// ======================================================================
// boxZoom.js — Rectangular (box) zoom for domain-based MACC chart
// ======================================================================
// Works with:
//   ✔ domainLeft / domainRight (state.scales)
//   ✔ x() and y() from domain-based scales.js
//   ✔ overlayLayer (drawSVG.js)
//   ✔ SAC widget iframe (dynamic resizing safe)
//   ✔ No CSS transforms — fully stable rendering
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

// This variable is shared with other event modules (optional)
let boxMode = false;

export function initBoxZoom() {
  const svg = state.svg;
  const zoomBtn = document.getElementById("zoom-box"); // defined in iframe.html

  let startX = null;
  let rect = null;

  // ================================================================
  // 1) Toggle box zoom mode
  // ================================================================
  zoomBtn.onclick = () => {
    boxMode = !boxMode;

    zoomBtn.style.background = boxMode ? "#d0e0ff" : "#fff";
    svg.style.cursor = boxMode ? "crosshair" : "default";
  };

  // ================================================================
  // 2) Start drawing rectangle on mousedown
  // ================================================================
  svg.addEventListener("mousedown", evt => {
    if (!boxMode || evt.button !== 0) return;

    startX = getSvgX(evt, svg);

    rect = createRect();
    const overlay = svg.querySelector("#overlayLayer");
    overlay.appendChild(rect);
  });

  // ================================================================
  // 3) Resize rectangle on mousemove
  // ================================================================
  svg.addEventListener("mousemove", evt => {
    if (!boxMode || rect == null) return;

    const x = getSvgX(evt, svg);
    const x1 = Math.min(startX, x);
    const x2 = Math.max(startX, x);

    rect.setAttribute("x", x1);
    rect.setAttribute("width", x2 - x1);
  });

  // ================================================================
  // 4) Complete zoom on mouseup
  // ================================================================
  svg.addEventListener("mouseup", evt => {
    if (!boxMode || rect == null) return;

    const endX = getSvgX(evt, svg);
    const x1 = Math.min(startX, endX);
    const x2 = Math.max(startX, endX);

    rect.remove();
    rect = null;
    boxMode = false;
    zoomBtn.style.background = "#fff";
    svg.style.cursor = "default";

    // Small drag → ignore
    if (Math.abs(x2 - x1) < 20) return;

    // Convert pixel → world (domain)
    applyBoxZoom(x1, x2);

    // Redraw whole chart
    render();
  });
}

// ======================================================================
// Utility: Create selection rectangle
// ======================================================================
function createRect() {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");

  rect.setAttribute("y", state.layout.margin.top);
  rect.setAttribute("height", state.layout.innerH);

  rect.setAttribute("fill", "rgba(0,120,215,0.25)");
  rect.setAttribute("stroke", "rgba(0,120,215,0.9)");
  rect.setAttribute("stroke-width", "1.2");
  rect.setAttribute("stroke-dasharray", "4 2");

  rect.style.pointerEvents = "none";
  return rect;
}

// ======================================================================
// Utility: Convert mouse (clientX) → SVG space X coordinate
// SAC-friendly, stable across iframe resizes
// ======================================================================
function getSvgX(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;

  const svgPoint = pt.matrixTransform(svg.getScreenCTM().inverse());
  return svgPoint.x;
}

// ======================================================================
// Apply domain-based zoom using the selected pixel window (x1, x2)
// ======================================================================
function applyBoxZoom(x1, x2) {
  const { domainLeft, domainRight } = state.scales;
  const { margin, innerW } = state.layout;

  const domainRange = domainRight - domainLeft;

  // Convert pixel → world (domain)
  const leftWorld  = domainLeft + ((x1 - margin.left) / innerW) * domainRange;
  const rightWorld = domainLeft + ((x2 - margin.left) / innerW) * domainRange;

  // Prevent invalid zoom
  if (!isFinite(leftWorld) || !isFinite(rightWorld) || rightWorld <= leftWorld) {
    return;
  }

  // Update zoom domain
  state.scales.domainLeft = leftWorld;
  state.scales.domainRight = rightWorld;
}
