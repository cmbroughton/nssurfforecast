"""
Entry point for the surf forecast worker.
"""

import yaml
from pathlib import Path
import datetime
from datasources import fetch_deepwater_wave, fetch_wind
from features import make_features
from model import predict_quality, predict_stoke
from db import insert_forecasts

# Map site keys (from sites.yaml) to Supabase UUIDs
SPOT_IDS = {
    "lawrencetown": "cf39c3ed-d856-44a9-9876-d0ee30d8aa24",
    "martinique":   "8cf66100-002e-4c7e-8362-1ce4233020a8",
    "silversands":  "aba71920-6b52-40bb-96c8-224ac52e224d"
}

def run_once():
    # Load site metadata from config
    sites = yaml.safe_load(open(Path(__file__).parents[1] / "config" / "sites.yaml"))["sites"]
    rows = []
    run_time = datetime.datetime.utcnow().isoformat() + "Z"

    for sid, meta in sites.items():
        wave_series = fetch_deepwater_wave(sid)
        wind = fetch_wind(sid)
        for w in wave_series:
            feats = make_features(w, wind)
            rows.append({
                "spot_id": SPOT_IDS[sid],
                "run_time": run_time,
                "valid_time": w["valid_time"],
                "src_raw": {"wave": w, "wind": wind},
                "features": feats,
                "predicted_quality": round(predict_quality(feats), 2),
                "predicted_stoke": round(predict_stoke(feats), 2),
                "text_summary": f"{feats['hs']:.1f}m @ {feats['tp']:.0f}s, wind {feats['wind_speed']:.1f} m/s"
            })

    if rows:
        print(f"Inserting {len(rows)} forecast rows...")
        insert_forecasts(rows)
        print("Done.")

if __name__ == "__main__":
    run_once()
