import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { Spin } from 'antd'
import ProtectedRoute from './components/ProtectedRoute'

// Public pages
import Landing from './pages/Landing'

// Auth pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

// Main app
import Dashboard from './pages/Dashboard'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Spin size="large" tip="Loading..." />
      </div>
    )
  }

  return (
    <Routes>
      {/* Public auth routes - redirect to dashboard if already logged in */}
      <Route
        path="/auth/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/auth/signup"
        element={user ? <Navigate to="/dashboard" replace /> : <Signup />}
      />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<Navigate to="/dashboard" replace />} />

      {/* Protected dashboard route */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Landing page for non-authenticated users */}
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
      
      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
