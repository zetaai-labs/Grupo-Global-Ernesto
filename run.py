"""
Starts the Global Group backend (Express) and frontend (Vite) together.

Usage: python run.py
Stop with Ctrl+C.
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "Extranet-Intranet", "backend")
FRONTEND = os.path.join(ROOT, "Extranet-Intranet", "frontend")

npm = "npm.cmd" if os.name == "nt" else "npm"

processes = [
    subprocess.Popen(f'{npm} run dev', cwd=BACKEND, shell=True),
    subprocess.Popen(f'{npm} run dev', cwd=FRONTEND, shell=True),
]

print("Backend:  http://localhost:5000")
print("Frontend: http://localhost:5173 (or the next free port)")
print("Press Ctrl+C to stop both services.")

try:
    for process in processes:
        process.wait()
except KeyboardInterrupt:
    for process in processes:
        process.terminate()
    for process in processes:
        process.wait()
