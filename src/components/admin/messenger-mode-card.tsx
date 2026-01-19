'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateTenantMessengerModeAction } from '@/actions/tenants'
import { toast } from 'sonner'

interface MessengerModeCardProps {
    tenantId: string
    currentMode: 'webhook' | 'direct'
}

export function MessengerModeCard({ tenantId, currentMode }: MessengerModeCardProps) {
    const [mode, setMode] = useState<'webhook' | 'direct'>(currentMode)
    const [isPending, startTransition] = useTransition()

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

    return (
        <Card>
            <CardHeader>
                <CardTitle>📱 Messenger Redirect Mode</CardTitle>
                <CardDescription>
                    Choose how customers are redirected to Messenger after checkout
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
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
