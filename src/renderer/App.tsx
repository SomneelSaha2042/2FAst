import React, { ReactElement, Suspense, lazy } from 'react'
import { viewFromLocation } from './shared'

const PollView = lazy(() => import('./PollView'))
const SettingsView = lazy(() => import('./SettingsView'))

const App = (): ReactElement => {
  return (
    <Suspense fallback={<div className="w-full h-full bg-background flex items-center justify-center text-outline font-body-sm">Loading...</div>}>
      {viewFromLocation() === 'poll' ? <PollView /> : <SettingsView />}
    </Suspense>
  )
}

export default App