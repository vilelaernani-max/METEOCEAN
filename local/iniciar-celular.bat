@echo off
cd /d "%~dp0"
set METEOCEAN_HOST=0.0.0.0
python run.py
pause
