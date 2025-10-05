import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'

interface WebSocketContextType {
  socket: Socket | null
  isConnected: boolean
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  subscribe: (event: string, callback: (...args: any[]) => void) => void
  unsubscribe: (event: string, callback?: (...args: any[]) => void) => void
  emit: (event: string, data?: any) => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

interface WebSocketProviderProps {
  children: ReactNode
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const { session } = useAuth()
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')

  useEffect(() => {
    if (!session?.access_token) {
      // Disconnect if no session
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setIsConnected(false)
        setConnectionStatus('disconnected')
      }
      return
    }

    // Create socket connection
    const socketUrl = import.meta.env.VITE_SUPABASE_URL?.replace('/v1', '') || 'http://localhost:54321'

    socketRef.current = io(socketUrl, {
      auth: {
        token: session.access_token
      },
      transports: ['websocket', 'polling']
    })

    const socket = socketRef.current

    // Connection events
    socket.on('connect', () => {
      console.log('[WebSocket] Connected')
      setIsConnected(true)
      setConnectionStatus('connected')
    })

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason)
      setIsConnected(false)
      setConnectionStatus('disconnected')
    })

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error)
      setConnectionStatus('error')
    })

    socket.on('reconnect', (attemptNumber) => {
      console.log('[WebSocket] Reconnected after', attemptNumber, 'attempts')
      setIsConnected(true)
      setConnectionStatus('connected')
    })

    socket.on('reconnect_error', (error) => {
      console.error('[WebSocket] Reconnection error:', error)
      setConnectionStatus('error')
    })

    // Connect
    socket.connect()
    setConnectionStatus('connecting')

    // Cleanup on unmount or session change
    return () => {
      if (socket) {
        socket.disconnect()
      }
      socketRef.current = null
      setIsConnected(false)
      setConnectionStatus('disconnected')
    }
  }, [session?.access_token])

  const subscribe = (event: string, callback: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback)
    }
  }

  const unsubscribe = (event: string, callback?: (...args: any[]) => void) => {
    if (socketRef.current) {
      if (callback) {
        socketRef.current.off(event, callback)
      } else {
        socketRef.current.off(event)
      }
    }
  }

  const emit = (event: string, data?: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data)
    }
  }

  const value: WebSocketContextType = {
    socket: socketRef.current,
    isConnected,
    connectionStatus,
    subscribe,
    unsubscribe,
    emit
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}