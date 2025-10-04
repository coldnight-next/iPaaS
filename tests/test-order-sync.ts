/**
 * Test script for Order Sync functionality
 * 
 * This script tests the end-to-end order synchronization from Shopify to NetSuite
 * 
 * Usage:
 *   deno run --allow-net --allow-env tests/test-order-sync.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Load environment variables
const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('VITE_SUPABASE_ANON_KEY')
const TEST_USER_EMAIL = Deno.env.get('TEST_USER_EMAIL')
const TEST_USER_PASSWORD = Deno.env.get('TEST_USER_PASSWORD')

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase configuration')
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file')
  Deno.exit(1)
}

if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
  console.error('❌ Missing test user credentials')
  console.error('Please set TEST_USER_EMAIL and TEST_USER_PASSWORD in your .env file')
  Deno.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  console.log('🧪 Testing Order Sync Functionality\n')

  // Step 1: Authenticate
  console.log('1️⃣ Authenticating...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD
  })

  if (authError || !authData.session) {
    console.error('❌ Authentication failed:', authError?.message)
    Deno.exit(1)
  }

  const accessToken = authData.session.access_token
  console.log('✅ Authenticated successfully\n')

  // Step 2: Check connections
  console.log('2️⃣ Verifying connections...')
  const { data: connections, error: connError } = await supabase
    .from('connections')
    .select('*')
    .eq('user_id', authData.user.id)
    .in('platform', ['shopify', 'netsuite'])

  if (connError) {
    console.error('❌ Error fetching connections:', connError.message)
    Deno.exit(1)
  }

  const shopifyConn = connections?.find(c => c.platform === 'shopify')
  const netsuiteConn = connections?.find(c => c.platform === 'netsuite')

  if (!shopifyConn) {
    console.error('❌ No Shopify connection found. Please connect Shopify first.')
    Deno.exit(1)
  }

  if (!netsuiteConn) {
    console.error('❌ No NetSuite connection found. Please connect NetSuite first.')
    Deno.exit(1)
  }

  console.log(`✅ Shopify connection: ${shopifyConn.status}`)
  console.log(`✅ NetSuite connection: ${netsuiteConn.status}\n`)

  // Step 3: Trigger order sync
  console.log('3️⃣ Triggering order sync...')
  
  const syncPayload = {
    // dateFrom: '2024-01-01T00:00:00Z',  // Optional: filter by date
    // dateTo: '2024-12-31T23:59:59Z',    // Optional: filter by date
    // orderStatus: ['open', 'closed'],    // Optional: filter by status
    limit: 10  // Sync only 10 orders for testing
  }

  const syncResponse = await fetch(`${SUPABASE_URL}/functions/v1/sync-orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(syncPayload)
  })

  if (!syncResponse.ok) {
    const errorData = await syncResponse.json()
    console.error('❌ Order sync failed:', errorData)
    Deno.exit(1)
  }

  const syncResult = await syncResponse.json()
  console.log('✅ Order sync completed\n')

  // Step 4: Display results
  console.log('📊 Sync Results:')
  console.log('─'.repeat(50))
  console.log(`Sync Log ID:       ${syncResult.syncLogId}`)
  console.log(`Orders Processed:  ${syncResult.summary.ordersProcessed}`)
  console.log(`Orders Succeeded:  ${syncResult.summary.ordersSucceeded}`)
  console.log(`Orders Failed:     ${syncResult.summary.ordersFailed}`)
  console.log(`Success:           ${syncResult.success ? '✅ Yes' : '❌ No'}`)
  console.log('─'.repeat(50))

  if (syncResult.errors && syncResult.errors.length > 0) {
    console.log('\n⚠️  Errors:')
    syncResult.errors.forEach((err: any, index: number) => {
      console.log(`  ${index + 1}. Order ${err.orderId}: ${err.error}`)
    })
  }

  if (syncResult.warnings && syncResult.warnings.length > 0) {
    console.log('\n⚠️  Warnings:')
    syncResult.warnings.forEach((warning: string, index: number) => {
      console.log(`  ${index + 1}. ${warning}`)
    })
  }

  // Step 5: Query sync history
  console.log('\n4️⃣ Fetching sync history...')
  const { data: syncLog, error: logError } = await supabase
    .from('sync_logs')
    .select('*')
    .eq('id', syncResult.syncLogId)
    .single()

  if (logError) {
    console.error('❌ Error fetching sync log:', logError.message)
  } else {
    console.log('\n📝 Sync Log Details:')
    console.log(`  Status: ${syncLog.status}`)
    console.log(`  Started: ${new Date(syncLog.started_at).toLocaleString()}`)
    console.log(`  Completed: ${syncLog.completed_at ? new Date(syncLog.completed_at).toLocaleString() : 'N/A'}`)
    console.log(`  Duration: ${syncLog.completed_at ? 
      Math.round((new Date(syncLog.completed_at).getTime() - new Date(syncLog.started_at).getTime()) / 1000) + 's' : 
      'N/A'}`)
  }

  // Step 6: Query order mappings
  console.log('\n5️⃣ Fetching order mappings...')
  const { data: orderMappings, error: mappingError } = await supabase
    .from('order_mappings')
    .select('*')
    .eq('user_id', authData.user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  if (mappingError) {
    console.error('❌ Error fetching order mappings:', mappingError.message)
  } else {
    console.log(`\n📦 Recent Order Mappings (showing ${orderMappings?.length || 0}):\n`)
    orderMappings?.forEach((mapping: any, index: number) => {
      console.log(`  ${index + 1}. Shopify Order #${mapping.shopify_order_number}`)
      console.log(`     Status: ${mapping.sync_status}`)
      console.log(`     Amount: $${mapping.total_amount}`)
      console.log(`     NetSuite Order ID: ${mapping.netsuite_sales_order_id || 'Pending'}`)
      console.log(`     Last Synced: ${mapping.last_synced ? new Date(mapping.last_synced).toLocaleString() : 'Never'}`)
      console.log()
    })
  }

  console.log('✅ Test completed successfully!')
}

// Run the test
main().catch(error => {
  console.error('\n❌ Test failed with error:', error)
  Deno.exit(1)
})
