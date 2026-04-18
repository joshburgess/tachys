/**
 * Shared scheduler management.
 *
 * Aeon operations require a Scheduler instance. This module provides
 * a default shared scheduler and a factory for creating new ones.
 */

import type { Scheduler } from "aeon-types"
import { DefaultScheduler } from "aeon-scheduler"

let _shared: Scheduler | null = null

/**
 * Create a new Aeon scheduler, or return the shared default instance.
 *
 * When called with no arguments, returns a shared DefaultScheduler.
 * When called with `{ shared: false }`, creates a fresh instance.
 */
export function createScheduler(opts?: { shared?: boolean }): Scheduler {
  if (opts?.shared === false) {
    return new DefaultScheduler()
  }
  if (_shared === null) {
    _shared = new DefaultScheduler()
  }
  return _shared
}
