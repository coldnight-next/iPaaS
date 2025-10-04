import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Database } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Clock, Plus, Play, Pause, Trash2, Edit, Calendar } from 'lucide-react'

type SyncSchedule = Database['public']['Tables']['sync_schedules']['Row']

const CRON_PRESETS = [
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 2 hours', value: '0 */2 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 6 AM', value: '0 6 * * *' },
  { label: 'Daily at noon', value: '0 12 * * *' },
  { label: 'Daily at 6 PM', value: '0 18 * * *' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
  { label: 'Weekly (Monday)', value: '0 0 * * 1' },
  { label: 'Monthly', value: '0 0 1 * *' },
]

const SYNC_TYPES = [
  { value: 'order_sync', label: 'Order Sync', description: 'Sync orders from Shopify to NetSuite' },
  { value: 'inventory_sync', label: 'Inventory Sync', description: 'Sync inventory from NetSuite to Shopify' },
  { value: 'fulfillment_sync', label: 'Fulfillment Sync', description: 'Sync fulfillments bidirectionally' },
  { value: 'product_sync', label: 'Product Sync', description: 'Sync products between platforms' },
]

export default function ScheduledSyncManager() {
  const [schedules, setSchedules] = useState<SyncSchedule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<SyncSchedule | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scheduleType, setScheduleType] = useState('cron')
  const [cronExpression, setCronExpression] = useState('0 * * * *')
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [syncType, setSyncType] = useState('order_sync')
  const [syncDirection, setSyncDirection] = useState('shopify_to_netsuite')
  const [isActive, setIsActive] = useState(true)
  const [targetFilters, setTargetFilters] = useState('{}')

  useEffect(() => {
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
    setIsLoading(true)
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const { data, error } = await supabase
      .from('sync_schedules')
      .select('*')
      .eq('user_id', user.user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setSchedules(data)
    }
    setIsLoading(false)
  }

  const handleCreateOrUpdate = async () => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const scheduleData: any = {
      user_id: user.user.id,
      name,
      description,
      schedule_type: scheduleType,
      cron_expression: scheduleType === 'cron' ? cronExpression : null,
      interval_minutes: scheduleType === 'interval' ? intervalMinutes : null,
      sync_direction: syncDirection,
      is_active: isActive,
      target_filters: targetFilters ? JSON.parse(targetFilters) : null,
    }

    if (editingSchedule) {
      const { error } = await supabase
        .from('sync_schedules')
        .update(scheduleData)
        .eq('id', editingSchedule.id)

      if (!error) {
        await loadSchedules()
        resetForm()
      }
    } else {
      const { error } = await supabase
        .from('sync_schedules')
        .insert(scheduleData)

      if (!error) {
        await loadSchedules()
        resetForm()
      }
    }
  }

  const handleEdit = (schedule: SyncSchedule) => {
    setEditingSchedule(schedule)
    setName(schedule.name)
    setDescription(schedule.description || '')
    setScheduleType(schedule.schedule_type || 'cron')
    setCronExpression(schedule.cron_expression || '0 * * * *')
    setIntervalMinutes(schedule.interval_minutes || 60)
    setSyncDirection(schedule.sync_direction || 'shopify_to_netsuite')
    setIsActive(schedule.is_active || false)
    setTargetFilters(JSON.stringify(schedule.target_filters || {}, null, 2))
    setIsDialogOpen(true)
  }

  const handleToggleActive = async (schedule: SyncSchedule) => {
    const { error } = await supabase
      .from('sync_schedules')
      .update({ is_active: !schedule.is_active })
      .eq('id', schedule.id)

    if (!error) {
      await loadSchedules()
    }
  }

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return

    const { error } = await supabase
      .from('sync_schedules')
      .delete()
      .eq('id', scheduleId)

    if (!error) {
      await loadSchedules()
    }
  }

  const resetForm = () => {
    setEditingSchedule(null)
    setName('')
    setDescription('')
    setScheduleType('cron')
    setCronExpression('0 * * * *')
    setIntervalMinutes(60)
    setSyncType('order_sync')
    setSyncDirection('shopify_to_netsuite')
    setIsActive(true)
    setTargetFilters('{}')
    setIsDialogOpen(false)
  }

  const parseCronDescription = (cron: string): string => {
    const preset = CRON_PRESETS.find(p => p.value === cron)
    return preset?.label || cron
  }

  const formatNextRun = (nextRun: string | null): string => {
    if (!nextRun) return 'Not scheduled'
    const date = new Date(nextRun)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 24) {
      return `in ${Math.floor(hours / 24)} days`
    } else if (hours > 0) {
      return `in ${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `in ${minutes}m`
    } else {
      return 'Soon'
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Scheduled Syncs</h1>
          <p className="text-muted-foreground">
            Automate your data synchronization with scheduled jobs
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="w-4 h-4 mr-2" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingSchedule ? 'Edit Schedule' : 'Create New Schedule'}
              </DialogTitle>
              <DialogDescription>
                Set up automated synchronization between your platforms
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Basic Info */}
              <div>
                <Label htmlFor="name">Schedule Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Hourly Order Sync"
                />
              </div>

              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this schedule do?"
                  rows={2}
                />
              </div>

              {/* Sync Type */}
              <div>
                <Label htmlFor="syncType">Sync Type</Label>
                <Select value={syncType} onValueChange={setSyncType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNC_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div>
                          <div className="font-medium">{type.label}</div>
                          <div className="text-xs text-muted-foreground">{type.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Direction */}
              <div>
                <Label htmlFor="direction">Direction</Label>
                <Select value={syncDirection} onValueChange={setSyncDirection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shopify_to_netsuite">Shopify → NetSuite</SelectItem>
                    <SelectItem value="netsuite_to_shopify">NetSuite → Shopify</SelectItem>
                    <SelectItem value="bidirectional">Bidirectional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Schedule Type */}
              <div>
                <Label>Schedule Type</Label>
                <div className="flex gap-4 mt-2">
                  <Button
                    type="button"
                    variant={scheduleType === 'cron' ? 'default' : 'outline'}
                    onClick={() => setScheduleType('cron')}
                    className="flex-1"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Cron Expression
                  </Button>
                  <Button
                    type="button"
                    variant={scheduleType === 'interval' ? 'default' : 'outline'}
                    onClick={() => setScheduleType('interval')}
                    className="flex-1"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Fixed Interval
                  </Button>
                </div>
              </div>

              {/* Cron Expression */}
              {scheduleType === 'cron' && (
                <div className="space-y-2">
                  <Label htmlFor="cron">Cron Expression</Label>
                  <Select value={cronExpression} onValueChange={setCronExpression}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRON_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label} ({preset.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="cron"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="0 * * * *"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: minute hour day month weekday
                  </p>
                </div>
              )}

              {/* Interval */}
              {scheduleType === 'interval' && (
                <div>
                  <Label htmlFor="interval">Interval (minutes)</Label>
                  <Input
                    id="interval"
                    type="number"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(parseInt(e.target.value))}
                    min={5}
                    max={10080}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Run every {intervalMinutes} minutes
                  </p>
                </div>
              )}

              {/* Filters */}
              <div>
                <Label htmlFor="filters">Target Filters (JSON, optional)</Label>
                <Textarea
                  id="filters"
                  value={targetFilters}
                  onChange={(e) => setTargetFilters(e.target.value)}
                  placeholder='{"limit": 50, "dateFrom": "2024-01-01"}'
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="active">Schedule Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable or disable this scheduled sync
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button onClick={handleCreateOrUpdate}>
                {editingSchedule ? 'Update' : 'Create'} Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Schedules List */}
      <div className="grid gap-4">
        {schedules.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No scheduled syncs yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first scheduled sync to automate your data synchronization
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Schedule
              </Button>
            </CardContent>
          </Card>
        ) : (
          schedules.map((schedule) => (
            <Card key={schedule.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{schedule.name}</CardTitle>
                      <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                        {schedule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <CardDescription>{schedule.description}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(schedule)}
                      title={schedule.is_active ? 'Pause' : 'Resume'}
                    >
                      {schedule.is_active ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(schedule)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(schedule.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Schedule</p>
                    <p className="font-medium">
                      {schedule.schedule_type === 'cron'
                        ? parseCronDescription(schedule.cron_expression || '')
                        : `Every ${schedule.interval_minutes} min`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Direction</p>
                    <p className="font-medium">{schedule.sync_direction}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Run</p>
                    <p className="font-medium">
                      {schedule.last_run
                        ? new Date(schedule.last_run).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Next Run</p>
                    <p className="font-medium">{formatNextRun(schedule.next_run)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
