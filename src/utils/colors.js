// ======================================================================
// colors.js — MACC color scale (domain-based rendering)
// ======================================================================
// Provides a consistent color mapping for MAC values.
// You can customize thresholds or colors as needed.
// ======================================================================

/**
 * macColor(v)
 * 
 * Returns a color for a given MAC (Marginal Abatement Cost) value.
 * Negative MAC values → green shades
 * Low-positive values  → yellow/orange
 * High-positive values → red tones
 */
export function macColor(v) {

  if (!isFinite(v)) return "#999";  // fallback for invalid values

  if (v <= -1000) return "#238b45"; // deep green
  if (v <= -500)  return "#74c476"; // medium green
  if (v < 0)      return "#bae4b3"; // light green

  if (v <= 500)   return "#fee391"; // light yellow
  if (v <= 1500)  return "#fdae6b"; // light orange
  if (v <= 3000)  return "#fd8d3c"; // orange

  return "#e31a1c";                 // red
}
