'use client'

import { Button } from '@/components/ui/button'

export function ResetButton() {
  return (
    <Button 
      type="button" 
      variant="outline" 
      size="lg" 
      onClick={() => window.location.reload()}
    >
      Reset
    </Button>
  )
}

