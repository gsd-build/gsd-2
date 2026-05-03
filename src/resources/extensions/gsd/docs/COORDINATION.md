# Auto-mode coordination is single-host

The DB-backed coordination tables introduced by Phase B (`workers`,
`milestone_leases`, `unit_dispatches`, `cancellation_requests`,
`command_queue`) and the supporting `runtime_kv` table from Phase C all
rely on **shared SQLite WAL on local disk**. They do not work across
machines.

## Why single-host only

- SQLite WAL coordination — the locking primitives that make
  `claimMilestoneLease`, `recordDispatchClaim`, and `claimNextCommand`
  atomic — is local-disk only. Network filesystems (NFS, SMB, S3FS) and
  fuse mounts break the lock semantics that the WAL relies on.
- Heartbeat TTL (`workers.last_heartbeat_at`) compares timestamps written
  with SQLite wall-clock time (`datetime('now')`). Across machines without
  wall-clock synchronization (for example NTP/chrony), TTL filtering can
  produce phantom-active or premature-crashed verdicts. Monotonic clocks
  are not used for these comparisons.
- Fencing tokens (`milestone_leases.fencing_token`) are monotonically
  ordered by SQL within a single transaction. Cross-host races could
  produce duplicate tokens if two SQLite processes opened the same DB
  on a network mount.

## What does work

- Multiple `gsd auto` worker processes on the **same machine**, sharing
  the project's SQLite DB via WAL. The lease check refuses concurrent
  claims on the same milestone; the dispatch ledger's partial unique
  index refuses double-claims of the same unit.
- A single `gsd auto` worker plus arbitrary read-only consumers
  (dashboards, doctors) on the same machine.
- Worktree-based parallelism on the same machine, where each worker
  holds a different milestone lease.

## Multi-host alternatives

If you need to coordinate `gsd auto` workers across machines, you need
a real coordinator: Postgres for the ledger + a leader-election service
(etcd, Consul) for the leases. That's out of scope for these phases.
The schema and module shapes here would need a non-trivial backend
swap before they could ride on top of either.
