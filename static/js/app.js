/* ─────────────────────────────────────────────────────────────────────────────
   Vancouver Crime Heatmap — app.js
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

// ─── Map initialisation ──────────────────────────────────────────────────────
const map = L.map('map', {
  center: [49.2488, -123.1162],
  zoom: 13,
  zoomControl: true,
  attributionControl: true,
});

// Dark-friendly tile layer (CartoDB Dark Matter)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

// ─── State ───────────────────────────────────────────────────────────────────
let heatLayer = null;
let isLoading = false;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const yearSelect      = document.getElementById('yearSelect');
const monthSelect     = document.getElementById('monthSelect');
const crimeTypeSelect = document.getElementById('crimeTypeSelect');
const applyBtn        = document.getElementById('applyBtn');
const loadingOverlay  = document.getElementById('loadingOverlay');
const loadingText     = document.getElementById('loadingText');
const statCount       = document.getElementById('statCount');
const statPeriod      = document.getElementById('statPeriod');
const statType        = document.getElementById('statType');
const breakdownList   = document.getElementById('breakdownList');
const toast           = document.getElementById('toast');
const sidebar         = document.getElementById('sidebar');
const sidebarToggle   = document.getElementById('sidebarToggle');
const sidebarOpenBtn  = document.getElementById('sidebarOpenBtn');

// ─── Sidebar toggle ───────────────────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  setTimeout(() => map.invalidateSize(), 260);
});
sidebarOpenBtn.addEventListener('click', () => {
  sidebar.classList.remove('collapsed');
  setTimeout(() => map.invalidateSize(), 260);
});

// ─── Toast helper ─────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// ─── Loading helpers ──────────────────────────────────────────────────────────
function setLoading(on, msg = 'Loading crime data…') {
  isLoading = on;
  loadingText.textContent = msg;
  loadingOverlay.classList.toggle('active', on);
  applyBtn.disabled = on;
  applyBtn.classList.toggle('loading', on);
}

// ─── Month name ───────────────────────────────────────────────────────────────
const MONTHS = ['', 'January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ─── Fetch & render heatmap ───────────────────────────────────────────────────
async function fetchAndRender() {
  if (isLoading) return;

  const year      = yearSelect.value;
  const month     = monthSelect.value;
  const crimeType = crimeTypeSelect.value;

  const yearNum  = parseInt(year);
  const monthNum = parseInt(month) || 0;

  const periodLabel = monthNum
    ? `${MONTHS[monthNum]} ${yearNum}`
    : `${yearNum} (all months)`;

  setLoading(true, `Fetching ${periodLabel} data…`);

  try {
    // Parallel requests: heatmap points + stats breakdown
    const params = new URLSearchParams({ year });
    if (month)      params.set('month', month);
    if (crimeType)  params.set('crime_type', crimeType);

    const [heatRes, statsRes] = await Promise.all([
      fetch('/api/heatmap?' + params.toString()),
      fetch('/api/stats?'   + new URLSearchParams({ year, ...(month && { month }) }).toString()),
    ]);

    const heatData  = await heatRes.json();
    const statsData = await statsRes.json();

    if (heatData.error && heatData.points?.length === 0) {
      showToast('⚠️ ' + (heatData.error || 'No data available'), 'error');
      setLoading(false);
      return;
    }

    // ── Update heatmap ───────────────────────────────────────────────────────
    if (heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = null;
    }

    const points = heatData.points || [];

    if (points.length > 0) {
      heatLayer = L.heatLayer(points, {
        radius: 18,
        blur: 22,
        maxZoom: 17,
        gradient: {
          0.0: 'rgba(0,0,255,0)',
          0.2: 'rgba(0,0,255,0.5)',
          0.4: 'rgba(0,255,255,0.7)',
          0.6: 'rgba(0,255,0,0.8)',
          0.75: 'rgba(255,255,0,0.9)',
          1.0: 'rgba(255,0,0,1)',
        },
      }).addTo(map);
    }

    // ── Update stats panel ───────────────────────────────────────────────────
    statCount.textContent  = points.length.toLocaleString();
    statPeriod.textContent = periodLabel;
    statType.textContent   = crimeType || 'All Types';

    // ── Breakdown chart ──────────────────────────────────────────────────────
    renderBreakdown(statsData.stats || {});

    const shown = points.length;
    const note  = heatData.count !== undefined && heatData.count > shown
      ? ` (showing ${shown.toLocaleString()} of ${statsData.total?.toLocaleString()})`
      : '';
    showToast(`✓ Loaded ${shown.toLocaleString()} incidents${note}`);

  } catch (err) {
    console.error(err);
    showToast('❌ Failed to load data. Please try again.', 'error');
  } finally {
    setLoading(false);
  }
}

// ─── Breakdown chart renderer ─────────────────────────────────────────────────
function renderBreakdown(stats) {
  breakdownList.innerHTML = '';
  if (!stats || Object.keys(stats).length === 0) {
    breakdownList.innerHTML = '<p style="font-size:0.75rem;color:var(--text-dim);text-align:center;padding:8px 0">No data</p>';
    return;
  }

  const sorted  = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  const topN    = sorted.slice(0, 8);
  const maxVal  = topN[0]?.[1] || 1;

  topN.forEach(([name, count]) => {
    const pct = Math.round((count / maxVal) * 100);
    const item = document.createElement('div');
    item.className = 'breakdown-item';
    item.innerHTML = `
      <div class="breakdown-item-header">
        <span class="breakdown-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="breakdown-count">${count.toLocaleString()}</span>
      </div>
      <div class="breakdown-bar-track">
        <div class="breakdown-bar-fill" style="width:${pct}%"></div>
      </div>`;
    breakdownList.appendChild(item);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Event listeners ──────────────────────────────────────────────────────────
applyBtn.addEventListener('click', fetchAndRender);

// Also trigger on Enter key in selects
[yearSelect, monthSelect, crimeTypeSelect].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') fetchAndRender(); });
});

// ─── Auto-load on startup ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Small delay to let the map render first
  setTimeout(fetchAndRender, 200);
});
