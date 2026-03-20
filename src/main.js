import { state } from "./state.js";
import { prepareData } from "./dataPrep.js";
import { computeLayout } from "./layout.js";
import { applyScales } from "./scales.js";

import { drawSVGBase } from "./draw/drawSVG.js";
import { drawGrid } from "./draw/drawGrid.js";
import { drawAxes } from "./draw/drawAxes.js";
import { drawBars } from "./draw/drawBars.js";
import { drawLabels } from "./draw/drawLabels.js";
import { drawXTicks } from "./draw/drawXTicks.js";
import { initTooltip } from "./draw/drawTooltip.js";

import { initWheelZoom } from "./events/wheel.js";
import { initPan } from "./events/pan.js";
import { initZoomButtons } from "./events/zoomButtons.js";
import { initResize } from "./events/resize.js";

export function initMACC() {
  state.svg = document.getElementById("svg");
  state.tooltip = document.getElementById("tooltip");

  initTooltip();
  initWheelZoom();
  initPan();
  initZoomButtons();
  initResize();

  window.addEventListener("message", event => {
    if (event.data?.type === "update") {
      state.raw = event.data.payload;
      render();
    }
  });

  render();
}

export function render() {
  if (!state.raw) return;

  drawSVGBase();
  computeLayout();
  prepareData();
  applyScales();

  drawGrid();
  drawAxes();
  drawBars();
  drawXTicks();
  drawLabels();
}
