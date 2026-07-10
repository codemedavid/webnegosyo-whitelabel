'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
    Loader2,
    Sparkles,
    Upload,
    Check,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    ImagePlus,
    FileText,
    X,
    Trash2,
} from 'lucide-react'
import type { ParsedMenuData } from '@/types/ai-menu-parser'

const MAX_IMAGES = 3
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

type InputMode = 'text' | 'image'

interface ImportResults {
    categoriesCreated: number
    categoriesSkipped: number
    itemsCreated: number
    itemsFailed: number
    errors: string[]
}

interface BulkMenuImportProps {
    tenantId: string
    tenantName: string
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
        reader.readAsDataURL(file)
    })
}

export function BulkMenuImport({ tenantId, tenantName }: BulkMenuImportProps) {
    const [mode, setMode] = useState<InputMode>('text')
    const [menuText, setMenuText] = useState('')
    const [imageNotes, setImageNotes] = useState('')
    const [images, setImages] = useState<string[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const [parsedData, setParsedData] = useState<ParsedMenuData | null>(null)
    const [isParsing, setIsParsing] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [showPreview, setShowPreview] = useState(true)
    const [importResult, setImportResult] = useState<ImportResults | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const hasInput = mode === 'text' ? Boolean(menuText.trim()) : images.length > 0

    const addFiles = async (files: FileList | File[]) => {
        const incoming = Array.from(files)
        if (images.length + incoming.length > MAX_IMAGES) {
            toast.error(`You can attach up to ${MAX_IMAGES} menu images`)
            return
        }
        for (const file of incoming) {
            if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
                toast.error(`${file.name}: only PNG, JPEG, or WebP images are supported`)
                return
            }
            if (file.size > MAX_IMAGE_BYTES) {
                toast.error(`${file.name}: images must be under 4MB`)
                return
            }
        }
        try {
            const dataUrls = await Promise.all(incoming.map(readFileAsDataUrl))
            setImages(prev => [...prev, ...dataUrls])
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not read image')
        }
    }

    const handleParse = async () => {
        if (!hasInput) {
            toast.error(mode === 'text' ? 'Please enter menu text to parse' : 'Please add at least one menu image')
            return
        }

        setIsParsing(true)
        setParsedData(null)
        setImportResult(null)

        try {
            const payload = mode === 'text'
                ? { menuText, images: [] as string[] }
                : { menuText: imageNotes, images }

            const response = await fetch('/api/ai/parse-menu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Failed to parse menu')
            }

            setParsedData(result.data)
            toast.success(`Parsed ${result.data.categories.length} categories and ${result.data.items.length} items`)
        } catch (error) {
            console.error('Parse error:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to parse menu')
        } finally {
            setIsParsing(false)
        }
    }

    const handleRemoveItem = (index: number) => {
        setParsedData(prev => {
            if (!prev) return prev
            return { ...prev, items: prev.items.filter((_, i) => i !== index) }
        })
    }

    const handleImport = async () => {
        if (!parsedData || parsedData.items.length === 0) {
            toast.error('No parsed items to import')
            return
        }

        setIsImporting(true)

        try {
            const response = await fetch(`/api/tenants/${tenantId}/bulk-menu-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ menuData: parsedData }),
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Failed to import menu')
            }

            setImportResult(result.results)
            toast.success(result.message)

            if (result.results.itemsFailed === 0) {
                setMenuText('')
                setImageNotes('')
                setImages([])
                setParsedData(null)
            }
        } catch (error) {
            console.error('Import error:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to import menu')
        } finally {
            setIsImporting(false)
        }
    }

    const formatPrice = (price: number | undefined | null) => {
        if (price === undefined || price === null) {
            return '₱0'
        }
        return `₱${price.toLocaleString()}`
    }

    const itemCount = parsedData?.items.length ?? 0

    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="mb-5">
                <span className="inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
                    AI Import
                </span>
                <h2 className="mt-3 flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
                    <Sparkles className="h-5 w-5 text-violet-400" />
                    Bulk Menu Import
                </h2>
                <p className="mt-1 text-sm text-white/55">
                    Paste menu text or upload menu photos. AI extracts categories, items, prices, variations,
                    and add-ons — with appetizing descriptions — ready to import into {tenantName}.
                </p>
            </div>
            <div className="space-y-4">
                {/* Mode Tabs */}
                <div role="tablist" aria-label="Menu input mode" className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'text'}
                        onClick={() => setMode('text')}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mode === 'text'
                            ? 'bg-violet-500/20 text-violet-200'
                            : 'text-white/55 hover:text-white'
                            }`}
                    >
                        <FileText className="h-4 w-4" />
                        Paste Text
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'image'}
                        onClick={() => setMode('image')}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mode === 'image'
                            ? 'bg-violet-500/20 text-violet-200'
                            : 'text-white/55 hover:text-white'
                            }`}
                    >
                        <ImagePlus className="h-4 w-4" />
                        Upload Images
                    </button>
                </div>

                {/* Text Mode */}
                {mode === 'text' && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Menu Text</label>
                        <Textarea
                            placeholder={`Paste your menu here, for example:

