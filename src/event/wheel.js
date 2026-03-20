// ======================================================================
// wheel.js — Mouse wheel zoom for domain-based MACC chart
// ======================================================================
// Behavior:
//   • Zoom IN when scrolling upward
//   • Zoom OUT when scrolling downward
//   • Zooms around mouse pointer location (intuitive UX)
//   • Uses domainLeft/domainRight (NOT transforms)
//   • Always clamps zoom to prevent collapse or inversion
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

export function initWheelZoom() {
  const svg = state.svg;

  svg.addEventListener("wheel", evt => {
    evt.preventDefault();

    const { margin, innerW } = state.layout;
    let { domainLeft, domainRight } = state.scales;

    const domainRange = domainRight - domainLeft;
    if (domainRange <= 0) return;

    // 1. Determine zoom factor
    const zoomFactor = evt.deltaY < 0 ? 0.8 : 1.25;  // scroll up=zoom in, down=zoom out

    // 2. Convert mouse → SVG coordinate
    const mouseX_svg = getSvgX(evt, svg);

    // 3. Map mouse position → world coordinate
    const mouseWorld =
      domainLeft + ((mouseX_svg - margin.left) / innerW) * domainRange;

    // 4. Compute new zoom window
    const newRange = domainRange * zoomFactor;

    // 5. Compute new domain bounds (centered on mouse)
    let newLeft = mouseWorld - newRange / 2;
    let newRight = mouseWorld + newRange / 2;

    // 6. Clamp domain to avoid invalid values
    const minSpan = 1;  // at least 1 tCO₂e visible
    if (newRight - newLeft < minSpan) return;

    // 7. Store in state
    state.scales.domainLeft = newLeft;
    state.scales.domainRight = newRight;

    // 8. Redraw entire chart with new domain
    render();
  });
}

// ======================================================================
// Utility: Convert mouse (clientX/clientY) → SVG coordinate space
// SAC IFRAME resizing safe
// ======================================================================
function getSvgX(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;

  const svgPoint = pt.matrixTransform(svg.getScreenCTM().inverse());
  return svgPoint.x;
}
