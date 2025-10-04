import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Database } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Package,
  DollarSign
} from 'lucide-react'

type OrderMapping = Database['public']['Tables']['order_mappings']['Row']
type SyncLog = Database['public']['Tables']['sync_logs']['Row']

interface SyncResult {
  success: boolean
  syncLogId: string
  summary: {
    ordersProcessed: number
    ordersSucceeded: number
    ordersFailed: number
  }
  errors: Array<{ orderId: string; error: string }>
  warnings: string[]
}

export default function OrderSyncDashboard() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [orderMappings, setOrderMappings] = useState<OrderMapping[]>([])
  const [stats, setStats] = useState({
    totalOrders: 0,
    syncedOrders: 0,
    pendingOrders: 0,
    failedOrders: 0,
    totalValue: 0
  })
  
  // Sync parameters
  const [limit, setLimit] = useState(50)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [orderStatus, setOrderStatus] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    await Promise.all([
      loadSyncLogs(),
      loadOrderMappings(),
      loadStats()
    ])
  }

  const loadSyncLogs = async () => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const { data, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('sync_type', 'order_sync')
      .order('started_at', { ascending: false })
      .limit(10)

    if (!error && data) {
      setSyncLogs(data)
    }
  }

  const loadOrderMappings = async () => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const { data, error } = await supabase
      .from('order_mappings')
      .select('*')
      .eq('user_id', user.user.id)
      .order('order_date', { ascending: false })
      .limit(50)

    if (!error && data) {
      setOrderMappings(data)
    }
  }

  const loadStats = async () => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const { data, error } = await supabase
      .from('order_mappings')
      .select('sync_status, total_amount')
      .eq('user_id', user.user.id)

    if (!error && data) {
      const stats = data.reduce((acc, order) => {
        acc.totalOrders++
        if (order.sync_status === 'synced') acc.syncedOrders++
        if (order.sync_status === 'pending') acc.pendingOrders++
        if (order.sync_status === 'failed') acc.failedOrders++
        acc.totalValue += order.total_amount || 0
        return acc
      }, {
        totalOrders: 0,
        syncedOrders: 0,
        pendingOrders: 0,
        failedOrders: 0,
        totalValue: 0
      })

      setStats(stats)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncResult(null)

    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session) {
        throw new Error('Not authenticated')
      }

      const payload: any = { limit }
      if (dateFrom) payload.dateFrom = new Date(dateFrom).toISOString()
      if (dateTo) payload.dateTo = new Date(dateTo).toISOString()
      if (orderStatus.length > 0) payload.orderStatus = orderStatus

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-orders`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Sync failed')
      }

      const result = await response.json()
      setSyncResult(result)
      
      // Reload data
      await loadData()
    } catch (error) {
      console.error('Sync error:', error)
      setSyncResult({
        success: false,
        syncLogId: '',
        summary: { ordersProcessed: 0, ordersSucceeded: 0, ordersFailed: 0 },
        errors: [{ orderId: 'N/A', error: error instanceof Error ? error.message : 'Unknown error' }],
        warnings: []
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'synced':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Synced</Badge>
      case 'pending':
        return <Badge className="bg-yellow-500"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      case 'failed':
        return <Badge className="bg-red-500"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString()
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Order Sync</h1>
          <p className="text-muted-foreground">Synchronize orders from Shopify to NetSuite</p>
        </div>
        <Button onClick={loadData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Synced</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span className="text-2xl font-bold">{stats.syncedOrders}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Clock className="w-4 h-4 text-yellow-500 mr-2" />
              <span className="text-2xl font-bold">{stats.pendingOrders}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <XCircle className="w-4 h-4 text-red-500 mr-2" />
              <span className="text-2xl font-bold">{stats.failedOrders}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <DollarSign className="w-4 h-4 text-blue-500 mr-2" />
              <span className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger Sync</CardTitle>
          <CardDescription>Configure and run a new order synchronization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="limit">Order Limit</Label>
              <Input
                id="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                placeholder="50"
              />
            </div>
            <div>
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <Button 
            onClick={handleSync} 
            disabled={isSyncing}
            className="w-full"
            size="lg"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Start Sync
              </>
            )}
          </Button>

          {syncResult && (
            <Alert className={syncResult.success ? 'border-green-500' : 'border-red-500'}>
              {syncResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <AlertDescription className="ml-2">
                <div className="font-semibold mb-2">
                  {syncResult.success ? 'Sync Completed Successfully' : 'Sync Completed with Errors'}
                </div>
                <div className="text-sm space-y-1">
                  <div>Processed: {syncResult.summary.ordersProcessed}</div>
                  <div className="text-green-600">Succeeded: {syncResult.summary.ordersSucceeded}</div>
                  <div className="text-red-600">Failed: {syncResult.summary.ordersFailed}</div>
                </div>
                {syncResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="font-semibold text-red-600">Errors:</div>
                    {syncResult.errors.map((err, idx) => (
                      <div key={idx} className="text-xs">
                        Order {err.orderId}: {err.error}
                      </div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Data Tables */}
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">Order Mappings</TabsTrigger>
          <TabsTrigger value="logs">Sync History</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Order Mappings</CardTitle>
              <CardDescription>View all mapped orders and their sync status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {orderMappings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No orders synced yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orderMappings.map((order) => (
                      <div 
                        key={order.id} 
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent"
                      >
                        <div className="flex-1">
                          <div className="font-semibold">{order.shopify_order_number}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(order.order_date)}
                          </div>
                        </div>
                        <div className="flex-1 text-center">
                          {getStatusBadge(order.sync_status)}
                        </div>
                        <div className="flex-1 text-right">
                          <div className="font-semibold">{formatCurrency(order.total_amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            {order.netsuite_sales_order_id ? `NS: ${order.netsuite_sales_order_id}` : 'Not synced'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sync History</CardTitle>
              <CardDescription>View past synchronization operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {syncLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No sync history yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {syncLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-semibold">
                            {formatDate(log.started_at)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Duration: {log.duration_seconds ? `${log.duration_seconds}s` : 'N/A'}
                          </div>
                        </div>
                        <div className="flex-1 text-center">
                          {getStatusBadge(log.status)}
                        </div>
                        <div className="flex-1 text-right">
                          <div className="text-sm">
                            <span className="text-green-600">{log.items_succeeded || 0}</span>
                            {' / '}
                            <span className="text-red-600">{log.items_failed || 0}</span>
                            {' / '}
                            <span>{log.items_processed || 0}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            succeeded / failed / total
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
