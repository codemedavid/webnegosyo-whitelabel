'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    updateTenantMessengerModeAction,
    updateTenantMessengerRedirectEnabledAction,
    updateTenantMessengerUsernameAction,
} from '@/actions/tenants'
import { normalizeMessengerUsername } from '@/lib/messenger-username'
import { toast } from 'sonner'

interface MessengerModeCardProps {
    tenantId: string
    currentMode: 'webhook' | 'direct'
    currentRedirectEnabled: boolean
    /** The m.me handle "direct" mode links to. Empty when never configured. */
    currentUsername?: string
}

export function MessengerModeCard({ tenantId, currentMode, currentRedirectEnabled, currentUsername = '' }: MessengerModeCardProps) {
    const [mode, setMode] = useState<'webhook' | 'direct'>(currentMode)
    const [redirectEnabled, setRedirectEnabled] = useState<boolean>(currentRedirectEnabled)
    const [username, setUsername] = useState<string>(currentUsername)
    const [isPending, startTransition] = useTransition()

    const handleToggleRedirect = (next: boolean) => {
        setRedirectEnabled(next)
        startTransition(async () => {
            const result = await updateTenantMessengerRedirectEnabledAction(tenantId, next)
            if (result.error) {
                setRedirectEnabled(!next) // revert optimistic update on failure
                toast.error(result.error)
            } else {
                toast.success(next ? 'Messenger redirect turned on' : 'Messenger redirect turned off')
            }
        })
    }

    const handleSave = () => {
        startTransition(async () => {
            const result = await updateTenantMessengerModeAction(tenantId, mode)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Messenger redirect mode updated!')
            }
        })
    }

    const handleSaveUsername = () => {
        // Normalize before sending so the merchant sees the stored handle, not the
        // URL they pasted. The action re-normalizes — this is display, not trust.
        const normalized = normalizeMessengerUsername(username)
        // Send the raw value when it normalizes to nothing, so the server can tell
        // "cleared the field" from "pasted something that isn't a page link".
        startTransition(async () => {
            const result = await updateTenantMessengerUsernameAction(tenantId, normalized || username)
            if (result.error) {
                toast.error(result.error)
            } else {
                setUsername(normalized)
                toast.success('Messenger username saved')
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>📱 Messenger Redirect</CardTitle>
                <CardDescription>
                    Control whether and how customers are redirected to Messenger after checkout
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <label className="flex items-start justify-between gap-4 p-4 rounded-lg border border-gray-200">
                    <div>
                        <span className="font-medium">Auto-open Messenger after checkout</span>
                        <p className="text-sm text-muted-foreground mt-1">
                            When on, customers are redirected to Messenger a few seconds after placing
                            an order. When off, they stay on the confirmation screen and can send the
                            order message manually.
                        </p>
                    </div>
                    <input
                        type="checkbox"
                        role="switch"
                        aria-label="Auto-open Messenger after checkout"
                        checked={redirectEnabled}
                        onChange={(e) => handleToggleRedirect(e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0"
                        disabled={isPending}
                    />
                </label>

                <div className="space-y-2 p-4 rounded-lg border border-gray-200">
                    <Label htmlFor="messenger_username">Messenger username</Label>
                    <div className="flex gap-2">
                        <Input
                            id="messenger_username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="islandsilog or https://m.me/islandsilog"
                            disabled={isPending}
                        />
                        <Button onClick={handleSaveUsername} disabled={isPending} variant="outline">
                            Save username
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        The handle in your page&apos;s m.me link. Used by the &quot;pre-filled message&quot;
                        method below — paste the link and we&apos;ll pull the handle out.
                    </p>
                </div>

                <div className={`space-y-3 ${redirectEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                    <Label>Select redirect method:</Label>

                    <div className="space-y-3">
                        <label
                            className={`flex items-start p-4 rounded-lg border cursor-pointer transition-colors ${mode === 'webhook'
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            <input
                                type="radio"
                                name="messenger_mode"
                                value="webhook"
                                checked={mode === 'webhook'}
                                onChange={() => setMode('webhook')}
                                className="mt-1 mr-3"
                                disabled={isPending}
                            />
                            <div>
                                <span className="font-medium">Webhook Mode (Recommended)</span>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Uses m.me links with ref parameter for tracking. Orders can be
                                    automatically sent to the customer&apos;s Messenger via webhook when
                                    Facebook page is connected.
                                </p>
                            </div>
                        </label>

                        <label
                            className={`flex items-start p-4 rounded-lg border cursor-pointer transition-colors ${mode === 'direct'
                                    ? 'border-amber-500 bg-amber-50'
                                    : 'border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            <input
                                type="radio"
                                name="messenger_mode"
                                value="direct"
                                checked={mode === 'direct'}
                                onChange={() => setMode('direct')}
                                className="mt-1 mr-3"
                                disabled={isPending}
                            />
                            <div>
                                <span className="font-medium">Direct Mode</span>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Opens Messenger directly (messenger.com/t/). Simpler but no
                                    webhook tracking - customer needs to send the order message manually.
                                </p>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="pt-2">
                    <Button
                        onClick={handleSave}
                        disabled={isPending || mode === currentMode}
                    >
                        {isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
