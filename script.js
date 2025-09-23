/*
 * Script for the Halifax Surf Forecast web app.
 *
 * This file loads surf spot metadata from your Supabase backend and
 * populates the list and dropdown on the page. It also handles
 * submission of surf session feedback to the `sessions_feedback`
 * table. To use this on your own Supabase project, adjust
 * `SUPABASE_URL` and `SUPABASE_ANON_KEY` below.
 */

/* === CONFIG (same as before) === */
const SUPABASE_URL = 'https://htwjccgteazjxqjbmvsq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_WRn9G0BhzuO8vzVy33JhhA_9tlUt_BV';

const REST = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

/* DOM */
const statusEl = document.getElementById('status');
const forecastWrap = document.getElementById('forecast-wrap');
const spotsListEl = document.getElementById('spot-list');
const formEl = document.getElementById('feedback-form');
const formMsg = document.getElementById('feedback-status');
const spotSelectEl = document.getElementById('spot-select');
const summaryWrap = document.getElementById('summary-wrap');

let SPOTS = [];

/* -----------------------
   Simple view switching
------------------------ */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.querySelector(`nav button[data-view="${id}"]`).classList.add('active');
}

document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

/* -----------------------
   1) Spots
------------------------ */
async function fetchSpots() {
  try {
    const res = await fetch(`${REST}/spots?select=id,name,lat,lon,notes`, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    SPOTS = await res.json();

    // Render list
    spotsListEl.innerHTML = SPOTS.map(s => `
      <div class="card"><strong>${s.name}</strong><br>${s.notes || ''}</div>
    `).join('');

    // Populate dropdown for feedback
    spotSelectEl.innerHTML = SPOTS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    statusEl.textContent = `Loaded ${SPOTS.length} spots`;
  } catch (err) {
    statusEl.textContent = `Error loading spots: ${err.message}`;
    statusEl.style.color = 'red';
  }
}

/* -----------------------
   2) Forecasts
------------------------ */
function todayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function isoDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchForecastsSupabase() {
  const start = `${isoDate(todayUTC())}T00:00:00Z`;
  const end = `${isoDate(new Date(todayUTC().getTime() + 86400000))}T00:00:00Z`;

  const url = `${REST}/daily_forecast` +
    `?select=spot_id,valid_time,predicted_quality,predicted_stoke,text_summary` +
    `&valid_time=gte.${encodeURIComponent(start)}` +
    `&valid_time=lte.${encodeURIComponent(end)}` +
    `&order=spot_id.asc,valid_time.asc`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

function nameForSpot(id) {
  const s = SPOTS.find(x => x.id === id);
  return s ? s.name : 'Spot';
}

function renderSupabaseForecasts(rows) {
  if (!rows.length) return false;

  const bySpot = rows.reduce((acc, r) => {
    (acc[r.spot_id] ||= []).push(r);
    return acc;
  }, {});

  forecastWrap.innerHTML = Object.entries(bySpot).map(([spotId, list]) => {
    const r = list[0];
    return `
      <div class="card">
        <strong>${nameForSpot(spotId)}</strong><br/>
        ${r.text_summary || '—'}<br/>
        Stoke: ${Number(r.predicted_stoke).toFixed(1)} • Quality: ${Math.round(Number(r.predicted_quality))}/100
      </div>`;
  }).join('');
  return true;
}

/* Fallback: live buoy 44258 (display-only) */
async function fetchBuoy() {
  const res = await fetch('https://www.ndbc.noaa.gov/data/realtime2/44258.txt');
  if (!res.ok) throw new Error(`NDBC ${res.status}`);
  const line = res.text ? await res.text() : '';
  const lines = line.trim().split('\n').filter(l => !l.startsWith('#'));
  const cols = (lines[0] || '').trim().split(/\s+/);
  return {
    H: parseFloat(cols[8] || '0'),     // WVHT (m)
    P: parseFloat(cols[9] || '0'),     // DPD (s)
    W: parseFloat(cols[5] || '0')      // WDIR (degT)
  };
}
function quickScore(h, p) {
  let q = 0;
  q += Math.max(0, Math.min(40, (h - 0.6) * 50));
  q += Math.max(0, Math.min(20, (p - 7) * 4));
  q += 15; // pretend offshore + aligned; tune later
  const stoke = Math.max(1, Math.min(5, 1 + 4 * (q / 100)));
  return { q: Math.max(0, Math.min(100, q)), s: stoke };
}
function renderBuoyFallback(b) {
  forecastWrap.innerHTML = SPOTS.map(s => {
    const sc = quickScore(b.H, b.P);
    return `
      <div class="card">
        <strong>${s.name}</strong><br/>
        ${b.H.toFixed(1)}m @ ${b.P.toFixed(0)}s; wind ${b.W.toFixed(0)}°<br/>
        Stoke: ${sc.s.toFixed(1)} • Quality: ${Math.round(sc.q)}/100
      </div>`;
  }).join('');
}

async function loadForecasts() {
  try {
    const rows = await fetchForecastsSupabase();
    const ok = renderSupabaseForecasts(rows);
    if (!ok) {
      const b = await fetchBuoy();
      renderBuoyFallback(b);
    }
  } catch (err) {
    try {
      const b = await fetchBuoy();
      renderBuoyFallback(b);
    } catch (e2) {
      forecastWrap.innerHTML = `<p style="color:red">Could not load forecasts: ${e2.message}</p>`;
    }
  }
}

/* -----------------------
   3) Feedback submit
------------------------ */
formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const spot_id = spotSelectEl.value;
  const surf_date = document.getElementById('surf-date').value;
  const time_block = document.getElementById('time-block').value;
  const stoke_level = parseInt(document.getElementById('stoke').value, 10);
  const forecast_fit = document.getElementById('fit').value;
  const conditions_note = (document.getElementById('notes').value || '').trim() || null;

  if (!spot_id || !surf_date || !time_block || !stoke_level || !forecast_fit) {
    formMsg.textContent = 'Please fill in all required fields.';
    formMsg.style.color = 'red';
    return;
  }
  const payload = [{ spot_id, surf_date, time_block, stoke_level, forecast_fit, conditions_note }];

  try {
    const res = await fetch(`${REST}/sessions_feedback`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload)
    });
    if (res.status === 201 || res.status === 204) {
      formMsg.textContent = 'Thanks — feedback submitted!';
      formMsg.style.color = 'green';
      formEl.reset();
      await loadSummary(); // refresh summary after submit
    } else {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    formMsg.textContent = `Error submitting feedback: ${err.message}`;
    formMsg.style.color = 'red';
  }
});

/* -----------------------
   4) Daily summary (RPC)
------------------------ */
async function fetchInsights(days = 1) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/insights`;
  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ range_days: days })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return await res.json(); // [{ spot_id, spot_name, n_feedback, avg_stoke, fit_* }]
}

async function loadSummary() {
  try {
    const rows = await fetchInsights(1);
    summaryWrap.innerHTML = rows.map(r => `
      <div class="card">
        <strong>${r.spot_name}</strong><br/>
        Reports: ${r.n_feedback} • Avg stoke: ${r.avg_stoke ?? 0}<br/>
        Fit — Spot on: ${r.fit_spot_on}, Close: ${r.fit_close},
        A bit off: ${r.fit_a_bit_off}, Way off: ${r.fit_way_off}
      </div>
    `).join('') || '<p>No feedback today yet.</p>';
  } catch (err) {
    summaryWrap.innerHTML = `<p style="color:red">Could not load summary: ${err.message}</p>`;
  }
}

/* -----------------------
   Init
------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
  await fetchSpots();     // fills list + dropdown
  await loadForecasts();  // render forecasts
  await loadSummary();    // render daily summary
  showView('view-forecasts'); // default tab
});
