# NetSuite OAuth Connection Guide

## 🎯 Overview

The improved NetSuite OAuth flow provides a user-friendly, step-by-step wizard that guides users through connecting their NetSuite account to the iPaaS application.

## ✨ Features

### 1. **Step-by-Step Wizard**
- Clear instructions for each step
- Visual progress indicator
- Account ID validation
- Review screen before authorization

### 2. **Enhanced Status Indicators**
- Real-time connection status badges
- Color-coded states (connected, disconnected, authorizing, error)
- Last sync timestamp display
- Tooltips with detailed information

### 3. **Improved Error Handling**
- User-friendly error messages
- Specific troubleshooting steps for common issues
- Automatic retry mechanisms
- Contextual help based on error type

### 4. **Seamless User Experience**
- Modal-based workflow
- Non-blocking UI during authorization
- Automatic redirect handling
- Clean URL management (no leftover query parameters)

## 📦 Components

### `NetSuiteOAuthWizard`
Main wizard component that handles the complete OAuth flow.

```tsx
import { NetSuiteOAuthWizard } from './components/NetSuiteOAuthWizard';

function MyComponent() {
  const [wizardOpen, setWizardOpen] = useState(false);
  
  return (
    <>
      <Button onClick={() => setWizardOpen(true)}>
        Connect NetSuite
      </Button>
      
      <NetSuiteOAuthWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => {
          // Handle successful connection
          console.log('NetSuite connected!');
        }}
      />
    </>
  );
}
```

### `ConnectionStatusBadge`
Displays the current connection status with visual indicators.

```tsx
import { ConnectionStatusBadge } from './components/ConnectionStatusBadge';

<ConnectionStatusBadge 
  status="connected" 
  lastSync="2025-10-03T12:00:00Z"
  size="default"
  showText={true}
/>
```

**Available Statuses:**
- `connected` - Successfully connected and ready
- `disconnected` - Not connected
- `authorizing` - OAuth in progress
- `error` - Connection failed
- `expired` - Credentials expired
- `syncing` - Currently syncing data

### OAuth Error Handler
Utilities for parsing and displaying user-friendly error messages.

```tsx
import { parseOAuthError, isOAuthCallback } from './utils/oauthErrors';

// Check if page loaded from OAuth callback
if (isOAuthCallback()) {
  const params = getOAuthCallbackParams();
  
  if (params.error) {
    const error = parseOAuthError(params.error);
    console.log(error.userMessage);
    console.log(error.troubleshooting);
  }
}
```

## 🔧 Integration Guide

### Step 1: Add the Wizard to Your Connection Page

```tsx
import React, { useState, useEffect } from 'react';
import { Button, Card, Space } from 'antd';
import { NetSuiteOAuthWizard } from '../components/NetSuiteOAuthWizard';
import { ConnectionStatusBadge } from '../components/ConnectionStatusBadge';
import { supabase } from '../lib/supabase';

export function ConnectionsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [netsuiteConnection, setNetsuiteConnection] = useState(null);

  // Load connection status
  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .eq('platform', 'netsuite')
      .maybeSingle();
    
    if (!error && data) {
      setNetsuiteConnection(data);
    }
  };

  return (
    <div>
      <Card title="NetSuite Connection">
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {netsuiteConnection ? (
            <>
              <ConnectionStatusBadge 
                status={netsuiteConnection.status}
                lastSync={netsuiteConnection.last_sync}
              />
              <Button onClick={() => setWizardOpen(true)}>
                Reconnect
              </Button>
            </>
          ) : (
            <Button 
              type="primary" 
              onClick={() => setWizardOpen(true)}
            >
              Connect NetSuite
            </Button>
          )}
        </Space>
      </Card>

      <NetSuiteOAuthWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => {
          setWizardOpen(false);
          loadConnections();
        }}
      />
    </div>
  );
}
```

### Step 2: Handle OAuth Callbacks

The wizard automatically handles OAuth callbacks, but you can add custom logic:

```tsx
import { useEffect } from 'react';
import { 
  isOAuthCallback, 
  getOAuthCallbackParams,
  clearOAuthCallbackParams 
} from '../utils/oauthErrors';
import { message } from 'antd';

function App() {
  useEffect(() => {
    // Check if we're returning from OAuth
    if (isOAuthCallback()) {
      const params = getOAuthCallbackParams();
      
      if (params.status === 'success') {
        message.success(`${params.platform} connected successfully!`);
      } else if (params.error) {
        message.error(params.message || 'Connection failed');
      }
      
      // Clean up URL
      clearOAuthCallbackParams();
    }
  }, []);

  return <YourApp />;
}
```

