"""
Baseline prediction functions for the surf forecast worker.
"""

def predict_quality(features):
    """Simple quality score (0–100)."""
    quality = 100.0 - 5.0 * features["wind_speed"]
    return max(0.0, min(100.0, quality))

def predict_stoke(features):
    """Simple stoke (1–5)."""
    hs = features["hs"]
    return max(1.0, min(5.0, 1.0 + hs))
