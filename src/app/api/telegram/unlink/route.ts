import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMessage } from "viem";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

export async function POST(req: NextRequest) {
  let body: { wallet_address?: string; message?: string; signature?: string };
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

  const { message, signature } = body;
  if (!message || !signature) {
    return Response.json({ error: "message and signature required" }, { status: 400 });
  }

  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return Response.json({ error: "invalid signature" }, { status: 401 });
    }
  } catch {
    return Response.json({ error: "signature verification failed" }, { status: 401 });
  }

  const wallet = await supabaseAdmin
    .from("wallets")
    .select("user_id")
    .eq("address", address)
    .maybeSingle();

  if (wallet.error) {
    return Response.json({ error: wallet.error.message }, { status: 500 });
  }
  if (!wallet.data) {
    return Response.json({ error: "wallet not found" }, { status: 404 });
  }

  const update = await supabaseAdmin
    .from("users")
    .update({ telegram_chat_id: null, telegram_username: null })
    .eq("id", wallet.data.user_id);

  if (update.error) {
    return Response.json({ error: update.error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
