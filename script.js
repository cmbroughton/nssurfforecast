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

const REST_BASE = `${SUPABASE_URL}/rest/v1`;
const H = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

/* === DOM HOOKS === */
const statusEl = document.getElementById('status');
const spotsListEl = document.getElementById('spot-list');
const spotSelectEl = document.getElementById('spot-select');
const formEl = document.getElementById('feedback-form');
const formMsg = document.getElementById('feedback-status');
const forecastWrap = document.getElementById('forecast-wrap');

/* Cache spots in memory for id→name lookup */
let SPOTS = [];

/* =========================
   1) Spots (list + dropdown)
========================= */
async function fetchSpots() {
  statusEl.textContent = 'Loading spots…';
  try {
    const res = await fetch(`${REST_BASE}/spots?select=id,name,lat,lon,notes`, { headers: H });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    SPOTS = await res.json();

    // Render list
    spotsListEl.innerHTML = SPOTS.map(s =>
      `<h3>${s.name}</h3><p>${s.notes || ''}</p>`
    ).join('');

    // Populate dropdown
    spotSelectEl.innerHTML = SPOTS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    statusEl.textContent = `Loaded ${SPOTS.length} spots`;
  } catch (err) {
    statusEl.textContent = `Error loading spots: ${err.message}`;
    statusEl.style.color = 'red';
  }
}

/* =========================
   2) Forecasts
   Approach:
   - Try Supabase view `daily_forecast` (recommended).
   - If empty, fall back to live NDBC 44258 parse (client-only display).
========================= */
function todayUtcISODate() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchForecastsFromSupabase() {
  const start = `${todayUtcISODate()}T00:00:00Z`;
  const endDate = new Date(); endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = `${endDate.toISOString().slice(0,10)}T00:00:00Z`;

  const url = `${REST_BASE}/daily_forecast` +
    `?select=spot_id,valid_time,predicted_quality,predicted_stoke,text_summary` +
    `&valid_time=gte.${encodeURIComponent(start)}` +
    `&valid_time=lte.${encodeURIComponent(end)}` +
    `&order=spot_id.asc,valid_time.asc`;

  const res = await fetch(url, { headers: H });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

function nameForSpot(id) {
  const s = SPOTS.find(x => x.id === id);
  return s ? s.name : 'Spot';
}

function renderSupabaseForecasts(rows) {
  if (!rows.length) return false;

  // Group by spot_id, pick the *first* (earliest today) or last — here we pick the first valid today
  const bySpot = rows.reduce((acc, r) => {
    (acc[r.spot_id] ||= []).push(r);
    return acc;
  }, {});
  forecastWrap.innerHTML = Object.entries(bySpot).map(([spotId, list]) => {
    const latest = list[0]; // first valid within today window
    const name = nameForSpot(spotId);
    return `
      <div class="card" style="border:1px solid #ccc;padding:12px;margin:8px 0;">
        <strong>${name}</strong><br/>
        ${latest.text_summary || '—'}<br/>
        Stoke: ${Number(latest.predicted_stoke).toFixed(1)} •
        Quality: ${Math.round(Number(latest.predicted_quality))}/100
      </div>`;
  }).join('');
  return true;
}

/* ---- Fallback: NDBC 44258 live parse (display only) ---- */
async function fetchBuoy44258() {
  const url = 'https://www.ndbc.noaa.gov/data/realtime2/44258.txt';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NDBC ${res.status}`);
  // Parse the most recent non-header line
  const lines = (await res.text()).trim().split('\n').filter(l => !l.startsWith('#'));
  if (!lines.length) throw new Error('No buoy data');
  const cols = lines[0].trim().split(/\s+/);
  // YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP ...
  const WVHT = parseFloat(cols[8] || '0');   // meters
  const DPD  = parseFloat(cols[9] || '0');   // seconds
  const WDIR = parseFloat(cols[5] || '0');   // deg T

  return { height_m: WVHT, period_s: DPD, wind_dir: WDIR };
}

function scoreFromBuoy(h, p, isOffshore = true, isAligned = true) {
  // Very simple ruleset — tune as you like
  let q = 0;
  q += Math.max(0, Math.min(40, (h - 0.6) * 50));   // 0.6–1.6m sweet
  q += Math.max(0, Math.min(20, (p - 7) * 4));      // prefer 9–12s
  q += isAligned ? 15 : -8;
  q += isOffshore ? 15 : 0;
  q = Math.max(0, Math.min(100, q));
  const stoke = Math.max(1, Math.min(5, 1 + 4 * (q / 100)));
  return { quality: q, stoke: stoke };
}

function renderBuoyFallback(buoy) {
  // Render a naive forecast for each spot based on buoy + spot metadata
  forecastWrap.innerHTML = SPOTS.map(s => {
    // Very rough direction windows from your seed — you can refine these
    const inWindow = true;     // treat as true unless you want to compute angle windows here
    const offshore = true;     // same idea — compute wind vs shoreline if you want
    const score = scoreFromBuoy(buoy.height_m, buoy.period_s, offshore, inWindow);
    const summary = `${buoy.height_m.toFixed(1)}m @ ${buoy.period_s.toFixed(0)}s; wind dir ${buoy.wind_dir.toFixed(0)}°`;
    return `
      <div class="card" style="border:1px solid #ddd;padding:12px;margin:8px 0;">
        <strong>${s.name}</strong><br/>
        ${summary}<br/>
        Stoke: ${score.stoke.toFixed(1)} • Quality: ${Math.round(score.quality)}/100
      </div>
    `;
  }).join('');
}

/* Orchestrate forecasts: Supabase first, buoy fallback */
async function loadForecasts() {
  try {
    const rows = await fetchForecastsFromSupabase();
    const rendered = renderSupabaseForecasts(rows);
    if (!rendered) {
      const buoy = await fetchBuoy44258();
      renderBuoyFallback(buoy);
    }
  } catch (err) {
    // If Supabase fails, try buoy as last resort
    try {
      const buoy = await fetchBuoy44258();
      renderBuoyFallback(buoy);
    } catch (e2) {
      forecastWrap.innerHTML = `<p style="color:red;">Could not load forecasts: ${e2.message}</p>`;
    }
  }
}

/* =========================
   3) Feedback submission
========================= */
formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const spotId = spotSelectEl.value;
  const surfDate = document.getElementById('surf-date').value;
  const timeBlock = document.getElementById('time-block').value;
  const stoke = parseInt(document.getElementById('stoke').value, 10);
  const fit = document.getElementById('fit').value;
  const notes = document.getElementById('notes').value.trim() || null;

  if (!spotId || !surfDate || !timeBlock || !stoke || !fit) {
    formMsg.textContent = 'Please fill in all required fields.';
    formMsg.style.color = 'red';
    return;
  }

  const payload = [{
    spot_id: spotId,
    surf_date: surfDate,
    time_block: timeBlock,
    stoke_level: stoke,
    forecast_fit: fit,
    conditions_note: notes
  }];

  try {
    const res = await fetch(`${REST_BASE}/sessions_feedback`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload)
    });
    if (res.status === 201 || res.status === 204) {
      formMsg.textContent = 'Thanks — feedback submitted!';
      formMsg.style.color = 'green';
      formEl.reset();
    } else {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    formMsg.textContent = `Error submitting feedback: ${err.message}`;
    formMsg.style.color = 'red';
  }
});

/* =========================
   INIT
========================= */
document.addEventListener('DOMContentLoaded', async () => {
  await fetchSpots();       // fills list + dropdown
  await loadForecasts();    // shows Supabase forecasts or buoy fallback
});

async function fetchSpots() {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Loading spots…';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/spots?select=id,name,lat,lon,notes`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const spots = await res.json();
    document.getElementById('spot-list').innerHTML =
      spots.map(s => `<h3>${s.name}</h3><p>${s.notes || ''}</p>`).join('');
    // populate your feedback form’s spot dropdown here
    statusEl.textContent = `Loaded ${spots.length} spots`;
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  }
}
document.addEventListener('DOMContentLoaded', fetchSpots);


