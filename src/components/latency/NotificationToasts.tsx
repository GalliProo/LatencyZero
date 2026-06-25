'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

interface Toast {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  message: string
  timestamp: number
}

interface NotificationToastsProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const TOAST_DURATION = 4000
const MAX_VISIBLE = 3
const TICK_MS = 500

const typeConfig: Record<
  Toast['type'],
  {
    icon: React.ComponentType<{ className?: string }>
    borderColor: string
    iconColor: string
    progressColor: string
  }
> = {
  success: {
    icon: CheckCircle2,
    borderColor: 'border-l-[#00ff88]',
    iconColor: 'text-[#00ff88]',
    progressColor: 'bg-[#00ff88]',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'border-l-[#ffaa00]',
    iconColor: 'text-[#ffaa00]',
    progressColor: 'bg-[#ffaa00]',
  },
  error: {
    icon: XCircle,
    borderColor: 'border-l-[#ff3366]',
    iconColor: 'text-[#ff3366]',
    progressColor: 'bg-[#ff3366]',
  },
  info: {
    icon: Info,
    borderColor: 'border-l-[#00f0ff]',
    iconColor: 'text-[#00f0ff]',
    progressColor: 'bg-[#00f0ff]',
  },
}

function formatRelativeTime(timestamp: number): string {
  const diff = (Date.now() - timestamp) / 1000
  if (diff < 2) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  return `${Math.floor(diff / 60)}m ago`
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: string) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const [timeLabel, setTimeLabel] = useState(() => formatRelativeTime(toast.timestamp))

  const progress = Math.max(0, 1 - elapsed / TOAST_DURATION)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const now = Date.now()
      const e = now - start
      setElapsed(e)
      setTimeLabel(formatRelativeTime(toast.timestamp))
      if (e >= TOAST_DURATION) {
        clearInterval(interval)
      }
    }, TICK_MS)

    // Also dismiss at TOAST_DURATION
    const dismissTimer = setTimeout(() => {
      onDismiss(toast.id)
    }, TOAST_DURATION)

    return () => {
      clearInterval(interval)
      clearTimeout(dismissTimer)
    }
  }, [toast.id, toast.timestamp, onDismiss])

  const cfg = typeConfig[toast.type]
  const Icon = cfg.icon

  const handleDismiss = useCallback(() => {
    onDismiss(toast.id)
  }, [toast.id, onDismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={`pointer-events-auto relative flex items-start gap-2.5 p-2.5 rounded-lg border-l-2 ${cfg.borderColor} bg-[#0d0d14]/95 backdrop-blur-xl border border-[#1a1a2e] shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden`}
    >
      {/* Icon */}
      <div className={`mt-0.5 shrink-0 ${cfg.iconColor}`}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-white leading-tight truncate">
          {toast.title}
        </p>
        <p className="text-[10px] text-gray-400 leading-snug mt-0.5 line-clamp-1">
          {toast.message}
        </p>
        <span className="text-[9px] text-gray-600 font-mono mt-0.5 inline-block">
          {timeLabel}
        </span>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="shrink-0 mt-0.5 p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
      </button>

      {/* Progress bar */}
      <motion.div
        className={`absolute bottom-0 left-0 h-[2px] ${cfg.progressColor}`}
        initial={{ width: '100%' }}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: TICK_MS / 1000, ease: 'linear' }}
      />
    </motion.div>
  )
}

export default function NotificationToasts({ toasts, onDismiss }: NotificationToastsProps) {
  const visibleToasts = toasts.slice(-MAX_VISIBLE)

  return (
    <div
      className="fixed top-28 right-3 z-[100] flex flex-col gap-2.5 w-68 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {visibleToasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}