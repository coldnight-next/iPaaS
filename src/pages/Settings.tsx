import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, RotateCcw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'

interface SystemSetting {
  id: string
  setting_key: string
  setting_value: string
  setting_type: 'string' | 'number' | 'boolean' | 'array' | 'json'
  category: string
  description: string
  is_editable: boolean
  default_value: string
  created_at: string
  updated_at: string
}

interface SettingsByCategory {
  [category: string]: SystemSetting[]
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsByCategory>({})
  const [editedValues, setEditedValues] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setError('You must be logged in to view settings')
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-settings`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch settings')
      }

      const data = await response.json()
      setSettings(data.settings || {})
      
      // Initialize edited values with current values
      const initialValues: Record<string, any> = {}
      Object.values(data.settings || {}).flat().forEach((setting: SystemSetting) => {
        initialValues[setting.setting_key] = parseSettingValue(setting.setting_value, setting.setting_type)
      })
      setEditedValues(initialValues)
    } catch (err) {
      console.error('Error fetching settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const parseSettingValue = (value: string, type: string): any => {
    try {
      switch (type) {
        case 'number':
          return Number(value)
        case 'boolean':
          return value === 'true'
        case 'array':
        case 'json':
          return JSON.parse(value)
        default:
          return JSON.parse(value)
      }
    } catch {
      return value
    }
  }

  const handleValueChange = (key: string, value: any) => {
    setEditedValues(prev => ({
      ...prev,
      [key]: value
    }))
    setHasChanges(true)
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('You must be logged in to update settings')
      }

      // Find changed settings
      const updates = []
      for (const [key, value] of Object.entries(editedValues)) {
        const category = key.split('.')[0]
        const originalSetting = Object.values(settings)
          .flat()
          .find((s: SystemSetting) => s.setting_key === key)
        
        if (originalSetting) {
          const originalValue = parseSettingValue(originalSetting.setting_value, originalSetting.setting_type)
          if (JSON.stringify(originalValue) !== JSON.stringify(value)) {
            updates.push({ key, value })
          }
        }
      }

      if (updates.length === 0) {
        toast({
          title: 'No changes',
          description: 'No settings were modified',
        })
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-settings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updates)
        }
      )

      if (!response.ok) {
        throw new Error('Failed to update settings')
      }

      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Settings saved',
          description: `${result.updated} setting(s) updated successfully`,
        })
        setHasChanges(false)
        await fetchSettings()
      } else {
        throw new Error(`Failed to update ${result.failed} setting(s)`)
      }
    } catch (err) {
      console.error('Error saving settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to save settings')
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save settings',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    // Reset edited values to original values
    const resetValues: Record<string, any> = {}
    Object.values(settings).flat().forEach((setting: SystemSetting) => {
      resetValues[setting.setting_key] = parseSettingValue(setting.setting_value, setting.setting_type)
    })
    setEditedValues(resetValues)
    setHasChanges(false)
    toast({
      title: 'Reset',
      description: 'All changes have been discarded',
    })
  }

  const renderSettingInput = (setting: SystemSetting) => {
    const value = editedValues[setting.setting_key]
    const isDisabled = !setting.is_editable

    switch (setting.setting_type) {
      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              id={setting.setting_key}
              checked={value}
              onCheckedChange={(checked) => handleValueChange(setting.setting_key, checked)}
              disabled={isDisabled}
            />
            <Label htmlFor={setting.setting_key} className="text-sm text-muted-foreground">
              {value ? 'Enabled' : 'Disabled'}
            </Label>
          </div>
        )

      case 'number':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => handleValueChange(setting.setting_key, Number(e.target.value))}
            disabled={isDisabled}
            className="max-w-xs"
          />
        )

      case 'array':
      case 'json':
        return (
          <Textarea
            value={JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value)
                handleValueChange(setting.setting_key, parsed)
              } catch {
                // Invalid JSON, don't update
              }
            }}
            disabled={isDisabled}
            rows={5}
            className="font-mono text-sm"
          />
        )

      default: // string
        return (
          <Input
            type={setting.setting_key.toLowerCase().includes('password') ? 'password' : 'text'}
            value={value || ''}
            onChange={(e) => handleValueChange(setting.setting_key, e.target.value)}
            disabled={isDisabled}
            className="max-w-xl"
          />
        )
    }
  }

  const renderCategorySettings = (category: string, categorySettings: SystemSetting[]) => {
    const editableSettings = categorySettings.filter(s => s.is_editable)
    const readOnlySettings = categorySettings.filter(s => !s.is_editable)

    return (
      <div className="space-y-6">
        {editableSettings.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configurable Settings</h3>
            {editableSettings.map(setting => (
              <div key={setting.id} className="space-y-2 p-4 border rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <Label htmlFor={setting.setting_key} className="text-base font-medium">
                      {setting.setting_key.split('.')[1]?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Label>
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  </div>
                </div>
                <div className="mt-2">
                  {renderSettingInput(setting)}
                </div>
              </div>
            ))}
          </div>
        )}

        {readOnlySettings.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-muted-foreground">Read-Only Settings</h3>
            {readOnlySettings.map(setting => (
              <div key={setting.id} className="space-y-2 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <Label className="text-base font-medium text-muted-foreground">
                      {setting.setting_key.split('.')[1]?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Label>
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  </div>
                </div>
                <div className="mt-2">
                  {renderSettingInput(setting)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const categories = Object.keys(settings).sort()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage system configuration and preferences
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || saving}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSaveSettings}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {hasChanges && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Click "Save Changes" to apply them.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={categories[0]} className="space-y-4">
        <TabsList>
          {categories.map(category => (
            <TabsTrigger key={category} value={category} className="capitalize">
              {category}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(category => (
          <TabsContent key={category} value={category}>
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">{category} Settings</CardTitle>
                <CardDescription>
                  Configure {category}-related system settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderCategorySettings(category, settings[category])}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

export default Settings
