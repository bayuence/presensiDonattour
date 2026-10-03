import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        clientsClaim: true,
        skipWaiting: true
      },
      includeAssets: ['favicon.svg', 'logoDONATTOUR.PNG'],
      manifest: {
        name: 'HadirDonattour',
        short_name: 'HadirDonattour',
        description: 'Aplikasi Manajemen Kehadiran Karyawan Donattour',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'logoDONATTOUR.PNG',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'logoDONATTOUR.PNG',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
})
