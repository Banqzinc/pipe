export enum PrStatus {
  Open = 'open',
  Closed = 'closed',
  Merged = 'merged',
}

export enum RunStatus {
  Queued = 'queued',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Partial = 'partial',
}

export enum FindingSeverity {
  Critical = 'critical',
  Warning = 'warning',
  Suggestion = 'suggestion',
  Nitpick = 'nitpick',
}

export enum FindingStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Edited = 'edited',
  Posted = 'posted',
}
