// ======================================================================
// pan.js — Horizontal panning for domain-based MACC chart
// ======================================================================
// This module provides stable, transform-free panning using domainLeft /
// domainRight. As the user drags horizontally, the visible domain window
// shifts accordingly, and the entire chart is re-rendered.
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

export function initPan() {
  const svg = state.svg;

  let startX = null;      // last pointer X in SVG space
  let isDragging = false;

  svg.addEventListener("mousedown", evt => {
    // Do NOT pan in box-zoom mode
    const zoomBtn = document.getElementById("zoom-box");
    const boxModeActive = zoomBtn && zoomBtn.style.background === "rgb(208, 224, 255)";
    if (boxModeActive) return;

    if (evt.button !== 0) return; // left mouse only

    startX = getSvgX(evt, svg);
    isDragging = true;
    svg.style.cursor = "grabbing";
  });

  svg.addEventListener("mousemove", evt => {
    if (!isDragging || startX === null) return;

    const curX = getSvgX(evt, svg);

    const { margin, innerW } = state.layout;
    const { domainLeft, domainRight } = state.scales;

    const domainRange = domainRight - domainLeft;

    // dx in pixel space
    const dx = curX - startX;

    // convert pixel drag → world drag
    const moveWorld = (dx / innerW) * domainRange;

    // shift domain window
    state.scales.domainLeft -= moveWorld;
    state.scales.domainRight -= moveWorld;

    // remember last X for continued dragging
    startX = curX;

    // re-render entire chart
    render();
  });

  svg.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      svg.style.cursor = "default";
    }
  });

  // In some cases mouse may leave the chart area mid-drag
  svg.addEventListener("mouseleave", () => {
    if (isDragging) {
      isDragging = false;
      svg.style.cursor = "default";
    }
  });
}

// ======================================================================
// Convert mouse → SVG X coordinate using CTM transform
// This is SAC-compatible and stable under iframe resizing.
// ======================================================================
function getSvgX(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;

  const svgPoint = pt.matrixTransform(svg.getScreenCTM().inverse());
  return svgPoint.x;
}
