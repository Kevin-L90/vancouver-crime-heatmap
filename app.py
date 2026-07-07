import io
import zipfile
import requests
import numpy as np
import pandas as pd
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

BASE_URL = "https://geodash.vpd.ca/opendata/crimedata_download"
AVAILABLE_YEARS = list(range(2026, 2002, -1))  # 2026 down to 2003

CRIME_TYPES = [
    "All Types",
    "Break and Enter Commercial",
    "Break and Enter Residential/Other",
    "Mischief",
    "Offence Against a Person",
    "Other Theft",
    "Theft from Vehicle",
    "Theft of Bicycle",
    "Theft of Vehicle",
    "Vehicle Collision or Pedestrian Struck (with Fatality)",
    "Vehicle Collision or Pedestrian Struck (with Injury)",
]

# In-memory cache: key → DataFrame
_data_cache: dict = {}


def utm_to_latlon_vec(x_arr, y_arr, zone=10):
    """
    Vectorised UTM Zone 10N → WGS84 lat/lon using numpy.
    Returns (lat_array, lon_array) in degrees.
    """
    k0 = 0.9996
    a  = 6378137.0
    e2 = 0.00669437999014          # first eccentricity squared
    e1 = (1 - np.sqrt(1 - e2)) / (1 + np.sqrt(1 - e2))

    x_adj = np.asarray(x_arr, dtype=np.float64) - 500000.0
    y_adj = np.asarray(y_arr, dtype=np.float64)          # northern hemisphere

    lon_0 = np.radians((zone - 1) * 6 - 180 + 3)

    M  = y_adj / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))

    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32)    * np.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * np.sin(4 * mu)
        + (151 * e1**3 / 96)                  * np.sin(6 * mu)
        + (1097 * e1**4 / 512)                * np.sin(8 * mu)
    )

    sin_phi1 = np.sin(phi1)
    cos_phi1 = np.cos(phi1)
    tan_phi1 = np.tan(phi1)

    N1 = a / np.sqrt(1 - e2 * sin_phi1**2)
    T1 = tan_phi1**2
    C1 = e2 * cos_phi1**2 / (1 - e2)
    R1 = a * (1 - e2) / (1 - e2 * sin_phi1**2)**1.5
    D  = x_adj / (N1 * k0)

    lat = phi1 - (
        N1 * tan_phi1 / R1 * (
            D**2 / 2
            - (5 + 3*T1 + 10*C1 - 4*C1**2 - 9*e2)       * D**4 / 24
            + (61 + 90*T1 + 298*C1 + 45*T1**2 - 252*e2 - 3*C1**2) * D**6 / 720
        )
    )
    lon = lon_0 + (
        D
        - (1 + 2*T1 + C1)                                      * D**3 / 6
        + (5 - 2*C1 + 28*T1 - 3*C1**2 + 8*e2 + 24*T1**2)      * D**5 / 120
    ) / cos_phi1

    return np.degrees(lat), np.degrees(lon)


def fetch_year_data(year: int) -> pd.DataFrame:
    """Download + parse CSV for a given year. Returns empty DataFrame on failure."""
    cache_key = str(year)
    if cache_key in _data_cache:
        return _data_cache[cache_key]

    url = f"{BASE_URL}/AllNeighbourhoods_{year}/crimedata_csv_AllNeighbourhoods_{year}.zip"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        csv_name = [n for n in zf.namelist() if n.endswith(".csv")][0]
        df = pd.read_csv(zf.open(csv_name), low_memory=False)
        df.columns = [c.strip().upper() for c in df.columns]

        # Keep only rows with valid coordinates
        df = df.dropna(subset=["X", "Y"])
        df["X"] = pd.to_numeric(df["X"], errors="coerce")
        df["Y"] = pd.to_numeric(df["Y"], errors="coerce")
        df = df.dropna(subset=["X", "Y"])
        df = df[(df["X"] != 0) & (df["Y"] != 0)]

        # Vectorised UTM → lat/lon (much faster than row-by-row)
        lat_arr, lon_arr = utm_to_latlon_vec(df["X"].values, df["Y"].values)
        df = df.copy()
        df["LAT"] = lat_arr
        df["LON"] = lon_arr
        df = df.dropna(subset=["LAT", "LON"])

        # Sanity-check: Vancouver lat 49.0–49.5, lon -123.3 – -122.9
        df = df[
            (df["LAT"] >= 49.0)
            & (df["LAT"] <= 49.5)
            & (df["LON"] >= -123.3)
            & (df["LON"] <= -122.9)
        ]

        _data_cache[cache_key] = df
        return df
    except Exception as e:
        print(f"[WARN] Could not fetch data for {year}: {e}")
        return pd.DataFrame()


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.route("/")
def index():
    return render_template("index.html", years=AVAILABLE_YEARS, crime_types=CRIME_TYPES)


@app.route("/api/heatmap")
def api_heatmap():
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)          # 1-12 or None
    crime_type = request.args.get("crime_type", "All Types")
    limit = request.args.get("limit", 8000, type=int)

    if not year:
        return jsonify({"error": "year is required"}), 400

    df = fetch_year_data(year)
    if df.empty:
        return jsonify({"points": [], "count": 0, "error": "Data not available for this year"})

    # Filter by month
    if month and "MONTH" in df.columns:
        df = df[df["MONTH"] == month]

    # Filter by crime type
    if crime_type and crime_type != "All Types" and "TYPE" in df.columns:
        df = df[df["TYPE"].str.strip() == crime_type]

    # Down-sample if needed
    if len(df) > limit:
        df = df.sample(limit, random_state=42)

    points = df[["LAT", "LON"]].values.tolist()
    return jsonify({"points": points, "count": len(df)})


@app.route("/api/stats")
def api_stats():
    """Return crime type breakdown for the given year/month."""
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)

    if not year:
        return jsonify({"error": "year is required"}), 400

    df = fetch_year_data(year)
    if df.empty:
        return jsonify({"stats": {}, "total": 0})

    if month and "MONTH" in df.columns:
        df = df[df["MONTH"] == month]

    if "TYPE" in df.columns:
        stats = df["TYPE"].value_counts().to_dict()
    else:
        stats = {}

    return jsonify({"stats": stats, "total": len(df)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
