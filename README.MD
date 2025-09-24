# NS Waves Worker

This Python project contains a simple hourly surf forecast worker for three Halifax‐area surf spots: **Lawrencetown Beach**, **Martinique Beach**, and **Silversands (Cow Bay)**.  

It is designed to run as a scheduled task (for example with cron or a GitHub Action) and to write predicted surf quality and stoke values back to your Supabase database.

## Project layout

ns_waves_worker/
README.md
env.yml
config/
sites.yaml
src/
db.py
datasources.py
features.py
model.py
main.py


## How it works
1. Loads metadata for the three sites from `config/sites.yaml`.
2. Fetches deep-water wave and wind data (stubbed for now).
3. Engineers simple features.
4. Predicts **quality** (0–100) and **stoke** (1–5) using a baseline model.
5. Inserts forecast rows into Supabase.

