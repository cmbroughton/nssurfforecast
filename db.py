"""
Database helper functions for writing forecasts to Supabase.
"""

import os
import json
import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://htwjccgteazjxqjbmvsq.supabase.co")
SUPABASE_ANON_KEY = os.getenv(
    "SUPABASE_ANON_KEY",
    "sb_publishable_WRn9G0BhzuO8vzVy33JhhA_9tlUt_BV"
)

def insert_forecasts(rows):
    """
    Insert list of forecast rows into Supabase (table: forecasts).
    """
    url = f"{SUPABASE_URL}/rest/v1/forecasts"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    resp = requests.post(url, headers=headers, data=json.dumps(rows))
    resp.raise_for_status()
    return resp.json() if resp.text else {}
