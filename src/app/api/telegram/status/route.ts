import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("wallet");
  if (!raw || !ADDR.test(raw)) {
    return Response.json({ error: "invalid wallet" }, { status: 400 });
  }
  const address = raw.toLowerCase();

  const wallet = await supabaseAdmin
    .from("wallets")
    .select("user_id, users(telegram_chat_id, telegram_username)")
    .eq("address", address)
    .maybeSingle();

  if (wallet.error) {
    return Response.json({ error: wallet.error.message }, { status: 500 });
  }

  const user = wallet.data?.users as
    | { telegram_chat_id: number | null; telegram_username: string | null }
    | { telegram_chat_id: number | null; telegram_username: string | null }[]
    | null
    | undefined;

  const u = Array.isArray(user) ? user[0] : user;

  if (!u?.telegram_chat_id) {
    return Response.json({ linked: false });
  }
  return Response.json({ linked: true, username: u.telegram_username });
}
