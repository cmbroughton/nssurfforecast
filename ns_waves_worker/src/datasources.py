"""
Stub data loaders for the surf forecast worker.
Replace with real loaders for WaverYs, RDWPS, HRDPS, etc.
"""

import datetime

def fetch_deepwater_wave(site):
    """Return stub deep-water Hs, Tp, Dir for the next 24 hours."""
    now = datetime.datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    rows = []
    for h in range(0, 24):
        t = now + datetime.timedelta(hours=h)
        rows.append({
            "valid_time": t.isoformat() + "Z",
            "hs": 1.0 + 0.1 * h,   # just incrementing for variety
            "tp": 10.0,
            "dp": 120.0
        })
    return rows

def fetch_wind(site):
    """Return stub wind speed/direction."""
    return {"u10": 5.0, "v10": 2.0}
