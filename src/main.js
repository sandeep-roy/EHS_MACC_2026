// ======================================================================
// main.js — Main controller for MACC Domain-Based Zoom Engine
// ======================================================================
// Responsibilities:
//   • Initialize chart inside SAC IFRAME
//   • Register interaction modules (zoom/pan/wheel/box-zoom)
//   • Handle incoming SAC data via postMessage
//   • Compute layout → prepare data → scales → draw layers
//   • Drive full re-render for every zoom/pan event
// ======================================================================

import { state } from "./state.js";
import { computeLayout } from "./layout.js";
import { prepareData } from "./dataPrep.js";
import { applyScales } from "./scales.js";

import { drawSVGBase } from "./draw/drawSVG.js";
import { drawGrid } from "./draw/drawGrid.js";
import { drawAxes } from "./draw/drawAxes.js";
import { drawXTicks } from "./draw/drawXTicks.js";
import { drawBars } from "./draw/drawBars.js";
import { initTooltip } from "./draw/drawTooltip.js";

import { initWheelZoom } from "./event/wheel.js";
import { initPan } from "./event/pan.js";
import { initBoxZoom } from "./event/boxZoom.js";
import { initZoomButtons } from "./event/zoomButtons.js";

// ======================================================================
// initMACC() — Entry point from iframe.html
// ======================================================================
export function initMACC() {
  state.svg = document.getElementById("svg");
  state.tooltip = document.getElementById("tooltip");

  // ------------------------------
  // Initialize interaction modules
  // ------------------------------
  initTooltip();
  initWheelZoom();
  initPan();
  initBoxZoom();
  initZoomButtons();

  // ------------------------------
  // Listen for SAC custom widget data
  // ------------------------------
  window.addEventListener("message", evt => {
    if (evt.data?.type === "update") {
      state.raw = evt.data.payload;
      render();
    }
  });

  // Initial draw (empty chart until data arrives)
  render();
}

// ======================================================================
// render() — Full drawing pipeline
// Called on: zoom, pan, resize, SAC data update
// ======================================================================
export function render() {

  const svg = state.svg;
  if (!svg) return;

  // ------------------------------
  // 1. Build SVG layers
  // ------------------------------
  drawSVGBase();

  // ------------------------------
  // 2. Compute layout (sizes, clip)
  // ------------------------------
  computeLayout();

  // No data yet? stop here
  if (!state.raw) return;

  // ------------------------------
  // 3. Prepare data into rows[]
  // ------------------------------
  prepareData();

  // ------------------------------
  // 4. Compute scales
  // ------------------------------
  applyScales();

  // ------------------------------
  // 5. Draw layers (order matters)
  // ------------------------------
  drawGrid();     // background grid
  drawAxes();     // y-axis ticks, labels, zero line
  drawBars();     // MACC bars
  drawXTicks();   // x-axis tick labels (on top)

  // Tooltip remains active and works automatically
}
