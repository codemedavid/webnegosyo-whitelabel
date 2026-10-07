'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileArchive, Printer, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { loadLogoDataUrl } from '@/lib/qr-print/browser-export'
import { renderQrArtwork, type QrArtwork, type QrDesign } from '@/lib/qr-print/qr-artwork'
import { buildQrCatalog, type QrExtraTables, type QrItem, type QrOutlet, type QrTable } from '@/lib/qr-print/qr-items'
import type { StoreAddress } from '@/lib/qr-print/qr-links'
import type { CodesPerPage } from '@/lib/qr-print/print-sheet'
import { AddTablesForm } from './add-tables-form'
import { QrCodeGroup } from './qr-code-group'
import { QrSettingsBar } from './qr-settings-bar'
import { useQrExport, type DownloadFormat, type ExportEntry } from './use-qr-export'

const MENU_CAPTION = 'Scan to see our menu and order'
const TABLE_CAPTION = 'Scan to order from your table'

interface QrCodesStudioProps {
  storeName: string
  tenantSlug: string
  logoUrl: string | null
  accentColor: string | null
  addresses: StoreAddress[]
  isMultiBranch: boolean
  outlets: QrOutlet[]
  tables: QrTable[]
  didTablesFail: boolean
}

type LogoState = 'loading' | 'ready' | 'missing'

function useStoreLogo(logoUrl: string | null) {
  const [logo, setLogo] = useState<{ dataUrl: string | null; state: LogoState }>({
    dataUrl: null,
    state: logoUrl ? 'loading' : 'missing',
  })

  useEffect(() => {
    if (!logoUrl) return
    let isCurrent = true
    loadLogoDataUrl(logoUrl).then((dataUrl) => {
      if (isCurrent) setLogo({ dataUrl, state: dataUrl ? 'ready' : 'missing' })
    })
    return () => {
      isCurrent = false
    }
  }, [logoUrl])

  return logo
}

function itemLabel(item: QrItem): string {
  if (item.kind === 'store') return 'Store menu'
  return [item.title, item.subtitle].filter(Boolean).join(' · ')
}

