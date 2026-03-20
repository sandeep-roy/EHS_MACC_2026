import { state } from "../state.js";

export function clampTransform() {
  const { margin, innerW } = state.layout;

  const leftWorld = margin.left * state.scale + state.translateX;
  const rightWorld = (margin.left + innerW) * state.scale + state.translateX;

  const leftBound = margin.left;
  const rightBound = margin.left + innerW;

  if (leftWorld > leftBound) {
    state.translateX -= (leftWorld - leftBound);
  }
  if (rightWorld < rightBound) {
    state.translateX += (rightBound - rightWorld);
  }
}

export function applyTransform() {
  const svg = state.svg;
  const layerBars = svg.querySelector("#barLayer");
  const layerAxis = svg.querySelector("#axisLayer");

  const transform = `scale(${state.scale},1) translate(${state.translateX},0)`;

  layerBars.setAttribute("transform", transform);
  layerAxis.setAttribute("transform", transform);
}
