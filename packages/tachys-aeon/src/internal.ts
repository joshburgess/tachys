/**
 * Internal utilities for tachys-aeon.
 *
 * Bridges the Aeon type-level branding with runtime access.
 * At runtime, an Aeon Event IS its Source -- the brand is purely
 * a TypeScript-level distinction. This mirrors @most/core's approach.
 */

import type { Disposable, Event, Scheduler, Sink, Source } from "aeon-types"

/**
 * Run an Event by connecting it to a Sink. Returns a Disposable
 * that unsubscribes.
 *
 * At runtime, Event<A, E> IS Source<A, E> (identity cast), so we
 * can call .run() directly. This is the standard Aeon internal pattern.
 */
export function runEvent<A, E>(
  event: Event<A, E>,
  sink: Sink<A, E>,
  scheduler: Scheduler,
): Disposable {
  return (event as unknown as Source<A, E>).run(sink, scheduler)
}
