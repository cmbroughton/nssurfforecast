/*
 * Script for the Halifax Surf Forecast web app.
 *
 * This file loads surf spot metadata from your Supabase backend and
 * populates the list and dropdown on the page. It also handles
 * submission of surf session feedback to the `sessions_feedback`
 * table. To use this on your own Supabase project, adjust
 * `SUPABASE_URL` and `SUPABASE_ANON_KEY` below.
 */

// Change these constants to point at your Supabase project and anon key.
const SUPABASE_URL = 'https://htwjccgteazjxqjbmvsq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_secret_ZbeWuxK69MT3n1qWajLasw_KaX_tqEb';

// Build the REST base URL for convenience.
const REST_BASE = `${SUPABASE_URL}/rest/v1`;

// Common headers for Supabase REST calls.
const defaultHeaders = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Accept': 'application/json',
};

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