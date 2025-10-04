import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Mock client for development when Supabase is not available
const createMockClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      subscription: { unsubscribe: () => {} },
      data: { subscription: { unsubscribe: () => {} } }
    }),
    signInWithPassword: async () => ({ data: null, error: { message: 'Supabase not configured - using demo mode' } }),
    signUp: async () => ({ data: null, error: { message: 'Supabase not configured - using demo mode' } }),
    signOut: async () => ({ error: null })
  },
  from: () => ({
    select: () => ({
      order: () => ({ limit: () => ({ data: [], error: null }) })
    }),
    insert: () => ({ select: () => ({ data: [], error: null }) }),
    update: () => ({ eq: () => ({ select: () => ({ data: [], error: null }) }) })
  })
})

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : createMockClient() as any // Mock client for development - intentionally typed as any

// Types
export interface Connection {
  id: string
  user_id: string
  platform: 'netsuite' | 'shopify'
  credentials: Record<string, unknown>
  metadata: Record<string, unknown>
  status: string
  last_sync: string | null
  created_at: string
  updated_at: string
}

export interface ItemMapping {
  id: string
  netsuite_item_id: string
  shopify_product_id: string | null
  shopify_variant_id: string | null
  sku: string | null
  sync_status: string
  last_synced: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SyncLog {
  id: string
  sync_type: string
  direction: 'netsuite_to_shopify' | 'shopify_to_netsuite' | 'bidirectional'
  status: string
  items_processed: number
  items_failed: number
  error_details: Record<string, unknown>
  started_at: string
  completed_at: string | null
  created_at: string
}

// Auth helper functions
export const auth = {
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  signUp: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    })
    return { data, error }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  signInWithGoogle: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    return { data, error }
  },

  getUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Database helper functions
export const db = {
  // Connections
  getConnections: async () => {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  },

  createConnection: async (connection: {
    platform: 'netsuite' | 'shopify'
    credentials: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => {
    const { data, error } = await supabase
      .from('connections')
      .insert([connection])
      .select()
    return { data, error }
  },

  updateConnection: async (id: string, updates: Partial<Connection>) => {
    const { data, error } = await supabase
      .from('connections')
      .update(updates)
      .eq('id', id)
      .select()
    return { data, error }
  },

  // Item mappings
  getItemMappings: async () => {
    const { data, error } = await supabase
      .from('item_mappings')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  },

  createItemMapping: async (mapping: {
    netsuite_item_id: string
    shopify_product_id?: string
    shopify_variant_id?: string
    sku?: string
    metadata?: Record<string, unknown>
  }) => {
    const { data, error } = await supabase
      .from('item_mappings')
      .insert([mapping])
      .select()
    return { data, error }
  },

  // Sync logs
  getSyncLogs: async (limit = 50) => {
    const { data, error } = await supabase
      .from('sync_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit)
    return { data, error }
  },

  createSyncLog: async (log: {
    sync_type?: string
    direction: 'netsuite_to_shopify' | 'shopify_to_netsuite' | 'bidirectional'
    status?: string
  }) => {
    const { data, error } = await supabase
      .from('sync_logs')
      .insert([log])
      .select()
    return { data, error }
  },

  updateSyncLog: async (id: string, updates: Partial<SyncLog>) => {
    const { data, error } = await supabase
      .from('sync_logs')
      .update(updates)
      .eq('id', id)
      .select()
    return { data, error }
  }
}