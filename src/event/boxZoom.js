// ======================================================================
// boxZoom.js — FINAL STABLE VERSION
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

const MIN_RANGE = 500; // minimum domain range allowed
let boxMode = false;

export function initBoxZoom() {
  const svg = state.svg;
  const btn = document.getElementById("zoom-box");

  let startX = null;
  let rect = null;

  btn.onclick = () => {
    boxMode = !boxMode;
    btn.style.background = boxMode ? "#d0e0ff" : "#fff";
    svg.style.cursor = boxMode ? "crosshair" : "default";
  };

  svg.addEventListener("mousedown", evt => {
    if (!boxMode || evt.button !== 0) return;

    const x = getSvgX(evt, svg);
    if (!isFinite(x)) return;

    startX = x;
    rect = createRect();
    svg.querySelector("#overlayLayer").appendChild(rect);
  });

  svg.addEventListener("mousemove", evt => {
    if (!boxMode || !rect) return;

    const x = getSvgX(evt, svg);
    if (!isFinite(x)) return;

    const left = Math.min(startX, x);
    const right = Math.max(startX, x);

    rect.setAttribute("x", left);
    rect.setAttribute("width", right - left);
  });

  svg.addEventListener("mouseup", evt => {
    if (!boxMode || !rect) return;

    const endX = getSvgX(evt, svg);
    if (!isFinite(endX)) return;

    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);

    rect.remove();
    rect = null;

    boxMode = false;
    btn.style.background = "#fff";
    svg.style.cursor = "default";

    if (right - left < 20) return;

    applyBoxZoom(left, right);
    render();
  });
}

function applyBoxZoom(px1, px2) {
  const { margin, innerW } = state.layout;
  const { domainLeft, domainRight, totalAbate } = state.scales;

  const currentRange = domainRight - domainLeft;

  let leftWorld =
    domainLeft + ((px1 - margin.left) / innerW) * currentRange;
  let rightWorld =
    domainLeft + ((px2 - margin.left) / innerW) * currentRange;

  if (!isFinite(leftWorld) || !isFinite(rightWorld)) return;
  if (rightWorld - leftWorld < MIN_RANGE) {
    rightWorld = leftWorld + MIN_RANGE;
  }

  // Clamp
  leftWorld = Math.max(0, leftWorld);
  rightWorld = Math.min(totalAbate, rightWorld);

  state.scales.domainLeft = leftWorld;
  state.scales.domainRight = rightWorld;
}

function getSvgX(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
}

function createRect() {
  const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  r.setAttribute("y", state.layout.margin.top);
  r.setAttribute("height", state.layout.innerH);
  r.setAttribute("fill", "rgba(0,120,215,0.25)");
  r.setAttribute("stroke", "rgba(0,120,215,0.9)");
  r.setAttribute("stroke-width", "1.2");
  r.setAttribute("stroke-dasharray", "4 2");
  r.style.pointerEvents = "none";
  return r;
}
``
