@echo off
echo ========================================================
echo Pushing CivicCare Live Tracking System to GitHub...
echo ========================================================
git branch -M main
git add .
git commit -m "Update Live Tracker project"
git push -u origin main
echo ========================================================
echo Done!
pause
