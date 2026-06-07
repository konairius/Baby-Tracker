# 🍼 Baby Food Tracker

A simple, self-contained web app for tracking a baby's food consumption. No build
step, no server, no dependencies — just open it in a browser.

## Features

- **Feeding log** in a table with columns: Date, Time, Provided (ml),
  Not consumed (ml), and **Consumed (ml)** which is calculated automatically
  (`provided − not consumed`).
- **Daily summary** table aggregating feedings per day (count, provided,
  not consumed, consumed), plus an all-days total when more than one day exists.
- **Add, edit, and delete** entries.
- **Local persistence** — data is saved in the browser's `localStorage`, so it
  survives page reloads on the same device/browser.
- **CSV import / export** — back up your data or move it between devices.
- **Printable tracking sheet + photo import** — print a paper sheet, fill it in by
  hand, then photograph it and let Claude read the rows into the app.
- Input validation (e.g. not-consumed cannot exceed provided).

## Track by hand, then import from a photo

For pen-and-paper tracking:

1. Click **🖨 Tracking sheet (PDF)** to download a printable A4 sheet, and print it.
2. Fill in feedings by hand during the day (Date, Time, Provided, Not consumed).
3. Click **📷 Import from photo**, paste your [Anthropic API key](https://console.anthropic.com/settings/keys)
   (stored only in your browser), choose a model, and snap/upload a photo of the sheet.
4. The app sends the photo to the Claude API, which transcribes the rows. **Review and
   edit** the extracted values, then click **Add to log**.

Notes:
- The API key and the photo are sent **directly to Anthropic** from your browser
  (using the `anthropic-dangerous-direct-browser-access` header). No server is involved.
- Handwriting recognition isn't perfect — always review before adding. The default
  model is **Opus 4.8** (most accurate); Sonnet 4.6 and Haiku 4.5 are cheaper options.
- The photo is downscaled in-browser before upload to keep cost and size reasonable.
- Calls to the Claude API are billed to your own Anthropic account.

The PDF generator is dependency-free (it emits raw PDF), so it works offline too.

## CSV format

Export produces a file named `baby-food-tracker-YYYY-MM-DD.csv` with these columns:

```csv
Date,Time,Provided (ml),Not consumed (ml),Consumed (ml)
2026-06-07,08:30,120,20,100
```

Import reads the same layout. The **Consumed** column is optional on import —
it's always recalculated as `provided − not consumed`. The header row is
optional, dates may be `YYYY-MM-DD` or `D.M.YYYY` / `D/M/YYYY`, and invalid rows
are skipped. When you already have entries, import lets you choose to **add** to
them or **replace** them.

## Usage

Open `index.html` in any modern browser. That's it.

Or serve it locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure (form + tables) |
| `styles.css` | Styling |
| `app.js` | Logic: state, persistence, validation, rendering, CSV, photo import |
| `sheet-pdf.js` | Dependency-free generator for the printable tracking sheet |

## Notes

All measurements are in milliliters (ml). Data lives only in your browser; use
the **Clear all data** link in the footer to wipe it.

## License

This project is licensed under the **GNU General Public License v3.0** — see the
[`LICENSE`](LICENSE) file for the full text.

Copyright (C) 2026 konairius

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.