## 🎨 Customization

### Custom Wizard Styling

```tsx
<NetSuiteOAuthWizard
  open={open}
  onClose={onClose}
  onSuccess={onSuccess}
  // Customize styles via Modal props
  style={{ top: 20 }}
  width={800}
/>
```

### Custom Status Badge

```tsx
<ConnectionStatusBadge 
  status="connected"
  size="large"  // 'small' | 'default' | 'large'
  showText={true}  // Show/hide text label
  lastSync={lastSyncDate}
/>
```

### Custom Error Messages

Extend the error handler for application-specific errors:

```tsx
// In oauthErrors.ts
export const CUSTOM_ERRORS = {
  'my_custom_error': {
    code: 'my_custom_error',
    message: 'Custom error',
    userMessage: 'A custom error occurred',
    troubleshooting: ['Step 1', 'Step 2'],
    recoverable: true
  }
};
```

## 🔐 Security Considerations

1. **Session Management**: The wizard checks for active user session before initiating OAuth
2. **State Validation**: OAuth state tokens are validated on callback
3. **Credential Encryption**: All OAuth tokens are encrypted before storage
4. **HTTPS Only**: OAuth flows require HTTPS in production

## 🧪 Testing the Flow

### Test Locally

1. Start your dev server:
   ```bash
   cd frontend
   npm run dev
   ```

2. Navigate to the connections page

3. Click "Connect NetSuite"

4. Enter a test Account ID (e.g., "TSTDRV1234567")

5. The wizard will guide you through the OAuth flow

### Common Test Scenarios

**Success Flow:**
1. Enter valid Account ID
2. Click "Continue"
3. Review information
4. Click "Connect to NetSuite"
5. Authorize in NetSuite
6. Redirected back with success message

**Error Scenarios:**
- Invalid Account ID format
- Session expired
- OAuth denied by user
- Network errors
- Missing server configuration

## 🐛 Troubleshooting

### Wizard doesn't open
- Check that the modal `open` prop is set to `true`
- Verify Ant Design is properly installed

### OAuth fails immediately
- Check environment variables (VITE_SUPABASE_URL, VITE_FUNCTIONS_BASE_URL)
- Verify user is logged in (check session)
- Check browser console for errors

### Callback doesn't work
- Verify redirect URI is configured in NetSuite OAuth app
- Check that the callback URL matches: `https://your-domain.com/functions/v1/oauth-callback`
- Ensure CORS is properly configured

### Connection shows as "error"
- Check server logs for detailed error messages
- Verify NetSuite OAuth credentials are correct
- Ensure OAuth 2.0 is enabled in NetSuite

## 📚 Related Documentation

- [NetSuite OAuth 2.0 Guide](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_158074210788.html)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Ant Design Components](https://ant.design/components/overview/)

## 🎉 What's New

### Version 2.0 Improvements

- ✅ Step-by-step wizard with progress indicators
- ✅ Enhanced visual feedback throughout the flow
- ✅ Comprehensive error handling with specific troubleshooting
- ✅ Automatic state management and cleanup
- ✅ Better mobile responsiveness
- ✅ Accessibility improvements (ARIA labels, keyboard navigation)
- ✅ TypeScript support with full type safety

### Previous Limitations (Fixed)

- ❌ No visual guidance during OAuth flow
- ❌ Generic error messages
- ❌ Manual URL cleanup required
- ❌ No progress indication
- ❌ Poor mobile experience

## 💡 Best Practices

1. **Always check session before OAuth**: Ensure user is authenticated
2. **Handle all error states**: Use the error parser for consistent messaging
3. **Clear callbacks after processing**: Use `clearOAuthCallbackParams()`
4. **Provide feedback**: Use status badges to show connection state
5. **Test error scenarios**: Ensure all error paths are handled gracefully
6. **Log errors server-side**: Keep detailed logs for troubleshooting

## 🚀 Next Steps

- [ ] Add similar wizard for Shopify connections
- [ ] Implement connection health monitoring
- [ ] Add automatic token refresh before expiry
- [ ] Create admin dashboard for connection management
- [ ] Add webhook configuration wizard
