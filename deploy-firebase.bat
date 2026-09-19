@echo off
echo ========================================================
echo        CIVICCARE LIVE TRACKER - FIREBASE DEPLOYMENT
echo ========================================================
echo.
echo Step 1: Checking Firebase Authentication...
call firebase.cmd login
echo.
echo Step 2: Deploying to Firebase Hosting...
call firebase.cmd deploy --only hosting
echo.
echo ========================================================
echo Deployment finished! Check your live domain above.
echo ========================================================
pause