Bakes (Banana Loaf)

Classic Banana
Category: Bakes / Banana Loaf
Price: P150
Variation: Solo / Loaf

Pastries

Revel Bar
Category: Pastries
Price/Variation:
Big Solo: P120
Box of 12: P350

Add-ons (for all drinks): Pearls P20, Cream Cheese P30`}
                            value={menuText}
                            onChange={(e) => setMenuText(e.target.value)}
                            rows={12}
                            className="font-mono text-sm"
                            disabled={isParsing || isImporting}
                        />
                        <p className="text-xs text-white/45">
                            The AI extracts categories, items, prices, variations, and shared add-on sections,
                            and writes an appetizing description for each item.
                        </p>
                    </div>
                )}

                {/* Image Mode */}
                {mode === 'image' && (
                    <div className="space-y-3">
                        <input
                            ref={fileInputRef}
                            data-testid="menu-image-input"
                            type="file"
                            accept={ACCEPTED_IMAGE_TYPES.join(',')}
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                if (e.target.files?.length) {
                                    void addFiles(e.target.files)
                                    e.target.value = ''
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => {
                                e.preventDefault()
                                setIsDragging(true)
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault()
                                setIsDragging(false)
                                if (e.dataTransfer.files?.length) {
                                    void addFiles(e.dataTransfer.files)
                                }
                            }}
                            disabled={isParsing || isImporting || images.length >= MAX_IMAGES}
                            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-sm transition-colors ${isDragging
                                ? 'border-violet-400/60 bg-violet-400/10 text-violet-200'
                                : 'border-white/15 bg-white/[0.02] text-white/55 hover:border-white/30 hover:text-white/80'
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            <ImagePlus className="h-8 w-8" />
                            <span className="font-medium">
                                {images.length >= MAX_IMAGES
                                    ? `Maximum of ${MAX_IMAGES} images attached`
                                    : 'Click or drag & drop menu photos'}
                            </span>
                            <span className="text-xs text-white/40">
                                PNG, JPEG, or WebP · up to {MAX_IMAGES} images · 4MB each
                            </span>
                        </button>

                        {images.length > 0 && (
                            <div className="flex flex-wrap gap-3">
                                {images.map((src, i) => (
                                    <div key={i} className="group relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={src}
                                            alt={`Menu page ${i + 1}`}
                                            className="h-28 w-28 rounded-xl border border-white/10 object-cover"
                                        />
                                        <button
                                            type="button"
                                            aria-label={`Remove menu page ${i + 1}`}
                                            onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                                            className="absolute -right-2 -top-2 rounded-full border border-white/20 bg-black/80 p-1 text-white/70 transition-colors hover:text-red-400"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-white">Extra notes (optional)</label>
                            <Textarea
                                placeholder="Anything the AI should know, e.g. 'Prices are in PHP', 'Second photo is the drinks page'"
                                value={imageNotes}
                                onChange={(e) => setImageNotes(e.target.value)}
                                rows={2}
                                className="text-sm"
                                disabled={isParsing || isImporting}
                            />
                        </div>
                    </div>
                )}

                {/* Parse Button */}
                <Button
                    onClick={handleParse}
                    disabled={!hasInput || isParsing || isImporting}
                    className="w-full sm:w-auto"
                >
                    {isParsing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Parsing with AI...
                        </>
                    ) : (
                        <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Parse Menu
                        </>
                    )}
                </Button>

                {/* Parsed Data Preview */}
                {parsedData && (
                    <div className="space-y-4 border-t border-white/10 pt-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-white flex items-center gap-2">
                                <Check className="h-4 w-4 text-emerald-400" />
                                Parsed Results
                                <span className="text-xs font-normal text-white/45">
                                    review, remove anything wrong, then import
                                </span>
                            </h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowPreview(!showPreview)}
                            >
                                {showPreview ? (
                                    <><ChevronUp className="h-4 w-4 mr-1" /> Hide</>
                                ) : (
                                    <><ChevronDown className="h-4 w-4 mr-1" /> Show</>
                                )}
                            </Button>
                        </div>

                        {showPreview && (
                            <div className="space-y-4 max-h-96 overflow-y-auto">
                                {/* Categories */}
                                <div>
                                    <h4 className="text-xs uppercase tracking-wide text-white/45 mb-2">
                                        Categories ({parsedData.categories.length})
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {parsedData.categories.map((cat, i) => (
                                            <span
                                                key={i}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-violet-400/20 bg-violet-400/10 text-violet-300 text-sm"
                                            >
                                                {cat.icon} {cat.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Menu Items */}
                                <div>
                                    <h4 className="text-xs uppercase tracking-wide text-white/45 mb-2">
                                        Menu Items ({parsedData.items.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {parsedData.items.map((item, i) => (
                                            <div
                                                key={`${item.name}-${i}`}
                                                className="p-3 rounded-xl border border-white/10 bg-white/[0.02] text-sm transition-colors hover:bg-white/[0.04]"
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div>
                                                        <span className="font-medium text-white">{item.name}</span>
                                                        <span className="text-white/45 ml-2 text-xs">
                                                            → {item.category}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-emerald-400">
                                                            {formatPrice(item.price)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            aria-label={`Remove ${item.name}`}
                                                            onClick={() => handleRemoveItem(i)}
                                                            className="rounded-md p-1 text-white/35 transition-colors hover:bg-red-400/10 hover:text-red-400"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {item.description && (
                                                    <p className="text-xs text-white/45 mt-1">
                                                        {item.description}
                                                    </p>
                                                )}
                                                {item.variations && item.variations.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {item.variations.map((varType, vi) => (
                                                            <span key={vi} className="text-xs text-white/60">
                                                                {varType.name}: {varType.options.map(o =>
                                                                    `${o.name}${o.priceModifier > 0 ? ` (+${formatPrice(o.priceModifier)})` : ''}`
                                                                ).join(', ')}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {item.addons && item.addons.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {item.addons.map((addon, ai) => (
                                                            <span
                                                                key={ai}
                                                                className="inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300"
                                                            >
                                                                + {addon.name} ({formatPrice(addon.price)})
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Import Button */}
                        <Button
                            onClick={handleImport}
                            disabled={isImporting || itemCount === 0}
                            className="w-full"
                            variant="default"
                        >
                            {isImporting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Importing to Database...
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Import {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* Import Results */}
                {importResult && (
                    <div className="border-t border-white/10 pt-4">
                        <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                            {importResult.itemsFailed === 0 ? (
                                <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                                <AlertCircle className="h-4 w-4 text-amber-400" />
                            )}
                            Import Results
                        </h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="p-2.5 rounded-xl border border-emerald-400/20 bg-emerald-400/10">
                                <span className="font-medium text-emerald-400">
                                    {importResult.categoriesCreated}
                                </span>
                                <span className="text-emerald-400/80 ml-1">categories created</span>
                            </div>
                            <div className="p-2.5 rounded-xl border border-sky-400/20 bg-sky-400/10">
                                <span className="font-medium text-sky-400">
                                    {importResult.categoriesSkipped}
                                </span>
                                <span className="text-sky-400/80 ml-1">categories skipped (existing)</span>
                            </div>
                            <div className="p-2.5 rounded-xl border border-emerald-400/20 bg-emerald-400/10">
                                <span className="font-medium text-emerald-400">
                                    {importResult.itemsCreated}
                                </span>
                                <span className="text-emerald-400/80 ml-1">items created</span>
                            </div>
                            {importResult.itemsFailed > 0 && (
                                <div className="p-2.5 rounded-xl border border-red-400/20 bg-red-400/10">
                                    <span className="font-medium text-red-400">
                                        {importResult.itemsFailed}
                                    </span>
                                    <span className="text-red-400/80 ml-1">items failed</span>
                                </div>
                            )}
                        </div>
                        {importResult.errors.length > 0 && (
                            <div className="mt-2 p-3 rounded-xl border border-red-400/20 bg-red-400/10 text-sm text-red-400">
                                <p className="font-medium">Errors:</p>
                                <ul className="list-disc list-inside">
                                    {importResult.errors.slice(0, 5).map((err, i) => (
                                        <li key={i}>{err}</li>
                                    ))}
                                    {importResult.errors.length > 5 && (
                                        <li>...and {importResult.errors.length - 5} more</li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    )
}
