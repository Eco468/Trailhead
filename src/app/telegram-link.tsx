"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

type Status =
  | { state: "disconnected" }
  | { state: "idle" }
  | { state: "starting" }
  | { state: "waiting"; url: string }
  | { state: "linked"; username: string | null }
  | { state: "error"; message: string };

export default function TelegramLink() {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<Status>({ state: "disconnected" });
  const pollRef = useRef<number | null>(null);

  const clearPoll = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => clearPoll(), []);

  useEffect(() => {
    if (!isConnected || !address) {
      clearPoll();
      setStatus({ state: "disconnected" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/telegram/status?wallet=${address}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { linked: boolean; username?: string | null };
        if (cancelled) return;
        if (data.linked) {
          setStatus({ state: "linked", username: data.username ?? null });
        } else {
          setStatus({ state: "idle" });
        }
      } catch {
        if (!cancelled) setStatus({ state: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const startLink = useCallback(async () => {
    if (!address) return;
    setStatus({ state: "starting" });
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet_address: address }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setStatus({ state: "error", message: data.error ?? "failed to start link" });
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
      setStatus({ state: "waiting", url: data.url });

      clearPoll();
      pollRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(`/api/telegram/status?wallet=${address}`);
          if (!r.ok) return;
          const s = (await r.json()) as { linked: boolean; username?: string | null };
          if (s.linked) {
            clearPoll();
            setStatus({ state: "linked", username: s.username ?? null });
          }
        } catch {}
      }, 3000);
    } catch (e) {
      setStatus({ state: "error", message: e instanceof Error ? e.message : "network error" });
    }
  }, [address]);

  if (status.state === "disconnected") {
    return (
      <button
        type="button"
        disabled
        className="h-12 px-6 rounded-full border border-zinc-200 dark:border-zinc-800 font-medium text-sm tracking-tight opacity-50 cursor-not-allowed"
      >
        Link Telegram
      </button>
    );
  }

  if (status.state === "linked") {
    return (
      <div className="h-12 px-6 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium text-sm tracking-tight flex items-center gap-2">
        <span aria-hidden>✓</span>
        Telegram linked{status.username ? ` — @${status.username}` : ""}
      </div>
    );
  }

  if (status.state === "waiting") {
    return (
      <div className="flex flex-col items-center sm:items-start gap-1">
        <a
          href={status.url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-12 px-6 rounded-full border border-zinc-200 dark:border-zinc-800 font-medium text-sm tracking-tight flex items-center"
        >
          Open Telegram again
        </a>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          Hit Start in the bot, then come back.
        </span>
      </div>
    );
  }

  const label =
    status.state === "starting"
      ? "Starting…"
      : status.state === "error"
        ? "Retry"
        : "Link Telegram";

  return (
    <div className="flex flex-col items-center sm:items-start gap-1">
      <button
        type="button"
        onClick={startLink}
        disabled={status.state === "starting"}
        className="h-12 px-6 rounded-full border border-zinc-200 dark:border-zinc-800 font-medium text-sm tracking-tight transition hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {label}
      </button>
      {status.state === "error" && (
        <span className="text-xs text-red-500">{status.message}</span>
      )}
    </div>
  );
}
