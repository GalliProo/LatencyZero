# LatencyZero Windows Agent

A standalone local agent that collects real system data from your Windows PC and sends it to the LatencyZero dashboard.

## Architecture

```
LatencyZero Dashboard (Next.js, port 3000)
  ↑ HTTP POST (scan data) + Heartbeat
  │
LatencyZero Windows Agent (Bun, port 3010)
  ↓ PowerShell / WMI / nvidia-smi
Real System Data (CPU, GPU, Network, Processes, Display, Controller)
```

## Requirements

- **Windows 10/11** (64-bit)
- **Bun runtime** — Install from [bun.sh](https://bun.sh/)
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```
- **NVIDIA GPU** (optional) — Required for GPU collector. Falls back to WMI if nvidia-smi is unavailable.
- **Administrator privileges** (recommended) — Some WMI queries and TPM detection require elevated privileges.
- **PowerShell 5.1+** — Pre-installed on Windows 10/11.

## Quick Start

### 1. Start the Dashboard

```bash
cd latencyzero
bun install
bun run dev
```

The dashboard runs on `http://localhost:3000`.

### 2. Start the Windows Agent

```bash
cd latencyzero/mini-services/windows-agent
bun install
bun run dev
```

The agent starts on port 3010, immediately sends a heartbeat to the dashboard, and makes its API available.

### 3. Trigger a Data Collection

Open a new terminal or use `curl`:

```bash
# Collect all modules and push to dashboard
curl -X POST http://localhost:3010/collect

# Collect only system info
curl -X POST http://localhost:3010/collect/system

# Collect only GPU info
curl -X POST http://localhost:3010/collect/gpu

# Collect without pushing (preview)
curl http://localhost:3010/collect
```

### 4. Verify Real Data

- Open the dashboard at `http://localhost:3000`
- The header should show **"AGENT CONNECTED"** (green) instead of "NO AGENT"
- The Hardware tab should show **"REAL DATA"** badge instead of "SIMULATED"
- The System Config tab should show your actual CPU, RAM, Windows build, etc.
- Each metric shows a data source badge: **REAL DATA**, **IMPORTED**, **ESTIMATED**, **SIMULATED**, or **NOT AVAILABLE**

## Agent Status Page

Open `http://localhost:3010` in a browser to see:
- Agent status and uptime
- Last collection time
- JSON preview of all collected data
- Available API endpoints

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | HTML status page |
| GET | `/status` | Agent status JSON |
| POST | `/collect` | Collect all modules, push to dashboard |
| GET | `/collect` | Collect all modules, return without pushing |
| POST | `/collect/system` | Collect & push system only |
| POST | `/collect/gpu` | Collect & push GPU only |
| POST | `/collect/network` | Collect & push network only |
| POST | `/collect/processes` | Collect & push processes only |
| POST | `/collect/display` | Collect & push display only |
| POST | `/collect/controller` | Collect & push controller only |

## Collectors

### 1. System Collector (`system`)
- **Source**: WMI / PowerShell
- **Data**: CPU name, GPU name, RAM total/speed, Windows version/build, motherboard, BIOS, power plan, Secure Boot, TPM, VBS/Memory Integrity
- **Confidence**: 0.95

### 2. GPU Collector (`gpu`)
- **Source**: `nvidia-smi` (primary) → WMI fallback
- **Data**: GPU name, driver version, GPU usage, VRAM used/total, GPU/memory clock, temperature, power draw/limit, fan speed, throttle reasons, PCIe bus info
- **Confidence**: 0.98 (nvidia-smi) / 0.85 (WMI)
- **Note**: Falls back to `unavailable` if nvidia-smi is not found and WMI fails

### 3. Network Collector (`network`)
- **Source**: `ping` + PowerShell
- **Data**: Active adapter name/type, link speed, ping to gateway/1.1.1.1/8.8.8.8, average ping, jitter, packet loss, DNS timing
- **Confidence**: 0.90
- **Note**: Ping tests take ~12 seconds (4 pings × 3 targets)

### 4. Process Collector (`processes`)
- **Source**: PowerShell `Get-Process`
- **Data**: Top 50 processes by RAM, categorized (overlay, launcher, browser, sync, antivirus, RGB, recording, etc.), impact-rated based on actual CPU/RAM usage
- **Known processes**: Discord, NVIDIA overlay, Xbox Game Bar, Steam, Chrome, Edge, Firefox, OneDrive, Windows Defender, NZXT CAM, iCUE, Razer Synapse, OBS, Epic Games, Battle.net, Riot Client
- **Confidence**: 0.90

### 5. Display Collector (`display`)
- **Source**: WMI + Registry
- **Data**: Monitor name, active resolution, refresh rate (active/max), HDR on/off, VRR/G-Sync/FreeSync, scaling, multi-monitor
- **Confidence**: 0.85

### 6. Controller Collector (`controller`)
- **Source**: WMI PnP device enumeration
- **Data**: Controller name, transport (USB/Bluetooth), API (XInput/HID), estimated polling rate
- **Confidence**: 0.70 (transport), 0.50 (polling rate — estimated)
- **Note**: First version. Does not promise controller-to-photon latency without external hardware.

## Module Status

| Module | Status | Notes |
|--------|--------|-------|
| System | ✅ Real | Full WMI/PowerShell |
| GPU | ✅ Real | nvidia-smi → WMI fallback |
| Network | ✅ Real | ping + PowerShell |
| Processes | ✅ Real | Get-Process + categorization |
| Display | ✅ Real | WMI + Registry |
| Controller | ⚠️ Partial | Detection only; polling rate estimated |

## Data Source Labels

Every metric carries a data source badge on the dashboard:

- **REAL DATA** (green) — Measured from your system via agent
- **IMPORTED** (cyan) — Parsed from LatencyMon TXT or PresentMon CSV
- **ESTIMATED** (yellow) — Software estimate
- **SIMULATED** (gray) — Demo data, not real
- **NOT AVAILABLE** (dark) — Data could not be collected

## Importing External Data

### LatencyMon TXT
1. Run LatencyMon on your Windows PC
2. Save the report as `.txt`
3. On the dashboard, click **"Import LatencyMon / PresentMon"**
4. Select the `.txt` file
5. DPC/ISR findings appear in the Scan Report

### PresentMon CSV
1. Run PresentMon: `presentmon.exe -process_name game.exe -output capture.csv`
2. On the dashboard, click **"Import LatencyMon / PresentMon"**
3. Select the `.csv` file
4. Frame time analysis, FPS stats, and findings appear

## Scoring

- The scoring engine **only uses measured, imported, or estimated data** (confidence > 0)
- Simulated data is excluded from score calculations
- If insufficient real data is available, the score shows "DEMO / Insufficient Real Data"
- Connect the agent and/or import files to get a real score

## Troubleshooting

### Agent shows "NO AGENT" on dashboard
- Ensure the agent is running (`bun run dev` in the agent directory)
- Check `http://localhost:3010/status` to verify the agent is responding
- Ensure the dashboard is running on port 3000

### GPU data shows "NOT AVAILABLE"
- nvidia-smi must be in your PATH. Install NVIDIA drivers if missing.
- Run `nvidia-smi` in a terminal to verify it works.
- The agent falls back to WMI for basic GPU info if nvidia-smi fails.

### Network collection is slow
- The network collector runs 3 ping tests (12 pings total) which takes ~12 seconds.
- This is normal. The dashboard will update once the data arrives.

### Controller not detected
- Ensure the controller is connected and recognized by Windows.
- Open `Devices and Printers` in Windows to verify.
- First version only does basic PnP detection.

### Permission errors
- Run the agent from an Administrator terminal for full WMI access.
- TPM detection specifically requires elevated privileges.

## Safety

This agent is **READ-ONLY**. It:
- ❌ Does NOT modify registry entries
- ❌ Does NOT change power plans or services
- ❌ Does NOT modify BIOS, drivers, or NVIDIA settings
- ❌ Does NOT install or uninstall anything
- ✅ Only reads system information via PowerShell/WMI
- ✅ Only runs non-destructive commands (ping, nvidia-smi query)