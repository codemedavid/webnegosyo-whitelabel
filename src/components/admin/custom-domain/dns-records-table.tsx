'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { DnsRecord } from '@/lib/domains/domain-plan'

const PURPOSE_NOTE: Record<DnsRecord['purpose'], string> = {
  routing: 'Points your domain to your store',
  www: 'Sends www visitors to your store',
  ownership: 'Proves this domain belongs to your store',
  verification: 'Confirms the domain with our hosting provider',
}

async function copyValue(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Copied')
  } catch {
    toast.error('Could not copy. Select the text and copy it manually.')
  }
}

export function DnsRecordsTable({ records }: { records: DnsRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Name / Host</th>
            <th className="px-3 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={`${record.type}-${record.host}-${record.value}`} className="border-t align-top">
              <td className="px-3 py-2 font-mono font-medium">{record.type}</td>
              <td className="px-3 py-2">
                <code className="font-mono">{record.host}</code>
                <p className="mt-0.5 text-xs text-muted-foreground">{PURPOSE_NOTE[record.purpose]}</p>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-start gap-1">
                  <code className="break-all font-mono">{record.value}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => void copyValue(record.value)}
                    aria-label={`Copy ${record.type} value`}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
