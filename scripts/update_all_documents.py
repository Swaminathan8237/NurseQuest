import os
import shutil
import subprocess
import sys

# Paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_IMAGE_DIR = r"C:\Users\Swaminathan\.gemini\antigravity\brain\baa88481-06dd-459d-8851-f671d5c05c27"
DEST_IMAGE_DIR = os.path.join(PROJECT_ROOT, "docs", "screenshots")

def copy_screenshots():
    print("--- 1. Copying Screenshots to Workspace ---")
    if not os.path.exists(SRC_IMAGE_DIR):
        print(f"Warning: Source screenshot directory {SRC_IMAGE_DIR} not found.")
        return False
        
    os.makedirs(DEST_IMAGE_DIR, exist_ok=True)
    images_to_copy = [
        "auth_page_1777442625284.png",
        "student_dashboard_1777442700322.png",
        "leaderboard_page_1777442710539.png",
        "teacher_dashboard_1777442820808.png",
        "quiz_builder_1777442829692.png",
        "live_game_1777442838805.png"
    ]
    
    copied_count = 0
    for img in images_to_copy:
        src_path = os.path.join(SRC_IMAGE_DIR, img)
        dest_path = os.path.join(DEST_IMAGE_DIR, img)
        if os.path.exists(src_path):
            shutil.copy2(src_path, dest_path)
            print(f"  Copied {img} successfully.")
            copied_count += 1
        else:
            print(f"  Warning: {img} not found in source folder.")
            
    print(f"Total screenshots copied: {copied_count}/{len(images_to_copy)}")
    return copied_count > 0

def run_script(script_name, cwd):
    print(f"\n--- Running: {script_name} ---")
    try:
        res = subprocess.run([sys.executable, script_name], cwd=cwd, capture_output=True, text=True, encoding="utf-8")
        if res.returncode == 0:
            print(res.stdout)
            return True
        else:
            print(f"Error executing {script_name}:")
            print(res.stderr)
            return False
    except Exception as e:
        print(f"Execution failed: {str(e)}")
        return False

if __name__ == "__main__":
    # 1. Copy screenshots
    copy_screenshots()
    
    # 2. Run fill_proposal.py
    run_script("fill_proposal.py", PROJECT_ROOT)
    
    # 3. Run generate_docx.py
    run_script("generate_docx.py", os.path.join(PROJECT_ROOT, "scripts"))
    
    # 4. Run generate_progress_report.py
    run_script("generate_progress_report.py", os.path.join(PROJECT_ROOT, "scripts"))
    
    # 5. Run inspect_docs.py to verify
    run_script("inspect_docs.py", os.path.join(PROJECT_ROOT, "scripts"))
    
    print("\nAll tasks completed!")
