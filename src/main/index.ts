import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import './ipc/index.js'
import { loadGoogleOAuthConfig } from './oauth/google-config.js'

const currentDir = dirname(fileURLToPath(import.meta.url))

const createMainWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(currentDir, '../preload/index.js'),
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'))
  }
}

app.whenReady().then(() => {
  process.on('uncaughtException', (error: Error) => {
    // Safety net to avoid main-process crash on unexpected exceptions.
    console.error('Uncaught exception in main process:', error.message)
  })

  void loadGoogleOAuthConfig().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown Google config error'
    console.error('Failed to validate Google OAuth config at startup:', message)
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
