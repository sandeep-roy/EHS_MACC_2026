MACC EHS — Variable‑Width MACC (SAC Custom Widget)
A SAP Analytics Cloud (SAC) custom widget that renders a Marginal Abatement Cost Curve (MACC) with variable bar width (X = abatement), bar height (Y = MAC), responsive layout, and a Styling Panel for display controls. Supports data binding via Builder panel (1 dimension + 2 measures), tooltips, dynamic resizing, and Plotly modebar pinned top‑right.

✨ Features
	•	Variable‑width bars on the X‑axis (width = Abatement).
	•	Bar height on Y‑axis (MAC in EUR/tCO₂e).
	•	Responsive: resizes smoothly with SAC widget size changes (ResizeObserver + SAC resize).
	•	Tooltips: robust, filter‑safe tooltips with Project, MAC, Abatement, and Shown Width.
	•	Styling Panel: width cap %, minimum width %, X‑padding %, font size, color mode (gradient/single).
	•	Modebar (Plotly) pinned to top‑right for quick actions (zoom, pan, save image, etc.).
	•	Optimized for filtering: bars remain visible & hoverable even for very small subsets.

⚙️ What the properties do
	•	Width Cap (%) Caps any single bar’s width to a fraction of total abatement (prevents one bar dominating).
	•	Minimum Width (%) Ensures very small projects are still visible and hoverable (also has a pixel‑based fallback).
	•	X Padding (%) Adds space on both sides so edge bars aren’t jammed against the axes.
	•	Font Size (px) Scales axis label/tick fonts for smaller or larger widget sizes.
	•	Color Mode
	◦	gradient: negative MAC → green; positive MAC → yellow→orange→red gradient.
	◦	single: negative MAC → green; positive MAC → single color (orange).

📄 License
Add your preferred OSS license here (e.g., MIT/Apache‑2.0), or state “All rights reserved” for private usage.
