/**
 * Token Refresh Utility
 * 
 * Handles automatic OAuth token refresh for NetSuite and Shopify connections
 * when tokens expire (401 errors).
 */

import { createSupabaseClient } from './supabaseClient.ts'
import { encryptJson, decryptJson } from './encryption.ts'

interface RefreshResult {
  success: boolean
  newAccessToken?: string
  error?: string
}

/**
 * Refresh NetSuite OAuth token
 */
export async function refreshNetSuiteToken(
  connectionId: string,
  credentials: any,
  accountId: string
): Promise<RefreshResult> {
  try {
    console.log(`[tokenRefresh] Attempting to refresh NetSuite token for connection ${connectionId}`)
    
    // NetSuite OAuth 2.0 token endpoint
    const tokenUrl = `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${credentials.client_id}:${credentials.client_secret}`)}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[tokenRefresh] NetSuite token refresh failed: ${response.status} - ${errorText}`)
      return {
        success: false,
        error: `Token refresh failed: ${response.status} - ${errorText}`
      }
    }
    
    const tokenData = await response.json()
    
    // Update credentials with new access token
    const updatedCredentials = {
      ...credentials,
      access_token: tokenData.access_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000),
      refreshed_at: new Date().toISOString()
    }
    
    // If a new refresh token was provided, update it too
    if (tokenData.refresh_token) {
      updatedCredentials.refresh_token = tokenData.refresh_token
    }
    
    // Encrypt and save to database
    const encrypted = await encryptJson(updatedCredentials)
    const supabase = createSupabaseClient()
    
    const { error: updateError } = await supabase
      .from('connections')
      .update({
        credentials: { encrypted },
        updated_at: new Date().toISOString()
      })
      .eq('id', connectionId)
    
    if (updateError) {
      console.error(`[tokenRefresh] Failed to save refreshed token: ${updateError.message}`)
      return {
        success: false,
        error: `Failed to save refreshed token: ${updateError.message}`
      }
    }
    
    console.log(`[tokenRefresh] ✅ Successfully refreshed NetSuite token for connection ${connectionId}`)
    
    return {
      success: true,
      newAccessToken: tokenData.access_token
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[tokenRefresh] Exception refreshing NetSuite token: ${errorMsg}`)
    return {
      success: false,
      error: errorMsg
    }
  }
}

/**
 * Refresh Shopify OAuth token
 */
export async function refreshShopifyToken(
  connectionId: string,
  credentials: any,
  shopDomain: string
): Promise<RefreshResult> {
  try {
    console.log(`[tokenRefresh] Attempting to refresh Shopify token for connection ${connectionId}`)
    
    // Note: Shopify access tokens don't expire, but if they do in the future:
    // This is a placeholder for future implementation
    
    console.warn(`[tokenRefresh] Shopify tokens typically don't expire. If you're getting 401, check permissions.`)
    
    return {
      success: false,
      error: 'Shopify tokens do not need refresh - they are permanent unless revoked'
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[tokenRefresh] Exception refreshing Shopify token: ${errorMsg}`)
    return {
      success: false,
      error: errorMsg
    }
  }
}

/**
 * Detect if error is token expiration and attempt refresh
 */
export async function handleAuthError(
  error: any,
  connectionId: string,
  platform: 'netsuite' | 'shopify',
  retryCallback: (newToken: string) => Promise<any>
): Promise<any> {
  // Check if error is 401 Unauthorized
  const is401 = 
    error?.status === 401 || 
    error?.message?.includes('401') ||
    error?.message?.includes('Unauthorized') ||
    error?.message?.includes('INVALID_LOGIN')
  
  if (!is401) {
    throw error // Not an auth error, rethrow
  }
  
  console.log(`[tokenRefresh] 401 error detected for ${platform} connection ${connectionId}. Attempting token refresh...`)
  
  // Get connection from database
  const supabase = createSupabaseClient()
  const { data: connection, error: fetchError } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .single()
  
  if (fetchError || !connection) {
    console.error(`[tokenRefresh] Could not fetch connection: ${fetchError?.message}`)
    throw new Error('Connection not found')
  }
  
  // Decrypt credentials
  const credentials = await decryptJson(connection.credentials.encrypted)
  
  // Attempt refresh based on platform
  let refreshResult: RefreshResult
  
  if (platform === 'netsuite') {
    const accountId = connection.metadata?.account_id
    if (!accountId) {
      throw new Error('NetSuite account ID not found in connection metadata')
    }
    refreshResult = await refreshNetSuiteToken(connectionId, credentials, accountId)
  } else {
    const shopDomain = connection.metadata?.shop_domain
    if (!shopDomain) {
      throw new Error('Shopify shop domain not found in connection metadata')
    }
    refreshResult = await refreshShopifyToken(connectionId, credentials, shopDomain)
  }
  
  if (!refreshResult.success) {
    throw new Error(`Token refresh failed: ${refreshResult.error}`)
  }
  
  // Retry the original request with new token
  console.log(`[tokenRefresh] Token refreshed successfully. Retrying original request...`)
  return await retryCallback(refreshResult.newAccessToken!)
}

/**
 * Check if token is about to expire and refresh proactively
 */
export async function proactiveTokenRefresh(connectionId: string, credentials: any): Promise<string> {
  const expiresAt = credentials.expires_at
  
  if (!expiresAt) {
    return credentials.access_token // No expiry info, return current token
  }
  
  const now = Date.now()
  const timeUntilExpiry = expiresAt - now
  const fiveMinutes = 5 * 60 * 1000
  
  // If token expires in less than 5 minutes, refresh it
  if (timeUntilExpiry < fiveMinutes) {
    console.log(`[tokenRefresh] Token expires soon (${Math.floor(timeUntilExpiry / 1000)}s). Refreshing proactively...`)
    
    const supabase = createSupabaseClient()
    const { data: connection } = await supabase
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .single()
    
    if (connection) {
      const platform = connection.platform as 'netsuite' | 'shopify'
      const accountId = connection.metadata?.account_id
      const shopDomain = connection.metadata?.shop_domain
      
      if (platform === 'netsuite' && accountId) {
        const result = await refreshNetSuiteToken(connectionId, credentials, accountId)
        if (result.success && result.newAccessToken) {
          return result.newAccessToken
        }
      }
    }
  }
  
  return credentials.access_token
}
