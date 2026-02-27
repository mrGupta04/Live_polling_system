import { useEffect, useMemo, useState } from "react";
import { Poll } from "../types";

export function usePollTimer(poll: Poll | null, serverTimeMs: number | null) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const endTimeMs = useMemo(() => (poll ? new Date(poll.endsAt).getTime() : 0), [poll]);

  useEffect(() => {
    if (!poll || !serverTimeMs) {
      setRemainingSeconds(0);
      return;
    }

    const driftMs = Date.now() - serverTimeMs;

    const update = () => {
      const syncedNow = Date.now() - driftMs;
      const diff = Math.max(0, Math.ceil((endTimeMs - syncedNow) / 1000));
      setRemainingSeconds(diff);
    };

    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [endTimeMs, poll, serverTimeMs]);

  return remainingSeconds;
}
