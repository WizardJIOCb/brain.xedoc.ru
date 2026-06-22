'use client'

import { useEffect, useState } from 'react'
import { Lock, RefreshCw, AlertTriangle, Cpu } from 'lucide-react'

interface LeaderLease {
  name: string
  leaderId: string
  leaseUntil: string
  heartbeatAt: string
  acquiredAt: string
  expired: boolean
  expiresInSeconds: number
}

interface ActiveClaim {
  runId: string
  jobType: string
  companyId: string
  claimedBy: string
  claimedAt: string
  leaseUntil: string
  heartbeatAt: string
  attempts: number
  leaseExpired: boolean
  leaseExpiresInSeconds: number
  lastHeartbeatSecondsAgo: number
}

interface LeasesResponse {
  generatedAt: string
  podIdentity: string
  workerLoop: {
    leader: boolean
    registeredTypes: string[]
  }
  leaderLeases: LeaderLease[]
  activeClaims: ActiveClaim[]
  error?: string
}

export function LeasesPanel() {
  const [data, setData] = useState<LeasesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [auto, setAuto] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/proxy/v1/admin/leases', {
        cache: 'no-store',
      })
      const json = (await res.json()) as LeasesResponse
      if (!res.ok) throw new Error(json.error ?? `Failed ${res.status}`)
      setData(json)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!auto) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [auto])

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-[var(--text)] flex items-center gap-2">
            <Lock className="w-4 h-4 text-[var(--accent)]" /> Leases & claims
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Leader-election + active job_run claims across the fleet. Use
            this to spot stuck workers, dead leases that haven&apos;t been
            re-acquired, or pods holding more than their share.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            refresh
          </button>
          <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            auto 5s
          </label>
        </div>
      </header>

      {error && (
        <div className="text-xs text-[var(--danger)] font-mono">{error}</div>
      )}

      {data && <PodIdentityCard data={data} />}

      <Section
        title="Leader leases"
        subtitle="Named locks in leader_lease (system DB). Multi-pod deploys elect one holder per name."
      >
        {data && (
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-overlay)] text-[var(--text-faint)] text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-1.5">name</th>
                <th className="text-left px-3 py-1.5">leader</th>
                <th className="text-left px-3 py-1.5">acquired</th>
                <th className="text-right px-3 py-1.5">expires in</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderLeases.map((row) => (
                <LeaderLeaseRow key={row.name} row={row} />
              ))}
              {data.leaderLeases.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-[var(--text-muted)] italic"
                  >
                    No leases held. Either the system is fresh or every
                    cron has released its lease cleanly.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="Active claims"
        subtitle="job_run rows currently in 'running' status. Stale heartbeats are reaped by LeaseManagerService."
      >
        {data && (
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-overlay)] text-[var(--text-faint)] text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-1.5">runId</th>
                <th className="text-left px-3 py-1.5">jobType</th>
                <th className="text-left px-3 py-1.5">tenant</th>
                <th className="text-left px-3 py-1.5">worker</th>
                <th className="text-right px-3 py-1.5">attempts</th>
                <th className="text-right px-3 py-1.5">heartbeat</th>
                <th className="text-right px-3 py-1.5">lease in</th>
              </tr>
            </thead>
            <tbody>
              {data.activeClaims.map((row) => (
                <ActiveClaimRow key={row.runId} row={row} />
              ))}
              {data.activeClaims.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-[var(--text-muted)] italic"
                  >
                    No active claims. The queue is empty or every worker
                    just finished a cycle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function PodIdentityCard({ data }: { data: LeasesResponse }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3 bg-[var(--bg-overlay)]/40 flex items-center gap-4 flex-wrap text-xs">
      <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <Cpu className="w-3 h-3 text-[var(--accent)]" />
        <span className="font-mono text-[var(--text)]">{data.podIdentity}</span>
      </span>
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
          data.workerLoop.leader
            ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
            : 'bg-[var(--bg-overlay)] text-[var(--text-faint)]'
        }`}
      >
        {data.workerLoop.leader ? 'worker_loop leader' : 'follower'}
      </span>
      <span className="text-[var(--text-muted)]">
        handlers:{' '}
        <span className="font-mono text-[var(--text)]">
          {data.workerLoop.registeredTypes.join(', ') || 'none'}
        </span>
      </span>
      <span className="ml-auto text-[var(--text-faint)] text-[10px] font-mono">
        {new Date(data.generatedAt).toLocaleTimeString()}
      </span>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-medium text-[var(--text)]">{title}</h2>
        <p className="text-[11px] text-[var(--text-muted)]">{subtitle}</p>
      </div>
      <div className="rounded-md border border-[var(--border)] overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function LeaderLeaseRow({ row }: { row: LeaderLease }) {
  const expiresClass = row.expired
    ? 'text-[var(--danger)]'
    : row.expiresInSeconds < 10
      ? 'text-[var(--warning)]'
      : 'text-[var(--text)]'
  return (
    <tr className="border-t border-[var(--border)] font-mono">
      <td className="px-3 py-1 text-[var(--text)]">{row.name}</td>
      <td className="px-3 py-1 text-[10px] text-[var(--text-muted)]">
        {row.leaderId}
      </td>
      <td className="px-3 py-1 text-[10px] text-[var(--text-faint)]">
        {new Date(row.acquiredAt).toLocaleTimeString()}
      </td>
      <td className={`px-3 py-1 text-right tabular-nums ${expiresClass}`}>
        {row.expired && (
          <AlertTriangle className="inline w-3 h-3 mr-1 align-text-bottom" />
        )}
        {formatSeconds(row.expiresInSeconds)}
      </td>
    </tr>
  )
}

function ActiveClaimRow({ row }: { row: ActiveClaim }) {
  const heartbeatClass =
    row.lastHeartbeatSecondsAgo > 30
      ? 'text-[var(--danger)]'
      : row.lastHeartbeatSecondsAgo > 10
        ? 'text-[var(--warning)]'
        : 'text-[var(--text)]'
  const leaseClass = row.leaseExpired
    ? 'text-[var(--danger)]'
    : row.leaseExpiresInSeconds < 30
      ? 'text-[var(--warning)]'
      : 'text-[var(--text)]'
  return (
    <tr className="border-t border-[var(--border)] font-mono">
      <td
        className="px-3 py-1 text-[10px] text-[var(--text)] truncate max-w-[14ch]"
        title={row.runId}
      >
        {row.runId.slice(0, 8)}…
      </td>
      <td className="px-3 py-1 text-[var(--text)]">{row.jobType}</td>
      <td className="px-3 py-1 text-[10px] text-[var(--text-muted)]">
        {row.companyId}
      </td>
      <td className="px-3 py-1 text-[10px] text-[var(--text-muted)]">
        {row.claimedBy}
      </td>
      <td className="px-3 py-1 text-right tabular-nums text-[var(--text-faint)]">
        {row.attempts}
      </td>
      <td className={`px-3 py-1 text-right tabular-nums ${heartbeatClass}`}>
        {row.lastHeartbeatSecondsAgo}s ago
      </td>
      <td className={`px-3 py-1 text-right tabular-nums ${leaseClass}`}>
        {row.leaseExpired && (
          <AlertTriangle className="inline w-3 h-3 mr-1 align-text-bottom" />
        )}
        {formatSeconds(row.leaseExpiresInSeconds)}
      </td>
    </tr>
  )
}

function formatSeconds(s: number): string {
  if (s < 0) return `${-s}s ago`
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}
