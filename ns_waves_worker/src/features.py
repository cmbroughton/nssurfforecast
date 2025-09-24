"""
Feature engineering functions for the surf forecast worker.
"""

import math

def make_features(wave_row, wind):
    """Construct simple features dict from raw wave & wind."""
    hs = wave_row["hs"]
    tp = wave_row["tp"]
    dp = wave_row["dp"]
    speed = math.hypot(wind["u10"], wind["v10"])
    return {
        "hs": hs,
        "tp": tp,
        "dp": dp,
        "wind_speed": speed
    }
