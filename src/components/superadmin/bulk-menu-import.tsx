'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Sparkles, Upload, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface ParsedCategory {
    name: string
    description?: string
    icon?: string
}

interface ParsedVariation {
    name: string
    priceModifier: number
}

interface ParsedVariationType {
    name: string
    isRequired: boolean
    options: ParsedVariation[]
}

interface ParsedAddon {
    name: string
    price: number
}

interface ParsedMenuItem {
    name: string
    description?: string
    category: string
    price: number
    variations?: ParsedVariationType[]
    addons?: ParsedAddon[]
    note?: string
}

interface ParsedMenuData {
    categories: ParsedCategory[]
    items: ParsedMenuItem[]
}

interface BulkMenuImportProps {
    tenantId: string
    tenantName: string
}

export function BulkMenuImport({ tenantId, tenantName }: BulkMenuImportProps) {
    const [menuText, setMenuText] = useState('')
    const [parsedData, setParsedData] = useState<ParsedMenuData | null>(null)
    const [isParsing, setIsParsing] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [showPreview, setShowPreview] = useState(true)
    const [importResult, setImportResult] = useState<{
        categoriesCreated: number
        categoriesSkipped: number
        itemsCreated: number
        itemsFailed: number
        errors: string[]
    } | null>(null)

    const handleParse = async () => {
        if (!menuText.trim()) {
            toast.error('Please enter menu text to parse')
            return
        }

        setIsParsing(true)
        setParsedData(null)
        setImportResult(null)

        try {
            const response = await fetch('/api/ai/parse-menu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ menuText }),
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

    const handleImport = async () => {
        if (!parsedData) {
            toast.error('No parsed data to import')
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

            // Clear the form on success
            if (result.results.itemsFailed === 0) {
                setMenuText('')
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

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    Bulk Menu Import
                </CardTitle>
                <CardDescription>
                    Paste menu text in natural language format. AI will parse and structure it for import into {tenantName}.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Input Section */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Menu Text</label>
                    <Textarea
                        placeholder={`Paste your menu here, for example:

Bakes (Banana Loaf)

Classic Banana
Category: Bakes / Banana Loaf 
Price: P150 
Variation: Solo / Loaf 

Double Choco
Category: Bakes / Banana Loaf 
Price: P200 

Pastries

Revel Bar
Category: Pastries 
Price/Variation:
Big Solo: P120 
Box of 12: P350`}
                        value={menuText}
                        onChange={(e) => setMenuText(e.target.value)}
                        rows={12}
                        className="font-mono text-sm"
                        disabled={isParsing || isImporting}
                    />
                    <p className="text-xs text-muted-foreground">
                        The AI will extract categories, items, prices, and variations from natural language text.
                    </p>
                </div>

                {/* Parse Button */}
                <Button
                    onClick={handleParse}
                    disabled={!menuText.trim() || isParsing || isImporting}
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
                    <div className="space-y-4 border-t pt-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Check className="h-4 w-4 text-green-500" />
                                Parsed Results
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
                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                        Categories ({parsedData.categories.length})
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {parsedData.categories.map((cat, i) => (
                                            <span
                                                key={i}
                                                className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-md text-sm"
                                            >
                                                {cat.icon} {cat.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Menu Items */}
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                        Menu Items ({parsedData.items.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {parsedData.items.map((item, i) => (
                                            <div
                                                key={i}
                                                className="p-3 bg-muted/50 rounded-lg text-sm"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <span className="font-medium">{item.name}</span>
                                                        <span className="text-muted-foreground ml-2 text-xs">
                                                            → {item.category}
                                                        </span>
                                                    </div>
                                                    <span className="font-semibold text-green-600">
                                                        {formatPrice(item.price)}
                                                    </span>
                                                </div>
                                                {item.description && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {item.description}
                                                    </p>
                                                )}
                                                {item.variations && item.variations.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {item.variations.map((varType, vi) => (
                                                            <span key={vi} className="text-xs">
                                                                {varType.name}: {varType.options.map(o =>
                                                                    `${o.name}${o.priceModifier > 0 ? ` (+${formatPrice(o.priceModifier)})` : ''}`
                                                                ).join(', ')}
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
                            disabled={isImporting}
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
                                    Import {parsedData.items.length} Items
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* Import Results */}
                {importResult && (
                    <div className="border-t pt-4">
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                            {importResult.itemsFailed === 0 ? (
                                <Check className="h-4 w-4 text-green-500" />
                            ) : (
                                <AlertCircle className="h-4 w-4 text-yellow-500" />
                            )}
                            Import Results
                        </h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="p-2 bg-green-50 rounded">
                                <span className="font-medium text-green-700">
                                    {importResult.categoriesCreated}
                                </span>
                                <span className="text-green-600 ml-1">categories created</span>
                            </div>
                            <div className="p-2 bg-blue-50 rounded">
                                <span className="font-medium text-blue-700">
                                    {importResult.categoriesSkipped}
                                </span>
                                <span className="text-blue-600 ml-1">categories skipped (existing)</span>
                            </div>
                            <div className="p-2 bg-green-50 rounded">
                                <span className="font-medium text-green-700">
                                    {importResult.itemsCreated}
                                </span>
                                <span className="text-green-600 ml-1">items created</span>
                            </div>
                            {importResult.itemsFailed > 0 && (
                                <div className="p-2 bg-red-50 rounded">
                                    <span className="font-medium text-red-700">
                                        {importResult.itemsFailed}
                                    </span>
                                    <span className="text-red-600 ml-1">items failed</span>
                                </div>
                            )}
                        </div>
                        {importResult.errors.length > 0 && (
                            <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
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
            </CardContent>
        </Card>
    )
}
