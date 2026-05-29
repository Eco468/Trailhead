import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const RULE_TYPES = ["incoming_usdc", "new_approval", "outgoing_above"] as const;
type RuleType = (typeof RULE_TYPES)[number];

type RuleState = { enabled: boolean; threshold_usdc: number | null };
type RulesMap = Record<RuleType, RuleState>;

function defaultRules(): RulesMap {
  return {
    incoming_usdc: { enabled: false, threshold_usdc: null },
    new_approval: { enabled: false, threshold_usdc: null },
    outgoing_above: { enabled: false, threshold_usdc: null },
  };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("wallet");
  if (!raw || !ADDR.test(raw)) {
    return Response.json({ error: "invalid wallet" }, { status: 400 });
  }
  const address = raw.toLowerCase();

  const wallet = await supabaseAdmin
    .from("wallets")
    .select("id")
    .eq("address", address)
    .maybeSingle();
  if (wallet.error) {
    return Response.json({ error: wallet.error.message }, { status: 500 });
  }
  if (!wallet.data) {
    return Response.json({ rules: defaultRules(), known: false });
  }

  const rules = await supabaseAdmin
    .from("alert_rules")
    .select("rule_type, enabled, threshold_usdc")
    .eq("wallet_id", wallet.data.id);
  if (rules.error) {
    return Response.json({ error: rules.error.message }, { status: 500 });
  }

  const out = defaultRules();
  for (const r of rules.data ?? []) {
    if ((RULE_TYPES as readonly string[]).includes(r.rule_type)) {
      out[r.rule_type as RuleType] = {
        enabled: r.enabled,
        threshold_usdc: r.threshold_usdc != null ? Number(r.threshold_usdc) : null,
      };
    }
  }
  return Response.json({ rules: out, known: true });
}

export async function PUT(req: NextRequest) {
  let body: {
    wallet_address?: string;
    rule_type?: string;
    enabled?: boolean;
    threshold_usdc?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const raw = body.wallet_address;
  if (!raw || !ADDR.test(raw)) {
    return Response.json({ error: "invalid wallet_address" }, { status: 400 });
  }
  if (!body.rule_type || !(RULE_TYPES as readonly string[]).includes(body.rule_type)) {
    return Response.json({ error: "invalid rule_type" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled must be boolean" }, { status: 400 });
  }
  const rule_type = body.rule_type as RuleType;
  const address = raw.toLowerCase();

  let threshold: number | null = null;
  if (rule_type === "outgoing_above") {
    if (body.enabled) {
      if (
        body.threshold_usdc == null ||
        !Number.isFinite(body.threshold_usdc) ||
        body.threshold_usdc <= 0
      ) {
        return Response.json(
          { error: "threshold_usdc required for outgoing_above when enabled" },
          { status: 400 },
        );
      }
      threshold = Number(body.threshold_usdc);
    } else if (
      body.threshold_usdc != null &&
      Number.isFinite(body.threshold_usdc) &&
      body.threshold_usdc > 0
    ) {
      threshold = Number(body.threshold_usdc);
    }
  }

  const wallet = await supabaseAdmin
    .from("wallets")
    .select("id")
    .eq("address", address)
    .maybeSingle();
  if (wallet.error) {
    return Response.json({ error: wallet.error.message }, { status: 500 });
  }
  if (!wallet.data) {
    return Response.json(
      { error: "wallet not registered — link Telegram first" },
      { status: 404 },
    );
  }

  const upsert = await supabaseAdmin.from("alert_rules").upsert(
    {
      wallet_id: wallet.data.id,
      rule_type,
      enabled: body.enabled,
      threshold_usdc: threshold,
    },
    { onConflict: "wallet_id,rule_type" },
  );
  if (upsert.error) {
    return Response.json({ error: upsert.error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
