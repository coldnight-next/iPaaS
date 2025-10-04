/**
 * OAuth Error Handling Utilities
 * Provides user-friendly error messages and troubleshooting tips
 */

export interface OAuthError {
  code: string;
  message: string;
  userMessage: string;
  troubleshooting: string[];
  recoverable: boolean;
}

// Common OAuth error codes and their user-friendly messages
const ERROR_MESSAGES: Record<string, OAuthError> = {
  // NetSuite specific errors
  'netsuite_account_invalid': {
    code: 'netsuite_account_invalid',
    message: 'Invalid NetSuite Account ID',
    userMessage: 'The NetSuite Account ID you entered appears to be invalid.',
    troubleshooting: [
      'Check your NetSuite URL in your browser',
      'The Account ID should be the number or code before ".app.netsuite.com"',
      'Example: In "1234567.app.netsuite.com", the Account ID is "1234567"',
      'Make sure you\'re using your production or sandbox account ID correctly'
    ],
    recoverable: true
  },
  
  'netsuite_credentials_invalid': {
    code: 'netsuite_credentials_invalid',
    message: 'Invalid NetSuite credentials',
    userMessage: 'The NetSuite credentials provided are invalid or have expired.',
    troubleshooting: [
      'Verify your NetSuite login credentials are correct',
      'Check if your NetSuite account has the necessary permissions',
      'Ensure OAuth 2.0 is enabled for your NetSuite integration',
      'Contact your NetSuite administrator for access verification'
    ],
    recoverable: true
  },
  
  'netsuite_oauth_disabled': {
    code: 'netsuite_oauth_disabled',
    message: 'OAuth not enabled in NetSuite',
    userMessage: 'OAuth 2.0 authorization is not enabled for your NetSuite account.',
    troubleshooting: [
      'Go to Setup → Company → Enable Features in NetSuite',
      'Under SuiteCloud tab, enable "OAuth 2.0"',
      'Save the changes and try again',
      'Contact your NetSuite administrator if you don\'t have permission'
    ],
    recoverable: true
  },

  // General OAuth errors
  'access_denied': {
    code: 'access_denied',
    message: 'Authorization was denied',
    userMessage: 'You declined the authorization request.',
    troubleshooting: [
      'Click "Connect" again and authorize the application',
      'Make sure to click "Allow" or "Authorize" in the OAuth dialog',
      'Check if you have the necessary permissions in your account'
    ],
    recoverable: true
  },
  
  'invalid_state': {
    code: 'invalid_state',
    message: 'Invalid OAuth state',
    userMessage: 'The authorization request is invalid or has expired.',
    troubleshooting: [
      'This usually happens if you waited too long to authorize',
      'Start the connection process again',
      'Make sure cookies are enabled in your browser',
      'Try using an incognito/private window if the issue persists'
    ],
    recoverable: true
  },
  
  'token_exchange_failed': {
    code: 'token_exchange_failed',
    message: 'Failed to exchange authorization code',
    userMessage: 'We couldn\'t complete the authorization with the platform.',
    troubleshooting: [
      'This is usually a temporary issue',
      'Wait a few moments and try again',
      'Check if the platform\'s service is experiencing issues',
      'Verify your OAuth application credentials are configured correctly'
    ],
    recoverable: true
  },
  
  'missing_configuration': {
    code: 'missing_configuration',
    message: 'OAuth not configured',
    userMessage: 'OAuth is not properly configured on the server.',
    troubleshooting: [
      'Contact your system administrator',
      'The server may be missing OAuth client credentials',
      'Check server environment variables are set correctly'
    ],
    recoverable: false
  },
  
  'network_error': {
    code: 'network_error',
    message: 'Network connection failed',
    userMessage: 'Unable to connect to the authorization server.',
    troubleshooting: [
      'Check your internet connection',
      'Try again in a few moments',
      'Check if you\'re behind a firewall or proxy',
      'Verify the platform\'s services are available'
    ],
    recoverable: true
  },
  
  'session_expired': {
    code: 'session_expired',
    message: 'Your session has expired',
    userMessage: 'Your login session has expired.',
    troubleshooting: [
      'Please log in again',
      'Then retry the connection process'
    ],
    recoverable: true
  },
  
  'unknown_error': {
    code: 'unknown_error',
    message: 'An unexpected error occurred',
    userMessage: 'Something went wrong during authorization.',
    troubleshooting: [
      'Try the connection process again',
      'Clear your browser cache and cookies',
      'Try using a different browser',
      'Contact support if the problem persists'
    ],
    recoverable: true
  }
};

/**
 * Parse and format an OAuth error for display to users
 */
export function parseOAuthError(error: any): OAuthError {
  // If it's already an OAuthError, return it
  if (error && typeof error === 'object' && 'code' in error && 'userMessage' in error) {
    return error as OAuthError;
  }

  // Extract error code from various error formats
  let errorCode = 'unknown_error';
  
  if (typeof error === 'string') {
    errorCode = error;
  } else if (error?.error) {
    errorCode = error.error;
  } else if (error?.code) {
    errorCode = error.code;
  } else if (error?.message) {
    // Try to extract error code from message
    const matches = error.message.match(/error[:\s]+([a-z_]+)/i);
    if (matches) {
      errorCode = matches[1];
    }
  }

  // Look up the error message
  const errorInfo = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES['unknown_error'];

  // If we have additional context from the original error, add it
  if (error?.message && !errorInfo.troubleshooting.includes(error.message)) {
    return {
      ...errorInfo,
      troubleshooting: [
        `Error details: ${error.message}`,
        ...errorInfo.troubleshooting
      ]
    };
  }

  return errorInfo;
}

/**
 * Get URL query parameters (useful for OAuth callback)
 */
export function getOAuthCallbackParams(): {
  status?: string;
  platform?: string;
  message?: string;
  error?: string;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    status: params.get('status') || undefined,
    platform: params.get('platform') || undefined,
    message: params.get('message') || undefined,
    error: params.get('error') || undefined
  };
}

/**
 * Clear OAuth callback parameters from URL without page reload
 */
export function clearOAuthCallbackParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('status');
  url.searchParams.delete('platform');
  url.searchParams.delete('message');
  url.searchParams.delete('error');
  window.history.replaceState({}, document.title, url.toString());
}

/**
 * Check if current page is an OAuth callback
 */
export function isOAuthCallback(): boolean {
  const params = getOAuthCallbackParams();
  return !!(params.status || params.error);
}

/**
 * Get suggested actions for an error
 */
export function getSuggestedActions(error: OAuthError): Array<{
  label: string;
  action: 'retry' | 'contact_support' | 'check_docs' | 'login';
}> {
  const actions: Array<{ label: string; action: 'retry' | 'contact_support' | 'check_docs' | 'login' }> = [];

  if (error.recoverable) {
    actions.push({
      label: 'Try Again',
      action: 'retry'
    });
  }

  if (error.code === 'session_expired') {
    actions.push({
      label: 'Log In',
      action: 'login'
    });
  }

  if (error.code === 'missing_configuration') {
    actions.push({
      label: 'Contact Support',
      action: 'contact_support'
    });
  }

  actions.push({
    label: 'View Documentation',
    action: 'check_docs'
  });

  return actions;
}

export default {
  parseOAuthError,
  getOAuthCallbackParams,
  clearOAuthCallbackParams,
  isOAuthCallback,
  getSuggestedActions
};
