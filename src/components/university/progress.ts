'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Per-browser lesson completion for the public portal. There are no learner
 * accounts, so progress lives in localStorage, keyed by course. Reads are
 * deferred to an effect so the server-rendered page and the first client
 * render agree; every write returns a new array.
 */
const STORAGE_PREFIX = 'smartmenu-university:'

function storageKey(courseSlug: string): string {
  return `${STORAGE_PREFIX}${courseSlug}`
}

export function readCompleted(courseSlug: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(courseSlug))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeCompleted(courseSlug: string, lessonSlugs: string[]): void {
  try {
    window.localStorage.setItem(storageKey(courseSlug), JSON.stringify(lessonSlugs))
  } catch {
    // Private mode or a full quota: progress simply is not remembered.
  }
}

export function useCourseProgress(courseSlug: string) {
  const [completed, setCompleted] = useState<string[]>([])

  useEffect(() => {
    setCompleted(readCompleted(courseSlug))
  }, [courseSlug])

  const markComplete = useCallback(
    (lessonSlug: string) => {
      setCompleted((prev) => {
        if (prev.includes(lessonSlug)) return prev
        const next = [...prev, lessonSlug]
        writeCompleted(courseSlug, next)
        return next
      })
    },
    [courseSlug]
  )

  const markIncomplete = useCallback(
    (lessonSlug: string) => {
      setCompleted((prev) => {
        const next = prev.filter((slug) => slug !== lessonSlug)
        writeCompleted(courseSlug, next)
        return next
      })
    },
    [courseSlug]
  )

  return { completed, markComplete, markIncomplete }
}
