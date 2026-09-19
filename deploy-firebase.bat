@echo off
echo ========================================================
echo        CIVICCARE LIVE TRACKER - FIREBASE DEPLOYMENT
echo ========================================================
echo.
echo Step 1: Checking Firebase Authentication...
call npx.cmd -y firebase-tools login
echo.
echo Step 2: Deploying to Firebase Hosting...
call npx.cmd -y firebase-tools deploy --only hosting
echo.
echo ========================================================
echo Deployment finished! Check the live URL above.
echo ========================================================
pause
