// ======================================================================
// layout.js — Computes drawing area dimensions
// ======================================================================
// This module:
//   ✔ Reads actual SVG size
//   ✔ Computes inner chart region
//   ✔ Updates clip rectangle for barLayer
//   ✔ Works reliably inside SAC IFRAME (resizes correctly)
// ======================================================================

import { state } from "./state.js";

export function computeLayout() {
  const svg = state.svg;
  const W = svg.clientWidth;
  const H = svg.clientHeight;

  const margin = state.layout.margin;
  const innerW = Math.max(100, W - margin.left - margin.right);
  const innerH = Math.max(100, H - margin.top - margin.bottom);

  state.layout.W = W;
  state.layout.H = H;
  state.layout.innerW = innerW;
  state.layout.innerH = innerH;

  // Update clipPath for bars
  const clipRect = svg.querySelector("#clipRect");
  if (clipRect) {
    clipRect.setAttribute("x", margin.left);
    clipRect.setAttribute("y", margin.top);
    clipRect.setAttribute("width", innerW);
    clipRect.setAttribute("height", innerH);
  }
}
