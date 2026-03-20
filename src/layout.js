import { state } from "./state.js";

export function computeLayout() {
  const svg = state.svg;
  const W = svg.clientWidth;
  const H = svg.clientHeight;

  const margin = state.layout.margin;
  const innerW = Math.max(500, W - margin.left - margin.right);
  const innerH = H - margin.top - margin.bottom;

  state.layout = { W, H, innerW, innerH, margin };

  const clip = svg.querySelector("#clipRect");
  if (clip) {
    clip.setAttribute("x", margin.left);
    clip.setAttribute("y", margin.top);
    clip.setAttribute("width", innerW);
    clip.setAttribute("height", innerH);
  }
}
``
