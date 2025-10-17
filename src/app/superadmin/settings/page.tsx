'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'

export default function SuperAdminSettingsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Settings' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage platform settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform Configuration</CardTitle>
          <CardDescription>Global settings for the restaurant menu system</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Platform settings and configuration options will be available here
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>Monitor system health and performance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Database</span>
            <span className="text-sm font-medium text-green-600">Healthy</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">API Status</span>
            <span className="text-sm font-medium text-green-600">Operational</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Active Tenants</span>
            <span className="text-sm font-medium">3</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

