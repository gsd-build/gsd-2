import { useState, useEffect, useRef } from "react";

/**
 * Polls /api/git/status every 3s when active=true.
 * Returns a Map of absolutePath -> status character.
 */
export function useGitStatus(projectRoot: string, active: boolean): Map<string, string> {
  const [statusMap, setStatusMap] = useState<Map<string, string>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || !projectRoot) {
      setStatusMap(new Map());
      return;
    }

    const fetchStatus = () => {
      fetch("/api/git/status?root=" + encodeURIComponent(projectRoot))
        .then((res) => res.json())
        .then((data: { files: Array<{ path: string; status: string }> }) => {
          const map = new Map<string, string>();
          for (const f of data.files ?? []) {
            map.set(f.path, f.status);
          }
          setStatusMap(map);
        })
        .catch(() => {}); // non-git project — stay empty
    };

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectRoot, active]);

  return statusMap;
}
