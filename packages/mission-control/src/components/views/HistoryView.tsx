/**
 * HistoryView — GSD checkpoint commit history from git log API.
 *
 * Fetches commits on mount from /api/git/log and renders them
 * with hash, subject, date, and author information.
 */
import { useState, useEffect } from "react";

interface GitCommit {
  hash: string;
  subject: string;
  date: string;
  author: string;
}

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function HistoryView() {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      try {
        const res = await fetch("/api/git/log?limit=50");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setCommits(data.commits ?? data ?? []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    }

    fetchHistory();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        <h1 className="sr-only">History</h1>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 bg-navy-600 rounded animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-400 text-sm">
        <h1 className="sr-only">History</h1>
        Failed to load history: {error}
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="p-6 text-slate-400 text-sm">
        <h1 className="sr-only">History</h1>
        No GSD history found for this project.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4">
      <h1 className="sr-only">History</h1>
      {commits.map((commit) => (
        <div
          key={commit.hash}
          className="flex items-start gap-2 p-2 border-b border-navy-600 text-sm"
        >
          <span className="font-mono text-cyan-accent text-xs flex-shrink-0">
            {commit.hash.slice(0, 7)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-slate-300 truncate">{commit.subject}</p>
            <div className="flex gap-2 text-xs text-slate-500 mt-1">
              <span>{relativeDate(commit.date)}</span>
              <span>{commit.author}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
