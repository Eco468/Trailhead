import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const CODE_TTL_MIN = 10;

export async function POST(req: NextRequest) {
  let body: { wallet_address?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const raw = body.wallet_address;
  if (!raw || !ADDR.test(raw)) {
    return Response.json({ error: "invalid wallet_address" }, { status: 400 });
  }
  const address = raw.toLowerCase();

  const existingWallet = await supabaseAdmin
    .from("wallets")
    .select("user_id")
    .eq("address", address)
    .maybeSingle();

  if (existingWallet.error) {
    return Response.json({ error: existingWallet.error.message }, { status: 500 });
  }

  let userId: string;
  if (existingWallet.data) {
    userId = existingWallet.data.user_id;
  } else {
    const newUser = await supabaseAdmin
      .from("users")
      .insert({})
      .select("id")
      .single();
    if (newUser.error || !newUser.data) {
      return Response.json({ error: newUser.error?.message ?? "user insert failed" }, { status: 500 });
    }
    userId = newUser.data.id;

    const newWallet = await supabaseAdmin
      .from("wallets")
      .insert({ user_id: userId, address });
    if (newWallet.error) {
      return Response.json({ error: newWallet.error.message }, { status: 500 });
    }
  }

  const code = randomBytes(12).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();

  const insertCode = await supabaseAdmin
    .from("telegram_link_codes")
    .insert({ code, user_id: userId, expires_at: expiresAt });
  if (insertCode.error) {
    return Response.json({ error: insertCode.error.message }, { status: 500 });
  }

  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "PingChainBot";
  return Response.json({ url: `https://t.me/${bot}?start=${code}` });
}
