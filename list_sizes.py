import os
import glob

files = glob.glob('debug_playwright_*.html')
for f in files:
    size = os.path.getsize(f)
    print(f"{f}: {size} bytes")
