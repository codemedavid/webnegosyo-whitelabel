'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PaymentMethodForm } from '@/components/admin/payment-method-form'
import { PaymentMethodsList } from '@/components/admin/payment-methods-list'
import { getPaymentMethodsAction } from '@/app/actions/payment-methods'
import { getEnabledOrderTypesByTenantClient } from '@/lib/order-types-client'
import type { PaymentMethodWithOrderTypes } from '@/lib/payment-methods-service'
import type { OrderType } from '@/types/database'
import { toast } from 'sonner'

interface PaymentMethodsManagementProps {
  tenantId: string
  tenantSlug: string
}

export function PaymentMethodsManagement({ tenantId, tenantSlug }: PaymentMethodsManagementProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodWithOrderTypes[]>([])
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodWithOrderTypes | undefined>()
  const [activeTab, setActiveTab] = useState('all')

  const loadData = async () => {
    try {
      setIsLoading(true)
      setHasError(false)
      
      // Load payment methods
      const methodsResult = await getPaymentMethodsAction(tenantId)
      if (methodsResult.success && methodsResult.data) {
        setPaymentMethods(methodsResult.data)
      } else {
        // Check if it's a migration error
        if (methodsResult.error?.includes('relation') || methodsResult.error?.includes('does not exist')) {
          setHasError(true)
          setErrorMessage('Payment methods tables not found. Please apply the database migration first.')
          return
        }
        throw new Error(methodsResult.error)
      }

      // Load order types
      const orderTypesData = await getEnabledOrderTypesByTenantClient(tenantId)
      setOrderTypes(orderTypesData)
    } catch (error) {
      console.error('Error loading payment methods:', error)
      setHasError(true)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load payment methods')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const handleAddNew = () => {
    if (hasError) {
      toast.error('Please apply the database migration first before creating payment methods')
      return
    }
    setSelectedMethod(undefined)
    setFormDialogOpen(true)
  }

  const handleEdit = (method: PaymentMethodWithOrderTypes) => {
    if (hasError) {
      toast.error('Please apply the database migration first before editing payment methods')
      return
    }
    setSelectedMethod(method)
    setFormDialogOpen(true)
  }

  const handleFormSuccess = () => {
    setFormDialogOpen(false)
    loadData()
  }

  const filteredMethods = paymentMethods.filter((method) => {
    if (activeTab === 'all') return true
    if (activeTab === 'active') return method.is_active
    if (activeTab === 'inactive') return !method.is_active
    return true
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </CardContent>
      </Card>
    )
  }

  if (hasError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-4">
          <div className="text-red-500">
            <svg className="h-12 w-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Database Migration Required</h3>
            <p className="text-gray-600 mb-4 max-w-md">{errorMessage}</p>
            <div className="bg-gray-100 p-4 rounded-lg text-left text-sm font-mono text-gray-800 max-w-2xl">
              <p className="font-semibold mb-2">To enable Payment Methods, run this migration:</p>
              <p className="text-xs">supabase/migrations/0012_payment_methods.sql</p>
              <p className="mt-3 text-xs text-gray-600">Or apply it manually in your Supabase SQL Editor</p>
            </div>
          </div>
          <Button onClick={loadData} variant="outline">
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All ({paymentMethods.length})</TabsTrigger>
            <TabsTrigger value="active">
              Active ({paymentMethods.filter((m) => m.is_active).length})
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive ({paymentMethods.filter((m) => !m.is_active).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <Button onClick={handleAddNew} disabled={hasError}>
          <Plus className="h-4 w-4 mr-2" />
          Add Payment Method
        </Button>
      </div>

      {/* Payment Methods List */}
      <PaymentMethodsList
        paymentMethods={filteredMethods}
        orderTypes={orderTypes}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        onEdit={handleEdit}
        onRefresh={loadData}
      />

      {/* Form Dialog - Only show if no error */}
      {!hasError && (
        <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedMethod ? 'Edit Payment Method' : 'Add New Payment Method'}
              </DialogTitle>
            </DialogHeader>
            <PaymentMethodForm
              paymentMethod={selectedMethod}
              orderTypes={orderTypes}
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              onSuccess={handleFormSuccess}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

