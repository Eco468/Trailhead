"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

type RuleType = "incoming_usdc" | "new_approval" | "outgoing_above";

type RuleState = { enabled: boolean; threshold_usdc: number | null };
type RulesMap = Record<RuleType, RuleState>;

const DEFAULT_THRESHOLD = 100;

const RULE_META: { type: RuleType; title: string; desc: string }[] = [
  {
    type: "incoming_usdc",
    title: "Incoming USDC",
    desc: "Ping me when USDC lands in this wallet.",
  },
  {
    type: "new_approval",
    title: "New approvals",
    desc: "Ping me when a contract gets approval to spend my tokens.",
  },
  {
    type: "outgoing_above",
    title: "Outgoing above threshold",
    desc: "Ping me when more than the threshold leaves the wallet.",
  },
];

export default function AlertRules() {
  const { address, isConnected } = useAccount();
  const [rules, setRules] = useState<RulesMap | null>(null);
  const [known, setKnown] = useState(false);
  const [saving, setSaving] = useState<RuleType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setRules(null);
      setKnown(false);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rules?wallet=${address}`);
        const data = (await res.json()) as { rules: RulesMap; known: boolean };
        if (cancelled) return;
        setRules(data.rules);
        setKnown(!!data.known);
        setError(null);
      } catch {
        if (!cancelled) setError("Could not load rules.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const save = useCallback(
    async (type: RuleType, next: RuleState) => {
      if (!address) return;
      setSaving(type);
      setError(null);
      const prevSnapshot = rules;
      setRules((prev) => (prev ? { ...prev, [type]: next } : prev));
      try {
        const payload: {
          wallet_address: string;
          rule_type: RuleType;
          enabled: boolean;
          threshold_usdc?: number | null;
        } = {
          wallet_address: address,
          rule_type: type,
          enabled: next.enabled,
        };
        if (type === "outgoing_above") {
          payload.threshold_usdc = next.threshold_usdc;
        }
        const res = await fetch("/api/rules", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          setRules(prevSnapshot);
          setError(data.error ?? "Save failed");
          return;
        }
        setKnown(true);
      } catch (e) {
        setRules(prevSnapshot);
        setError(e instanceof Error ? e.message : "network error");
      } finally {
        setSaving(null);
      }
    },
    [address, rules],
  );

  if (!isConnected || !address || !rules) return null;

  if (!known) {
    return (
      <div className="mt-10 w-full max-w-2xl mx-auto px-6 py-5 rounded-2xl border border-zinc-200 dark:border-zinc-900 text-sm text-zinc-500 dark:text-zinc-400 text-center">
        Link Telegram above to pick which alerts to receive.
      </div>
    );
  }

  return (
    <div className="mt-10 w-full max-w-2xl mx-auto">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 tracking-wide uppercase mb-4 text-center">
        Your alerts
      </h2>
      <ul className="border border-zinc-200 dark:border-zinc-900 rounded-2xl divide-y divide-zinc-200 dark:divide-zinc-900 text-left bg-white dark:bg-black">
        {RULE_META.map(({ type, title, desc }) => {
          const r = rules[type];
          const isSaving = saving === type;
          return (
            <li key={type} className="p-5 flex items-start gap-4">
              <div className="flex-1">
                <div className="font-medium text-sm">{title}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  {desc}
                </div>
                {type === "outgoing_above" && r.enabled && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Above</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="decimal"
                      value={r.threshold_usdc ?? DEFAULT_THRESHOLD}
                      onChange={(e) => {
                        const value = e.target.value === "" ? 0 : Number(e.target.value);
                        if (!Number.isFinite(value)) return;
                        setRules((prev) =>
                          prev
                            ? {
                                ...prev,
                                outgoing_above: {
                                  ...prev.outgoing_above,
                                  threshold_usdc: value,
                                },
                              }
                            : prev,
                        );
                      }}
                      onBlur={() => {
                        const v = rules.outgoing_above.threshold_usdc;
                        if (v != null && v > 0) {
                          save("outgoing_above", { enabled: true, threshold_usdc: v });
                        }
                      }}
                      className="w-24 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-zinc-500 dark:text-zinc-400">USDC</span>
                  </div>
                )}
              </div>
              <Toggle
                checked={r.enabled}
                disabled={isSaving}
                onChange={(next) => {
                  const merged: RuleState = {
                    enabled: next,
                    threshold_usdc:
                      type === "outgoing_above"
                        ? r.threshold_usdc ?? DEFAULT_THRESHOLD
                        : null,
                  };
                  save(type, merged);
                }}
              />
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="mt-3 text-xs text-red-500 text-center">{error}</p>
      )}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
