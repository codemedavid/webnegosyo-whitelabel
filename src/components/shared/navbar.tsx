'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ShoppingCart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCart } from '@/hooks/useCart'
import type { Tenant } from '@/types/database'

interface NavbarProps {
  tenant: Tenant
  onCartClick: () => void
}

export function Navbar({ tenant, onCartClick }: NavbarProps) {
  const { item_count } = useCart()

  return (
    <header
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={
        {
          '--primary-color': tenant.primary_color,
        } as React.CSSProperties
      }
    >
      <div className="container flex h-16 items-center justify-between px-4">
        <Link href={`/${tenant.slug}/menu`} className="flex items-center space-x-3">
          {tenant.logo_url && (
            <div className="relative h-10 w-10">
              <Image
                src={tenant.logo_url}
                alt={tenant.name}
                fill
                className="rounded-full object-cover"
              />
            </div>
          )}
          <span className="text-xl font-bold">{tenant.name}</span>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={onCartClick}
        >
          <ShoppingCart className="h-5 w-5" />
          {item_count > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs"
            >
              {item_count}
            </Badge>
          )}
        </Button>
      </div>
    </header>
  )
}

