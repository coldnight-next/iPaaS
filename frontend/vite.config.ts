import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': '{}',
    global: 'globalThis'
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor'
            }
            if (id.includes('@supabase') || id.includes('supabase')) {
              return 'supabase-vendor'
            }
            if (id.includes('dayjs') || id.includes('date-fns')) {
              return 'date-utils'
            }
            if (id.includes('recharts') || id.includes('chart')) {
              return 'charts'
            }
            // Other large libraries
            return 'vendor'
          }

          // Application chunks
          if (id.includes('/src/pages/')) {
            return 'pages'
          }
          if (id.includes('/src/components/')) {
            return 'components'
          }
          if (id.includes('/src/contexts/') || id.includes('/src/hooks/')) {
            return 'app-core'
          }
        },
        // Optimize chunk file names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 800,
    // Enable source maps for production debugging
    sourcemap: true,
    // Minify for better performance
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js', 'socket.io-client', 'recharts']
  }
})
