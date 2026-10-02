import { Globe } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CustomDomainPanel, type CustomDomainPanelProps } from './custom-domain-panel'

/** Settings-page wrapper around the self-serve custom domain panel. */
export function CustomDomainCard(props: CustomDomainPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" aria-hidden />
          Custom domain
        </CardTitle>
        <CardDescription>
          Let customers order at your own web address. We point it at your store and handle the secure (https)
          certificate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CustomDomainPanel {...props} />
      </CardContent>
    </Card>
  )
}
