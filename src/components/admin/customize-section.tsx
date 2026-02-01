'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

interface CustomizeSectionProps {
    title: string
    emoji: string
    children: React.ReactNode
    defaultOpen?: boolean
    description?: string
}

export function CustomizeSection({
    title,
    emoji,
    children,
    defaultOpen = true,
    description,
}: CustomizeSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    return (
        <div className="space-y-3">
            <motion.button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full pb-2 border-b border-gray-200 hover:border-gray-300 transition-colors"
                aria-expanded={isOpen}
                aria-controls={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            >
                <div className="flex items-center gap-2">
                    <span className="text-base" aria-hidden="true">{emoji}</span>
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    {description && (
                        <span className="text-xs text-gray-500 hidden sm:inline ml-1">
                            - {description}
                        </span>
                    )}
                </div>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                </motion.div>
            </motion.button>

            <AnimatePresence mode="wait">
                {isOpen && (
                    <motion.div
                        id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: 0.1 }}
                            className="pb-2"
                        >
                            {children}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
