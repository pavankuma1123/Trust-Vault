import sys
import os
from pathlib import Path

# Add project root to sys.path so modules in backend.* can be found on Vercel
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

# Ensure VERCEL environment variable is set
os.environ["VERCEL"] = "1"

# Automatically seed the /tmp database on cold start if running on Vercel
try:
    from backend.seed import seed_database
    seed_database()
except Exception as e:
    print(f"Vercel initialization: {e}")

from backend.app.main import app
