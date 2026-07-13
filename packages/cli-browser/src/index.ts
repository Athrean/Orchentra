export type { RawA11yNode, LocatorDescriptor, GotoResult, EnginePage, BrowserEngine, EngineLoader } from './engine'

export type { RefAssignment } from './a11y'
export { assignRefs, renderTree } from './a11y'

export type { PlaywrightEngineOptions } from './playwright-engine'
export { loadPlaywrightEngine } from './playwright-engine'

export type { BrowserSessionManagerOptions } from './session-manager'
export { BrowserSessionManager } from './session-manager'

export type { FakeEngineControls, FakeLoginOptions } from './testing/fake-engine'
export { createFakeLoginEngine } from './testing/fake-engine'
