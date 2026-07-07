# 🗺️ Vancouver Crime Heatmap

An interactive heatmap of Vancouver crime data sourced live from the [Vancouver Police Department's GeoDASH Open Data portal](https://geodash.vpd.ca/opendata/).

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python)
![Flask](https://img.shields.io/badge/Flask-3.x-black?logo=flask)
![Leaflet](https://img.shields.io/badge/Leaflet.js-1.9-green?logo=leaflet)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features

- **Interactive heatmap** — Leaflet.js with the `leaflet.heat` plugin on a CARTO Dark Matter basemap
- **Filter by Year** — data available from 2003 to 2026
- **Filter by Month** — drill down to any individual month
- **Filter by Crime Type** — 11 categories (Break & Enter, Theft of Vehicle, Mischief, etc.)
- **Crime Breakdown chart** — animated bar chart of the top 8 crime types for the selected period
- **Fast UTM conversion** — NumPy-vectorized coordinate transformation (UTM Zone 10N → WGS84)
- **In-memory caching** — year data downloaded once, subsequent filters are instant
- **Dark glassmorphism UI** — collapsible sidebar, smooth animations, toast notifications

---

## 🖼️ Screenshot

> Open the app at `http://localhost:5000` after running locally.

---

## 🚀 Running Locally

### Prerequisites

- Python 3.11+
- `pip`

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Kevin-L90/vancouver-crime-heatmap.git
cd vancouver-crime-heatmap

# 2. Create and activate a virtual environment (recommended)
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the Flask development server
python app.py
```

Open **http://localhost:5000** in your browser.

> **Note:** The first time you apply a filter, the app fetches and processes the full-year CSV (~50 MB) from the VPD portal. This takes 10–30 seconds depending on your connection. Subsequent filters on the same year are instant (cached in memory).

---

## 📁 Project Structure

```
vancouver-crime-heatmap/
├── app.py                  # Flask backend — data fetching, UTM conversion, API routes
├── requirements.txt        # Python dependencies
├── Procfile                # For Heroku / Render / Railway deployment
├── templates/
│   └── index.html          # Jinja2 HTML template
└── static/
    ├── css/
    │   └── style.css       # Dark-mode UI styles
    └── js/
        └── app.js          # Leaflet map, heatmap rendering, filter controls
```

---

## 🌐 Deploying to Render (free tier)

1. Push this repo to GitHub (already done ✅)
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your `vancouver-crime-heatmap` GitHub repo
4. Render will auto-detect the `Procfile` and use:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn app:app`
5. Click **Deploy**

> ⚠️ The free tier has limited RAM (~512 MB). Loading a full year of VPD data may be slow. Consider adding a `--timeout 120` flag to the gunicorn command for the first load.

---

## 📡 API Endpoints

| Method | Endpoint | Params | Description |
|--------|----------|--------|-------------|
| `GET` | `/` | — | Main heatmap page |
| `GET` | `/api/heatmap` | `year`, `month?`, `crime_type?` | Returns `[lat, lon]` point array |
| `GET` | `/api/stats` | `year`, `month?` | Returns crime-type breakdown counts |

---

## 📊 Data Source

All data is sourced from the **Vancouver Police Department GeoDASH Open Data** portal:
- URL: https://geodash.vpd.ca/opendata/
- Updated every Sunday
- Coordinates are approximate (100-block resolution for property crimes; randomized for offences against a person)
- No personal or identifying information is included

---

## ⚖️ Disclaimer

> The data is provided by the VPD for community awareness only. Neither the Vancouver Police Department, Vancouver Police Board, nor the City of Vancouver assumes liability for any decisions made based on this data. Do not use this tool to assess the specific safety level of any particular location.

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
