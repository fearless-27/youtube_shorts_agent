@echo off
title NEMO Studio — Local Server
echo ========================================================
echo  NEMO / GHOSTPIPE STUDIO — Starting Local Server
echo ========================================================
echo.
echo Opening http://localhost:8080/index.html in your browser...
start http://localhost:8080/index.html
echo.
echo Server is running on port 8080.
echo Press Ctrl+C in this window to stop the server.
echo ========================================================
python -m http.server 8080
pause