export function QrCodesStudio(props: QrCodesStudioProps) {
  const { storeName, tenantSlug, addresses, isMultiBranch, outlets, tables } = props
  const [addressKey, setAddressKey] = useState<string>(addresses[0]?.key ?? '')
  const [design, setDesign] = useState<QrDesign>('card')
  const [caption, setCaption] = useState('')
  const [perPage, setPerPage] = useState<CodesPerPage>(4)
  const [extraTables, setExtraTables] = useState<QrExtraTables[]>([])
  const logo = useStoreLogo(props.logoUrl)
  const { busyKey, downloadOne, downloadAll, print } = useQrExport(perPage)

  const baseUrl = addresses.find((address) => address.key === addressKey)?.baseUrl ?? null
  const activeOutlets = useMemo(() => outlets.filter((outlet) => outlet.isActive), [outlets])

  const catalog = useMemo(
    () =>
      baseUrl
        ? buildQrCatalog({ tenantSlug, baseUrl, isMultiBranch, outlets, tables, extraTables })
        : null,
    [baseUrl, tenantSlug, isMultiBranch, outlets, tables, extraTables]
  )

  const artworks = useMemo(() => {
    const map = new Map<string, QrArtwork | null>()
    if (!catalog) return map
    const items = [catalog.store, ...catalog.branches, ...catalog.tableGroups.flatMap((group) => group.items)]
    for (const item of items) {
      map.set(
        item.id,
        renderQrArtwork({
          url: item.url,
          design,
          storeName,
          title: item.title,
          subtitle: item.subtitle,
          caption: caption.trim() || (item.kind === 'table' ? TABLE_CAPTION : MENU_CAPTION),
          accentColor: props.accentColor ?? '',
          logoDataUrl: logo.dataUrl,
        })
      )
    }
    return map
  }, [catalog, design, storeName, caption, props.accentColor, logo.dataUrl])

  const entriesFor = useCallback(
    (items: QrItem[]): ExportEntry[] =>
      items.flatMap((item) => {
        const artwork = artworks.get(item.id)
        return artwork ? [{ fileName: item.fileName, artwork }] : []
      }),
    [artworks]
  )

  const handleDownload = useCallback(
    (item: QrItem, format: DownloadFormat) => {
      const [entry] = entriesFor([item])
      if (entry) downloadOne(`${item.id}:${format}`, entry, format)
    },
    [entriesFor, downloadOne]
  )
  const handleDownloadAll = useCallback(
    (groupKey: string, items: QrItem[]) =>
      downloadAll(`${groupKey}:zip`, entriesFor(items), `${tenantSlug}-${groupKey.replace(/[^a-z0-9]+/gi, '-')}-qr-codes`),
    [entriesFor, downloadAll, tenantSlug]
  )
  const handlePrint = useCallback(
    (groupKey: string, items: QrItem[]) => print(`${groupKey}:print`, entriesFor(items), `${storeName} QR codes`),
    [entriesFor, print, storeName]
  )

  if (!catalog) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>We couldn&apos;t work out your store&apos;s web address</AlertTitle>
        <AlertDescription>Contact the WebNegosyo team so we can set it up before you print codes.</AlertDescription>
      </Alert>
    )
  }

  const groupProps = {
    artworks,
    labelFor: itemLabel,
    busyKey,
    onDownload: handleDownload,
    onDownloadAll: handleDownloadAll,
    onPrint: handlePrint,
  }
  const allTableItems = catalog.tableGroups.flatMap((group) => group.items)
  const hasTypedTables = extraTables.length > 0

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <aside className="lg:sticky lg:top-6 lg:order-2" aria-label="QR code settings">
        <QrSettingsBar
          addresses={addresses}
          addressKey={addressKey}
          onAddressChange={setAddressKey}
          design={design}
          onDesignChange={setDesign}
          caption={caption}
          captionPlaceholder={MENU_CAPTION}
          onCaptionChange={setCaption}
          perPage={perPage}
          onPerPageChange={setPerPage}
          logoState={logo.state}
        />
      </aside>

      <Tabs defaultValue="store" className="min-w-0 space-y-5 lg:order-1">
        <TabsList>
          <TabsTrigger value="store">Store</TabsTrigger>
          {isMultiBranch && <TabsTrigger value="branches">Branches ({catalog.branches.length})</TabsTrigger>}
          <TabsTrigger value="tables">Tables ({allTableItems.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="store">
          <QrCodeGroup
            groupKey="store"
            title="Your store"
            description="One code for your whole menu — for the counter, the door, flyers and social posts."
            items={[catalog.store]}
            {...groupProps}
          />
        </TabsContent>

        {isMultiBranch && (
          <TabsContent value="branches">
            {catalog.branches.length > 0 ? (
              <QrCodeGroup
                groupKey="branches"
                title="Branches"
                description="Each code opens the menu with that branch already picked."
                items={catalog.branches}
                {...groupProps}
              />
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No active branches yet. Add one under Store → Branches.
              </p>
            )}
          </TabsContent>
        )}

        <TabsContent value="tables" className="space-y-8">
          {props.didTablesFail && (
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Your floor plan didn&apos;t load</AlertTitle>
              <AlertDescription>Refresh the page to try again, or type your table numbers below.</AlertDescription>
            </Alert>
          )}

          <AddTablesForm
            outlets={isMultiBranch ? activeOutlets : []}
            onAdd={(outletKey, labels) => setExtraTables((current) => [...current, { outletId: outletKey, labels }])}
          />

          {(catalog.tableGroups.length > 1 || hasTypedTables) && (
            <div className="flex flex-wrap gap-2">
              {catalog.tableGroups.length > 1 && (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={busyKey !== null} onClick={() => handleDownloadAll('tables', allTableItems)}>
                    <FileArchive className="h-4 w-4" aria-hidden />
                    Download every table (ZIP)
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={busyKey !== null} onClick={() => handlePrint('tables', allTableItems)}>
                    <Printer className="h-4 w-4" aria-hidden />
                    Print every table
                  </Button>
                </>
              )}
              {hasTypedTables && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setExtraTables([])}>
                  <X className="h-4 w-4" aria-hidden />
                  Remove typed tables
                </Button>
              )}
            </div>
          )}

          {catalog.tableGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              No tables yet. Type your table numbers above, or draw your floor in the merchant app&apos;s Tables screen —
              its tables show up here automatically.
            </p>
          ) : (
            catalog.tableGroups.map((group) => (
              <QrCodeGroup
                key={group.key}
                groupKey={`tables-${outlets.find((outlet) => outlet.id === group.key)?.slug ?? 'main'}`}
                title={group.name}
                items={group.items}
                {...groupProps}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
