'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tenant } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BrandingDraft {
  primary_color: string
  secondary_color: string
  accent_color?: string
  background_color?: string
  header_color?: string
  header_font_color?: string
  cards_color?: string
  cards_border_color?: string
  button_primary_color?: string
  button_primary_text_color?: string
  text_primary_color?: string
  text_secondary_color?: string
  border_color?: string
  // Hero customization
  hero_title?: string
  hero_description?: string
  hero_title_color?: string
  hero_description_color?: string
}

interface BrandingEditorOverlayProps {
  tenant: Tenant
  onPreview: (draft: Partial<BrandingDraft> | null) => void
  onSaved?: () => void
}

export function BrandingEditorOverlay({ tenant, onPreview, onSaved }: BrandingEditorOverlayProps) {
  const supabase = useMemo(() => createClient(), [])
  const [isAllowed, setIsAllowed] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const [draft, setDraft] = useState<BrandingDraft>({
    primary_color: tenant.primary_color,
    secondary_color: tenant.secondary_color,
    accent_color: tenant.accent_color || '',
    background_color: tenant.background_color || '',
    header_color: tenant.header_color || '',
    header_font_color: tenant.header_font_color || '',
    cards_color: tenant.cards_color || '',
    cards_border_color: tenant.cards_border_color || '',
    button_primary_color: tenant.button_primary_color || '',
    button_primary_text_color: tenant.button_primary_text_color || '',
    text_primary_color: tenant.text_primary_color || '',
    text_secondary_color: tenant.text_secondary_color || '',
    border_color: tenant.border_color || '',
    hero_title: tenant.hero_title || '',
    hero_description: tenant.hero_description || '',
    hero_title_color: tenant.hero_title_color || '',
    hero_description_color: tenant.hero_description_color || '',
  })

  // Check role client-side (RLS still protects the update)
  useEffect(() => {
    let isCancelled = false
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: role } = await supabase
        .from('app_users')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (isCancelled) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = role as any
      const allowed = !!r && (r.role === 'superadmin' || (r.role === 'admin' && r.tenant_id === tenant.id))
      setIsAllowed(allowed)
    }
    checkRole()
    return () => { isCancelled = true }
  }, [supabase, tenant.id])

  // Live preview hook
  useEffect(() => {
    if (isOpen) onPreview(draft)
    else onPreview(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draft])

  if (!isAllowed) return null

  function updateDraft<K extends keyof BrandingDraft>(key: K, value: BrandingDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function handleSave() {
    startSaving(async () => {
      const { error } = await supabase
        .from('tenants')
        // Cast through unknown to satisfy strict generic constraints if local types differ
        .update(draft as unknown as never)
        .eq('id', tenant.id)
      if (!error) {
        setIsOpen(false)
        onSaved?.()
      }
    })
  }

  return (
    <>
      {/* Floating square toggle */}
      <button
        type="button"
        aria-label="Edit branding"
        className="fixed right-4 bottom-6 z-[60] h-12 w-12 rounded-lg border bg-white shadow-lg flex items-center justify-center hover:bg-gray-50"
        onClick={() => setIsOpen((v) => !v)}
        title={isOpen ? 'Close editor' : 'Edit branding'}
      >
        <span className="text-xl">🎨</span>
      </button>

      {/* Floating panel */}
      {isOpen && (
        <div className="fixed right-4 bottom-24 z-[60] w-[380px] max-h-[80vh] overflow-auto rounded-lg border bg-white shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Branding Editor</span>
              <span className="text-xs text-muted-foreground">Previewing changes</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsOpen(false)}>Close</Button>
              <Button size="sm" disabled={isSaving} onClick={handleSave}>{isSaving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
          <div className="p-4 space-y-6">
            {/* Hero section customization */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="hero_title">Hero Title</Label>
                <Input id="hero_title" name="hero_title" value={draft.hero_title || ''} onChange={(e) => updateDraft('hero_title', e.target.value)} placeholder="Our Menu" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hero_description">Hero Description</Label>
                <Input id="hero_description" name="hero_description" value={draft.hero_description || ''} onChange={(e) => updateDraft('hero_description', e.target.value)} placeholder="Your Smart Ordering Partner" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Swatch id="hero_title_color" label="Hero Title Color" value={draft.hero_title_color || ''} onChange={(v) => updateDraft('hero_title_color', v)} />
                <Swatch id="hero_description_color" label="Hero Desc Color" value={draft.hero_description_color || ''} onChange={(v) => updateDraft('hero_description_color', v)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Core */}
              <Swatch id="primary_color" label="Primary" value={draft.primary_color} onChange={(v) => updateDraft('primary_color', v)} />
              <Swatch id="secondary_color" label="Secondary" value={draft.secondary_color} onChange={(v) => updateDraft('secondary_color', v)} />
              <Swatch id="accent_color" label="Accent" value={draft.accent_color || ''} onChange={(v) => updateDraft('accent_color', v)} />

              {/* Layout */}
              <Swatch id="background_color" label="Background" value={draft.background_color || ''} onChange={(v) => updateDraft('background_color', v)} />
              <Swatch id="header_color" label="Header" value={draft.header_color || ''} onChange={(v) => updateDraft('header_color', v)} />
              <Swatch id="header_font_color" label="Header Font" value={draft.header_font_color || ''} onChange={(v) => updateDraft('header_font_color', v)} />
              <Swatch id="cards_color" label="Cards" value={draft.cards_color || ''} onChange={(v) => updateDraft('cards_color', v)} />
              <Swatch id="cards_border_color" label="Cards Border" value={draft.cards_border_color || ''} onChange={(v) => updateDraft('cards_border_color', v)} />
              <Swatch id="border_color" label="Border" value={draft.border_color || ''} onChange={(v) => updateDraft('border_color', v)} />

              {/* Buttons */}
              <Swatch id="button_primary_color" label="Btn Primary" value={draft.button_primary_color || ''} onChange={(v) => updateDraft('button_primary_color', v)} />
              <Swatch id="button_primary_text_color" label="Btn Primary Text" value={draft.button_primary_text_color || ''} onChange={(v) => updateDraft('button_primary_text_color', v)} />

              {/* Text */}
              <Swatch id="text_primary_color" label="Text Primary" value={draft.text_primary_color || ''} onChange={(v) => updateDraft('text_primary_color', v)} />
              <Swatch id="text_secondary_color" label="Text Secondary" value={draft.text_secondary_color || ''} onChange={(v) => updateDraft('text_secondary_color', v)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Swatch({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <Input id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} type="color" className="h-9 w-12 p-0 border rounded-md" />
        <Input value={value} readOnly className="font-mono text-sm" />
      </div>
    </div>
  )
}


