# LatencyZero — Competitive Gaming PC Diagnostic Tool

**Single-click portable Windows application. No installation. No Node.js. No terminal.**

Just like LatencyMon: download the `.exe` → double-click → START SCAN.

---

## Metodo Consigliato (GitHub Actions)

The only thing you need to get `LatencyZero.exe` is a free GitHub account.

### Step 1 — Create a GitHub repository

1. Go to [github.com](https://github.com) → sign in or sign up (free)
2. Click **"New repository"**
3. Name: `LatencyZero` → select **Public** → click **"Create repository"**

### Step 2 — Upload the source files

1. On your new repository page, click **"uploading an existing file"**
2. Extract `LatencyZero.zip` locally on your computer
3. Drag **all folders and files** from the extracted folder into the GitHub upload page
   (drag the contents, NOT the zip file itself)
4. Click **"Commit changes"**

### Step 3 — Run the build

1. Go to the **"Actions"** tab of your repository
2. On the left panel, click **"Build LatencyZero Portable EXE"**
3. Click **"Run workflow"** → **"Run workflow"** to confirm
4. Wait approximately 5 minutes
   - You will see two jobs: **quality-check** (tests, lint, TypeScript) and **build**
   - All steps must pass with a green checkmark

### Step 4 — Download the .exe

1. When the workflow completes, scroll to the bottom of the page
2. Under **"Artifacts"**, click **"LatencyZero-Portable-EXE"**
3. This downloads `LatencyZero.exe` (~400 MB, fully self-contained)

### Step 5 — Use LatencyZero

1. Double-click `LatencyZero.exe`
2. The app opens immediately — no installation
3. Click **START SCAN**
4. Analyze the results on the dashboard

> **Tip:** You can also create a GitHub Release by pushing a tag (e.g., `v1.0.0`).
> The workflow will automatically create a release with the `.exe` attached.

---

## What the GitHub Actions workflow does

The workflow has **two jobs**:

### Job 1: quality-check
1. Installs all dependencies on Windows
2. Runs **52 unit tests** (Jest) — parsers, scoring, root-cause analysis
3. Runs **ESLint** (code quality)
4. Runs **TypeScript check** (`tsc --noEmit`)

### Job 2: build (runs only if quality-check passes)
1. Installs all dependencies on Windows
2. Generates Prisma database client
3. Builds Next.js in standalone mode
4. Copies static assets into standalone output
5. Compiles Electron main process and preload (esbuild)
6. Builds portable `.exe` with electron-builder
7. Uploads `LatencyZero.exe` as a downloadable artifact

Everything is automatic. Zero manual steps after uploading.

---

## Features

- **6 real hardware collectors**: System, GPU, Network, Processes, Display, Controller
- **Real-time performance dashboard** with interactive charts
- **Root Cause Analysis** — automatic diagnosis of latency issues
- **LatencyMon import** (`.txt`) and **PresentMon import** (`.csv`)
- **Export report** as PNG
- **Performance scoring** from S (excellent) to F (critical) across 8 categories
- **Session comparison** — compare two scans side by side
- **Threshold customization** — set your own acceptable limits

---

## Project Structure

```
LatencyZero/
├── .github/workflows/
│   └── build-portable.yml      # GitHub Actions workflow
├── electron/
│   ├── main.ts                 # Electron main process
│   ├── preload.ts              # IPC bridge
│   ├── types.ts                # IPC type definitions
│   └── resources/              # App icons
├── src/
│   ├── app/
│   │   ├── page.tsx            # Main dashboard
│   │   ├── layout.tsx          # App layout
│   │   └── api/                # API routes
│   │       ├── scan/           # 6 collector endpoints
│   │       ├── import/         # LatencyMon & PresentMon import
│   │       ├── sessions/       # Session history
│   │       ├── metrics/        # Real-time metrics
│   │       └── report/         # Report export
│   ├── components/
│   │   ├── latency/            # 38 custom LatencyZero components
│   │   └── ui/                 # shadcn/ui base components
│   ├── hooks/                  # Custom React hooks
│   └── lib/
│       ├── latencymon-parser.ts    # LatencyMon text parser
│       ├── presentmon-parser.ts    # PresentMon CSV parser
│       ├── scoring.ts              # Scoring engine
│       ├── root-cause.ts           # Root Cause Analysis
│       ├── db.ts                   # Database (Prisma/SQLite)
│       ├── types.ts                # Core type definitions
│       └── __tests__/              # 52 unit tests
├── mini-services/
│   └── windows-agent/         # Windows hardware collectors
│       ├── index.ts
│       └── collectors/        # 6 PowerShell/WMI collectors
├── samples/                   # Sample files for testing
├── prisma/
│   └── schema.prisma          # Database schema
├── electron-builder.yml       # Electron build configuration
├── build-electron.bat         # Manual build script (optional)
├── package.json
├── tsconfig.json
├── jest.config.ts
└── next.config.ts
```

---

## Manual Build (Optional)

If you prefer to build locally instead of using GitHub Actions:

**Requirements:** Windows 10/11, Node.js 20+

```bat
npm install --legacy-peer-deps
npx prisma generate
npx next build
build-electron.bat
```

Output: `release\LatencyZero.exe`

> Note: The GitHub Actions method is **strongly recommended** as it guarantees
> correct native module compilation for Windows.

---

## Notes

- The app stores data in `%APPDATA%\LatencyZero\`
- Logs are saved in `%APPDATA%\LatencyZero\logs\`
- If a collector fails, the app does not crash — it displays the error in the dashboard
- Some collectors (system DPC/ISR) may require running as Administrator for full access
- The portable `.exe` is fully self-contained (~400 MB) — no external dependencies needed