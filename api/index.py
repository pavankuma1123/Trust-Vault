import sys
import os
from pathlib import Path

# Add project root to sys.path so modules in backend.* can be found on Vercel
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

# Automatically seed the in-memory or /tmp database on cold start if running on Vercel
from backend.app.core.config import is_vercel
if is_vercel:
    try:
        from backend.seed import seed_database
        seed_database()
    except Exception as e:
        print(f"Vercel initialization warning: {e}")

from backend.app.main import app

# Vercel looks for the ASGI 'app' object
