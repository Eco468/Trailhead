"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

type Status =
  | { state: "disconnected" }
  | { state: "idle" }
  | { state: "starting" }
  | { state: "waiting"; url: string; code: string; bot: string }
  | { state: "linked"; username: string | null }
  | { state: "unlinking"; username: string | null }
  | { state: "error"; message: string };

export default function TelegramLink() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
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
      const message = `Link wallet ${address} to Trailhead\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet_address: address, message, signature }),
      });
      const data = (await res.json()) as { url?: string; code?: string; bot?: string; error?: string };
      if (!res.ok || !data.url || !data.code || !data.bot) {
        setStatus({ state: "error", message: data.error ?? "failed to start link" });
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
      setStatus({ state: "waiting", url: data.url, code: data.code, bot: data.bot });

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
  }, [address, signMessageAsync]);

  const unlink = useCallback(async () => {
    if (!address) return;
    const current = status.state === "linked" ? status.username : null;
    if (!confirm("Unlink Telegram? You'll stop receiving alerts until you link again.")) return;
    setStatus({ state: "unlinking", username: current });
    try {
      const message = `Unlink wallet ${address} from Trailhead\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch("/api/telegram/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet_address: address, message, signature }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus({ state: "error", message: data.error ?? "failed to unlink" });
        return;
      }
      setStatus({ state: "idle" });
    } catch (e) {
      setStatus({ state: "error", message: e instanceof Error ? e.message : "network error" });
    }
  }, [address, signMessageAsync, status]);

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

  if (status.state === "linked" || status.state === "unlinking") {
    const busy = status.state === "unlinking";
    return (
      <div className="flex items-center gap-2">
        <div className="h-12 px-6 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium text-sm tracking-tight flex items-center gap-2">
          <span aria-hidden>✓</span>
          Telegram linked{status.username ? ` — @${status.username}` : ""}
        </div>
        <button
          type="button"
          onClick={unlink}
          disabled={busy}
          className="h-12 px-4 rounded-full border border-zinc-200 dark:border-zinc-800 font-medium text-sm tracking-tight transition hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? "Unlinking…" : "Unlink"}
        </button>
      </div>
    );
  }

  if (status.state === "waiting") {
    const command = `/start ${status.code}`;
    return (
      <div className="flex flex-col items-center sm:items-start gap-2 max-w-md">
        <a
          href={status.url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-12 px-6 rounded-full border border-zinc-200 dark:border-zinc-800 font-medium text-sm tracking-tight flex items-center"
        >
          Open Telegram again
        </a>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          Hit Start in the bot, then come back. Already in the chat? Paste this command:
        </span>
        <div className="flex items-center gap-2 w-full">
          <code className="flex-1 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1.5 font-mono break-all">
            {command}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(command)}
            className="text-xs px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            Copy
          </button>
        </div>
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
