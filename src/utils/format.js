// ======================================================================
// format.js — Number formatting utilities for MACC chart
// ======================================================================
// Provides:
//   • Short number formatting (e.g., 12k, 3.5M)
//   • Clean formatting for X-axis tick labels
//   • Extendable for future currency or unit formats
// ======================================================================

/**
 * Formats large numbers into short form:
 *   1,250      → "1.3k"
 *   12,000     → "12k"
 *   3,450,000  → "3.5M"
 *   123        → "123"
 */
export function formatShortNumber(num) {
  if (!isFinite(num)) return "-";

  const abs = Math.abs(num);

  if (abs >= 1_000_000) {
    return (num / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1) + "M";
  }

  if (abs >= 1_000) {
    return (num / 1_000).toFixed(abs >= 10_000 ? 0 : 1) + "k";
  }

  return String(Math.round(num));
}

/**
 * Optional helper:
 * Comma formatting for readable large values.
 *   1234567 → "1,234,567"
 */
export function formatWithCommas(num) {
  if (!isFinite(num)) return "-";
  return Math.round(num).toLocaleString();
}
