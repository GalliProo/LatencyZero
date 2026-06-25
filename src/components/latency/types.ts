export interface MetricsData {
  timestamp: number;
  dpc: { current: number; max: number; avg: number };
  isr: { current: number; max: number; avg: number };
  frameTime: { current: number; avg: number; min1pct: number; min01pct: number };
  fps: { current: number; avg: number; min1pct: number; min01pct: number };
  hardware: {
    cpu: { usage: number; temp: number; clock: number };
    gpu: { usage: number; temp: number; clock: number; vram: number };
    ram: { usage: number; available: number; percent: number };
  };
  network: {
    ping: number; jitter: number; packetLoss: number;
    download: number; upload: number;
  };
  score: number;
}

export interface DriverInfo {
  name: string;
  module: string;
  dpcCount: number;
  dpcTime: number;
  isrCount: number;
  isrTime: number;
  severity: 'good' | 'warning' | 'critical';
}

export interface AlertItem {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

export interface LatencyPoint {
  time: string;
  dpc: number;
  isr: number;
}

export interface FrameTimePoint {
  time: string;
  frameTime: number;
}

export interface PingPoint {
  time: string;
  ping: number;
}