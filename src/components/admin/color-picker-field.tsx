'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface ColorPickerFieldProps {
    id: string
    label: string
    value: string
    onChange: (value: string) => void
    defaultValue?: string
    compact?: boolean
    presetColors?: string[]
}

const DEFAULT_PRESET_COLORS = [
    '#ffffff',
    '#f3f4f6',
    '#e5e7eb',
    '#d1d5db',
    '#9ca3af',
    '#6b7280',
    '#4b5563',
    '#374151',
    '#111827',
    '#000000',
    '#fecaca',
    '#fca5a5',
    '#f87171',
    '#ef4444',
    '#dc2626',
    '#b91c1c',
    '#bbf7d0',
    '#86efac',
    '#4ade80',
    '#22c55e',
    '#16a34a',
    '#15803d',
    '#bfdbfe',
    '#93c5fd',
    '#60a5fa',
    '#3b82f6',
    '#2563eb',
    '#1d4ed8',
    '#fef9c3',
    '#fef08a',
    '#fde047',
    '#eab308',
    '#ca8a04',
    '#a16207',
]

export function ColorPickerField({
    id,
    label,
    value,
    onChange,
    defaultValue,
    compact = false,
    presetColors = DEFAULT_PRESET_COLORS,
}: ColorPickerFieldProps) {
    const [showPresets, setShowPresets] = useState(false)
    const [lastValidHex, setLastValidHex] = useState<string>(() => {
        // Initialize with value if valid, otherwise fall back to defaultValue or empty
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
        if (hexRegex.test(value)) return value
        if (defaultValue && hexRegex.test(defaultValue)) return defaultValue
        return ''
    })
    const [error, setError] = useState<string | null>(null)

    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/

    const handleReset = () => {
        if (defaultValue !== undefined) {
            onChange(defaultValue)
            if (hexRegex.test(defaultValue)) {
                setLastValidHex(defaultValue)
            }
            setError(null)
        }
    }

    const isValidHex = hexRegex.test(value)
    const displayValue = isValidHex ? value : ''

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label htmlFor={id} className="text-xs font-medium text-gray-700">
                    {label}
                </Label>
                {defaultValue !== undefined && value !== defaultValue && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        className="h-auto p-0 text-xs text-blue-600 hover:text-blue-700"
                        aria-label={`Reset ${label} to default`}
                    >
                        Reset
                    </Button>
                )}
            </div>
            <div className="flex items-center gap-2">
                <div className="relative">
                    <input
                        id={id}
                        type="color"
                        value={displayValue}
                        onChange={(e) => {
                            const newValue = e.target.value
                            onChange(newValue)
                            if (hexRegex.test(newValue)) {
                                setLastValidHex(newValue)
                                setError(null)
                            }
                        }}
                        className="h-9 w-11 p-0.5 border border-gray-300 rounded-md cursor-pointer"
                        aria-label={`${label} color picker`}
                    />
                    {!isValidHex && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <span className="text-[10px] text-gray-400">+</span>
                        </div>
                    )}
                </div>
                {!compact && (
                    <div className="flex-1">
                        <Input
                            type="text"
                            value={value}
                            onChange={(e) => {
                                const newValue = e.target.value
                                // Allow partial inputs while typing (must start with # followed by 0-6 hex chars)
                                if (newValue === '' || /^#([A-Fa-f0-9]{0,6})$/.test(newValue)) {
                                    onChange(newValue)
                                    // Update lastValidHex if the new value is a complete valid hex
                                    if (hexRegex.test(newValue)) {
                                        setLastValidHex(newValue)
                                        setError(null)
                                    }
                                }
                            }}
                            onBlur={(e) => {
                                const newValue = e.target.value
                                // Validate full hex on blur - if invalid, revert to last valid value
                                if (newValue !== '' && !hexRegex.test(newValue)) {
                                    // Revert to last valid hex or defaultValue
                                    const fallbackValue = lastValidHex || defaultValue || ''
                                    onChange(fallbackValue)
                                    setError('Invalid hex color')
                                    // Clear error after a short delay for UX
                                    setTimeout(() => setError(null), 2000)
                                } else if (newValue === '' && defaultValue) {
                                    // If empty and we have a default, optionally revert to default
                                    onChange(defaultValue)
                                    if (hexRegex.test(defaultValue)) {
                                        setLastValidHex(defaultValue)
                                    }
                                    setError(null)
                                } else {
                                    setError(null)
                                }
                            }}
                            placeholder="#000000"
                            maxLength={7}
                            className={`font-mono text-xs bg-muted/50 ${error ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            aria-label={`${label} hex value`}
                            aria-invalid={!!error}
                        />
                        {error && (
                            <p className="text-xs text-red-500 mt-1">{error}</p>
                        )}
                    </div>
                )}
                <div
                    className="h-9 w-11 rounded-md border border-gray-300 shadow-sm"
                    style={{ backgroundColor: displayValue || 'transparent' }}
                    aria-hidden="true"
                />
            </div>

            {showPresets && (
                <div className="mt-2 p-2 border border-gray-200 rounded-md bg-white">
                    <div className="grid grid-cols-9 gap-1">
                        {presetColors.map((color) => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => {
                                    onChange(color)
                                    setShowPresets(false)
                                }}
                                className="h-6 w-6 rounded border border-gray-200 hover:border-gray-400 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
                                style={{ backgroundColor: color }}
                                aria-label={`Select color ${color}`}
                                title={color}
                            />
                        ))}
                    </div>
                </div>
            )}

            {!showPresets && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPresets(true)}
                    className="w-full h-8 text-xs"
                >
                    Show color presets
                </Button>
            )}
        </div>
    )
}
