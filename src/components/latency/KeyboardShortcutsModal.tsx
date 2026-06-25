'use client'

import { motion } from 'framer-motion'
import { Keyboard, X } from 'lucide-react'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const shortcuts = [
  { category: 'Navigation', items: [
    { keys: ['1'], desc: 'Dashboard' },
    { keys: ['2'], desc: 'DPC / ISR' },
    { keys: ['3'], desc: 'Frame Analysis' },
    { keys: ['4'], desc: 'Network' },
    { keys: ['5'], desc: 'Hardware' },
    { keys: ['6'], desc: 'Drivers' },
    { keys: ['7'], desc: 'Controller Lab' },
    { keys: ['8'], desc: 'System Config' },
    { keys: ['9'], desc: 'Scan Report' },
    { keys: ['0'], desc: 'History' },
  ]},
  { category: 'Controls', items: [
    { keys: ['Space'], desc: 'Pause / Resume monitoring' },
    { keys: ['E'], desc: 'Toggle EMA smoothing' },
    { keys: ['S'], desc: 'Toggle sound alerts' },
    { keys: ['A'], desc: 'Toggle A/B comparison' },
    { keys: ['O'], desc: 'Toggle overlay mode' },
  ]},
  { category: 'Help', items: [
    { keys: ['?', '/'], desc: 'Toggle this help' },
    { keys: ['Esc'], desc: 'Close this overlay' },
  ]},
]

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 backdrop-blur-md animate-modal-backdrop"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="glass-card-modal rounded-xl p-6 w-full max-w-md mx-4 border border-[#2a2a3e]/60"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00f0ff]/10 flex items-center justify-center">
              <Keyboard className="w-4 h-4 text-[#00f0ff]" />
            </div>
            <h3 className="text-sm font-semibold text-white">Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#1a1a2e] transition-all"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="space-y-4">
          {shortcuts.map(section => (
            <div key={section.category}>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-medium">
                {section.category}
              </div>
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <div
                    key={item.desc}
                    className="kbd-shortcut-row flex items-center justify-between gap-4"
                  >
                    <span className="text-xs text-gray-200 font-medium">{item.desc}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map(key => (
                        <span key={key} className="kbd">{key}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="mt-5 pt-3 border-t border-[#1a1a2e]">
          <p className="text-[10px] text-gray-600 text-center">
            Click outside or press <span className="kbd" style={{ fontSize: 8, height: 15, minWidth: 15 }}>Esc</span> to close
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}