"use client"

import * as React from "react"

const MOBILE_BREAKPOINT = 768

function getSnapshot() {
  if (typeof window === "undefined") {
    return false
  }

  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot() {
  return false
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

  mediaQuery.addEventListener("change", callback)
  window.addEventListener("resize", callback)

  return () => {
    mediaQuery.removeEventListener("change", callback)
    window.removeEventListener("resize", callback)
  }
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
