'use client'

import { AlertTriangle, Loader2, Play, RotateCw } from 'lucide-react'

interface SetupError {
  step: number
  kind: string
  error: string
}

interface QueryError {
  query: string
  error?: string
}

interface Props {
  loading: boolean
  hasResult: boolean
  durationMs?: number
  passed?: boolean
  /** Optional setup-step errors from the scenario outcome — surfaced here
   *  so a failing run on stage tells the speaker WHAT broke, not just THAT
   *  it broke. */
  setupErrors?: SetupError[]
  queryErrors?: QueryError[]
  onRun(): void
}

export function DemoRunButton({
  loading,
  hasResult,
  durationMs,
  passed,
  setupErrors,
  queryErrors,
  onRun,
}: Props) {
  const hasErrors =
    (setupErrors && setupErrors.length > 0) ||
    (queryErrors && queryErrors.some((q) => !!q.error))
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="inline-flex items-center gap-2 h-12 px-6 rounded-lg bg-[var(--accent)] text-white text-base font-medium disabled:opacity-50 hover:bg-[var(--accent-hover)]"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              running…
            </>
          ) : hasResult ? (
            <>
              <RotateCw className="w-5 h-5" />
              run again
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              run live
            </>
          )}
        </button>
        {hasResult && durationMs != null && (
          <div className="text-sm text-[var(--text-muted)]">
            {(durationMs / 1000).toFixed(1)}s ·{' '}
            <span
              className={
                passed ? 'text-[var(--accent)]' : 'text-[var(--danger)]'
              }
            >
              {passed ? 'verified' : 'failed'}
            </span>
          </div>
        )}
      </div>

      {hasErrors && (
        <div className="border border-[var(--danger)]/40 bg-[var(--danger)]/5 rounded-md p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 text-[var(--danger)]">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wider">
              run errors
            </span>
          </div>
          {setupErrors?.map((e, i) => (
            <div key={`s-${i}`} className="font-mono text-[var(--text-muted)]">
              setup step {e.step} ({e.kind}):{' '}
              <span className="text-[var(--text)]">{e.error}</span>
            </div>
          ))}
          {queryErrors?.map(
            (q, i) =>
              q.error && (
                <div
                  key={`q-${i}`}
                  className="font-mono text-[var(--text-muted)]"
                >
                  query “{q.query}”:{' '}
                  <span className="text-[var(--text)]">{q.error}</span>
                </div>
              ),
          )}
        </div>
      )}
    </div>
  )
}
