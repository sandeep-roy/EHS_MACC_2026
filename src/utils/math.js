// ======================================================================
// math.js — Minimal math helpers for domain-based MACC chart
// ======================================================================
// NOTE:
//  • Old CSS transform code is intentionally removed.
//  • Domain-based zoom (domainLeft/domainRight) controls the chart.
//  • All rendering is recalculated on each event.
// ======================================================================

// Placeholder functions preserved to avoid breaking imports.
// They intentionally do nothing now.

export function applyTransform() {
  // Left intentionally empty.
  // All visual updates now happen through domain-based re-render.
}

export function clampTransform() {
  // Left intentionally empty.
  // No transform-based clamps required in domain engine.
}
