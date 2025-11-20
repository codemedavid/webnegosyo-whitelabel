'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Facebook, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { getTempUserTokenAction } from '@/actions/facebook'

interface FacebookPage {
  id: string
  name: string
  access_token: string
}

interface FacebookPageSelectorProps {
  tenantId: string
  tempId: string
  onPageSelected: (pageId: string, pageName: string, pageAccessToken: string, userAccessToken: string) => void
  onClose: () => void
}

export function FacebookPageSelector({
  tenantId,
  tempId,
  onPageSelected,
  onClose,
}: FacebookPageSelectorProps) {
  const [pages, setPages] = useState<FacebookPage[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    loadPages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tempId])

  async function loadPages() {
    setIsLoading(true)
    try {
      // Fetch user's pages via API route
      const response = await fetch(
        `/api/facebook/pages?tenant_id=${tenantId}&temp_id=${tempId}`
      )
      const data = await response.json()

      if (!data.success || !data.data) {
        toast.error('Failed to load pages. Please try connecting again.')
        onClose()
        return
      }

      setPages(data.data)
    } catch (error) {
      console.error('Error loading pages:', error)
      toast.error('Failed to load your Facebook pages')
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  async function handleConnect() {
    if (!selectedPageId) {
      toast.error('Please select a page')
      return
    }

    const selectedPage = pages.find((p) => p.id === selectedPageId)
    if (!selectedPage) {
      toast.error('Selected page not found')
      return
    }

    setIsConnecting(true)
    try {
      // Get user token again for passing to connect
      const tokenResult = await getTempUserTokenAction(tenantId, tempId)
      if (!tokenResult.success || !tokenResult.data) {
        throw new Error('Failed to get user token')
      }

      onPageSelected(
        selectedPage.id,
        selectedPage.name,
        selectedPage.access_token,
        tokenResult.data.user_access_token
      )
    } catch (error) {
      console.error('Error connecting page:', error)
      toast.error('Failed to connect page')
    } finally {
      setIsConnecting(false)
    }
  }

  if (isLoading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Facebook Page</DialogTitle>
            <DialogDescription>Loading your Facebook pages...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (pages.length === 0) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Pages Found</DialogTitle>
            <DialogDescription>
              You don&apos;t have any Facebook Pages that you manage. Please create a Page first or
              ensure you have admin access to a Page.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Facebook Page</DialogTitle>
          <DialogDescription>
            Choose which Facebook Page you want to connect for receiving orders
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() => setSelectedPageId(page.id)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                selectedPageId === page.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                {selectedPageId === page.id ? (
                  <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                ) : (
                  <Facebook className="h-5 w-5 text-gray-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{page.name}</p>
                  <p className="text-xs text-muted-foreground">Page ID: {page.id}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isConnecting}>
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={!selectedPageId || isConnecting}
            className="flex-1"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

