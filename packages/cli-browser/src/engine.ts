import type { ConsoleErrorEntry, FailedRequestEntry } from '@orchentra/cli-core'

/**
 * Engine port — the minimal, engine-agnostic surface the session manager drives.
 * The Playwright adapter implements it; tests inject a fake. Keeping this thin is
 * what lets the manager stay browser-free until an engine is actually loaded.
 */

/** Raw accessibility node as an engine reports it, before refs are assigned. */
export interface RawA11yNode {
  role: string
  name?: string
  value?: string
  checked?: boolean | 'mixed'
  disabled?: boolean
  children?: RawA11yNode[]
}

/**
 * How the engine relocates an element to act on it: ARIA role + accessible name
 * + index among duplicates. The manager derives one of these per ref so actions
 * never depend on raw DOM selectors.
 */
export interface LocatorDescriptor {
  role: string
  name?: string
  /** 0-based index among nodes sharing the same role+name. */
  nth: number
}

export interface GotoResult {
  url: string
  status?: number
  title?: string
}

export interface EnginePage {
  goto(url: string, timeoutMs: number): Promise<GotoResult>
  currentUrl(): string
  title(): Promise<string>
  a11ySnapshot(): Promise<RawA11yNode | null>
  click(loc: LocatorDescriptor, timeoutMs: number): Promise<void>
  fill(loc: LocatorDescriptor, text: string, timeoutMs: number): Promise<void>
  selectOption(loc: LocatorDescriptor, value: string, timeoutMs: number): Promise<void>
  /** Focus the target and commit (Enter) — used for `submit` actions. */
  submit(loc: LocatorDescriptor, timeoutMs: number): Promise<void>
  /** Write a PNG to `path`; returns the byte count. */
  screenshot(opts: { fullPage: boolean; path: string }): Promise<number>
  /** Cumulative console errors observed on this page. */
  consoleErrors(): ConsoleErrorEntry[]
  /** Cumulative failed requests observed on this page. */
  failedRequests(): FailedRequestEntry[]
  isClosed(): boolean
  close(): Promise<void>
}

export interface BrowserEngine {
  newPage(): Promise<EnginePage>
  close(): Promise<void>
}

/** Loads a browser engine (default: lazy Playwright). Injectable for tests. */
export type EngineLoader = () => Promise<BrowserEngine>
