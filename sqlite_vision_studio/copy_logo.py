import shutil
from pathlib import Path

src = Path(r"C:\Users\Swaminathan\.gemini\antigravity-ide\brain\5604f5e0-f44e-4fdf-8f99-210099599089\app_logo_1781887763504.png")
dest = Path(__file__).parent / "logo.png"

if src.exists():
    shutil.copy(src, dest)
    print("Logo copied successfully!")
else:
    print(f"Source not found: {src}")
