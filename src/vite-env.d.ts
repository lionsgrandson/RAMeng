/// <reference types="vite/client" />

interface Window {
  ramengDesktop?: {
    openPdfInFoxit?: (url: string, name: string) => Promise<void>
  }
}
