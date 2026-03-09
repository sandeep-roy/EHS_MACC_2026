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

📦 Repository layout
EHS_MACC_2026/
├─ MACC.js                 # Main widget (v1.0.9 final)
├─ MACC_styling.js         # Styling panel web component (v1.0.8 final)
├─ README.md               # This file
└─ (optional) assets/      # Any icons/images (if you add one for the widget)
Important: These files must be publicly accessible over HTTPS (e.g., GitHub Pages).


🧭 Using the widget in a Story / App
	1	Ensure the story/app is in Optimized mode (Runtime View Optimization).
	2	Insert the widget.
	3	In Builder panel (data binding):
	◦	Dimension → Project name
	◦	Measure 1 (Abatement) → Total abatement (tCO₂e)
	◦	Measure 2 (MAC) → MAC (EUR/tCO₂e)
	4	In Styling panel:
	◦	Width Cap (%): 8–12 is a good start
	◦	Minimum Width (%): 0.1–0.3
	◦	X Padding (%): 4–8
	◦	Font Size: 11–13
	◦	Color Mode: Gradient (default) or Single

⚙️ What the properties do
	•	Width Cap (%) Caps any single bar’s width to a fraction of total abatement (prevents one bar dominating).
	•	Minimum Width (%) Ensures very small projects are still visible and hoverable (also has a pixel‑based fallback).
	•	X Padding (%) Adds space on both sides so edge bars aren’t jammed against the axes.
	•	Font Size (px) Scales axis label/tick fonts for smaller or larger widget sizes.
	•	Color Mode
	◦	gradient: negative MAC → green; positive MAC → yellow→orange→red gradient.
	◦	single: negative MAC → green; positive MAC → single color (orange).

🧪 Data & model expectations
	•	Dimension: Project (string label)
	•	Measure 1: Abatement (positive values, tCO₂e)
	•	Measure 2: MAC (can be negative/positive, EUR/tCO₂e)
The X‑axis is linear and uses actual variable widths; a small positive minimum width (and pixel fallback) ensures hover remains usable even on filtered subsets.

🛠 Troubleshooting
	1	Blank widget in View mode
	◦	Open the resource URLs in a new browser tab. You must see raw JS, not a GitHub HTML page or 404.
	◦	If you updated a file, bump the ?v= query and insert a fresh widget instance.
	2	No Builder panel
	◦	Ensure the story/app is Optimized (Runtime View Optimization).
	◦	JSON must include dataBindings with feeds, and the widget declares getDataBindings().
	3	No tooltips after filtering
	◦	Use the final files (MACC.js v1.0.9) — tooltips are filter‑safe via object‑based customdata.
	4	Bars look squished at edges
	◦	Increase X Padding (%) in Styling panel.
	◦	Adjust Width Cap and Minimum Width to balance the layout.
	5	Modebar not at top‑right
	◦	Ensure you’re using the provided template CSS (in MACC.js) which pins .modebar within the Shadow DOM.

🔒 Security & hosting notes
	•	Files must be hosted over HTTPS and publicly accessible (no authentication prompts).
	•	If your corporate policy restricts GitHub Pages, host on an internal HTTPS server or a CDN (Netlify, Cloudflare Pages, S3, etc.).
	•	Always version the file URL with ?v= to avoid stale caches.

📄 License
Add your preferred OSS license here (e.g., MIT/Apache‑2.0), or state “All rights reserved” for private usage.
