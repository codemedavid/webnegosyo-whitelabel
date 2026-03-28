'use client'

import { useEffect, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, X } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface UpsellFullScreenLayoutProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

const contentVariants = {
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: { type: 'spring', damping: 28, stiffness: 350 },
  },
  exit: {
    y: '100%',
    transition: { type: 'tween', duration: 0.2 },
  },
}

export function UpsellFullScreenLayout({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: UpsellFullScreenLayoutProps) {
  useBodyScrollLock(open)

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, handleEscape])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-white"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="flex h-full flex-col"
            variants={contentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Go back"
                type="button"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </button>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
                type="button"
              >
                <X className="h-5 w-5 text-gray-700" />
              </button>
            </div>

            {/* Title area */}
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              {subtitle && (
                <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
              )}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {children}
            </div>

            {/* Sticky footer */}
            {footer && (
              <div className="border-t border-gray-100 px-4 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
