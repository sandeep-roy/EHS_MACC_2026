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

import { initWheelZoom } from "./event/wheel.js";
import { initPan } from "./event/pan.js";
import { initZoomButtons } from "./event/zoomButtons.js";
import { initResize } from "./event/resize.js";
import { initBoxZoom } from "./event/boxZoom.js";

export function initMACC() {
  state.svg = document.getElementById("svg");
  state.tooltip = document.getElementById("tooltip");

  initTooltip();
  initWheelZoom();
  initPan();
  initZoomButtons();
  initResize();
  initBoxZoom();

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
