@echo off
setlocal enabledelayedexpansion

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║          LatencyZero Electron Builder                   ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: ─── Step 1: Check Node.js ─────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Please install Node.js from https://nodejs.org/
    goto :error
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js found: !NODE_VER!

:: ─── Step 2: npm install ──────────────────────────────────────────────
echo.
echo [1/7] Running npm install...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    goto :error
)
echo [OK] npm install complete.

:: ─── Step 3: Build Next.js ────────────────────────────────────────────
echo.
echo [2/7] Building Next.js...
call npx next build
if %errorlevel% neq 0 (
    echo [ERROR] Next.js build failed.
    goto :error
)
echo [OK] Next.js build complete.

:: ─── Step 4: Copy static files into standalone ────────────────────────
echo.
echo [3/7] Copying static assets into standalone...

if not exist ".next\standalone\.next" mkdir ".next\standalone\.next"
xcopy /Y /E /I /Q ".next\static" ".next\standalone\.next\static" >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to copy .next/static
    goto :error
)

xcopy /Y /E /I /Q "public" ".next\standalone\public" >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to copy public/
    goto :error
)
echo [OK] Static assets copied.

:: ─── Step 5: Generate Prisma client ───────────────────────────────────
echo.
echo [4/7] Running Prisma generate...
call npx prisma generate
if %errorlevel% neq 0 (
    echo [ERROR] Prisma generate failed.
    goto :error
)
echo [OK] Prisma client generated.

:: ─── Step 6: Compile Electron TypeScript ──────────────────────────────
echo.
echo [5/7] Compiling Electron main process...

:: Ensure electron-dist exists
if not exist "electron-dist" mkdir electron-dist

call npx esbuild electron/main.ts --bundle --platform=node --outfile=electron-dist/main.js --external:electron --format=cjs
if %errorlevel% neq 0 (
    echo [ERROR] Failed to compile electron/main.ts
    goto :error
)
echo [OK] electron/main.ts compiled.

echo [6/7] Compiling Electron preload script...
call npx esbuild electron/preload.ts --bundle --platform=node --outfile=electron-dist/preload.js --external:electron --format=cjs
if %errorlevel% neq 0 (
    echo [ERROR] Failed to compile electron/preload.ts
    goto :error
)
echo [OK] electron/preload.ts compiled.

:: ─── Step 7: Copy Prisma runtime into electron-dist ──────────────────
echo.
echo [7/7] Copying Prisma runtime into electron-dist...

if exist "node_modules\.prisma" (
    if not exist "electron-dist\node_modules\.prisma" mkdir "electron-dist\node_modules\.prisma"
    xcopy /Y /E /I /Q "node_modules\.prisma" "electron-dist\node_modules\.prisma" >nul
)

if exist "node_modules\@prisma" (
    if not exist "electron-dist\node_modules\@prisma" mkdir "electron-dist\node_modules\@prisma"
    xcopy /Y /E /I /Q "node_modules\@prisma" "electron-dist\node_modules\@prisma" >nul
)
echo [OK] Prisma runtime copied.

:: ─── Step 8: Run electron-builder ─────────────────────────────────────
echo.
echo [BUILD] Running electron-builder...
echo.

call npx electron-builder --win --config electron-builder.yml
if %errorlevel% neq 0 (
    echo [ERROR] electron-builder failed.
    goto :error
)

goto :success

:: ─── Error Handler ────────────────────────────────────────────────────
:error
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  BUILD FAILED                                           ║
echo  ║  Review the errors above and fix them before retrying.  ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
pause
exit /b 1

:: ─── Success ──────────────────────────────────────────────────────────
:success
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  BUILD SUCCESSFUL                                       ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Output: release\LatencyZero.exe
echo.
echo  The portable executable is self-contained. Copy it anywhere
echo  and run — no Node.js or other dependencies required.
echo  On first launch, the embedded Next.js server starts and the
echo  app database is created in %%APPDATA%%\LatencyZero\db\
echo.
pause
exit /b 0