// Elements on the page.
const spotsListEl = document.getElementById('spots');
const spotSelectEl = document.getElementById('spot-select');
const form = document.getElementById('form');
const formMessage = document.getElementById('form-message');

// Fetch and display surf spots.
async function fetchAndDisplaySpots() {
  try {
    // Construct the query parameters. We select the fields we need
    // to display the name as well as lat/lon for demonstration.
    const url = `${REST_BASE}/spots?select=id,name,lat,lon,notes`;
    const res = await fetch(url, { headers: defaultHeaders });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const spots = await res.json();
    // Clear existing content.
    spotsListEl.innerHTML = '';
    spotSelectEl.innerHTML = '';
    // Populate the unordered list and the select dropdown.
    spots.forEach((spot) => {
      const li = document.createElement('li');
      li.className = 'spot';
      li.textContent = `${spot.name} (Lat: ${spot.lat.toFixed(4)}, Lon: ${spot.lon.toFixed(4)})`;
      spotsListEl.appendChild(li);
      const opt = document.createElement('option');
      opt.value = spot.id;
      opt.textContent = spot.name;
      spotSelectEl.appendChild(opt);
    });
  } catch (err) {
    console.error('Error fetching spots:', err);
    formMessage.textContent = `Error loading spots: ${err.message}`;
    formMessage.style.color = 'red';
  }
}

// Handle feedback form submission.
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMessage.textContent = '';
  // Gather the form values.
  const spotId = spotSelectEl.value;
  const surfDate = document.getElementById('date-input').value;
  const timeBlock = document.getElementById('block-select').value;
  const stoke = document.getElementById('stoke-input').value;
  const fit = document.getElementById('fit-select').value;
  const notes = document.getElementById('notes-input').value.trim();
  // Validate required fields.
  if (!spotId || !surfDate || !timeBlock || !stoke || !fit) {
    formMessage.textContent = 'Please fill in all required fields.';
    formMessage.style.color = 'red';
    return;
  }
  // Build the payload as an array of objects (Supabase expects an array for POST).
  const payload = [
    {
      spot_id: spotId,
      surf_date: surfDate,
      time_block: timeBlock,
      stoke_level: parseInt(stoke, 10),
      forecast_fit: fit,
      conditions_note: notes || null,
    },
  ];
  try {
    const url = `${REST_BASE}/sessions_feedback`;
    const headers = {
      ...defaultHeaders,
      'Content-Type': 'application/json',
      // Return minimal payload to reduce bandwidth. Also merge duplicates.
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    };
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.status === 201 || res.status === 200 || res.status === 204) {
      formMessage.textContent = 'Feedback submitted! Thank you.';
      formMessage.style.color = 'green';
      // Reset form fields.
      form.reset();
    } else {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.error('Error submitting feedback:', err);
    formMessage.textContent = `Error submitting feedback: ${err.message}`;
    formMessage.style.color = 'red';
  }
});

// Initialize the page.
fetchAndDisplaySpots();
