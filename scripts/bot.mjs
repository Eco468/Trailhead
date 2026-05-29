// Polling Telegram bot — handles /start <code> to link a Telegram account to a wallet.
// Run separately from `npm run dev`:    npm run bot
import { Bot } from "grammy";
import { createClient } from "@supabase/supabase-js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bot = new Bot(token);

bot.use(async (ctx, next) => {
  console.log(
    `[update] type=${ctx.update.message ? "message" : Object.keys(ctx.update).find((k) => k !== "update_id")} from=@${ctx.from?.username ?? ctx.from?.id} text=${JSON.stringify(ctx.message?.text)}`,
  );
  await next();
});

bot.command("start", async (ctx) => {
  const code = ctx.match?.trim();
  if (!code) {
    await ctx.reply(
      "Welcome to PingChain. To link your wallet, open the app and click \"Link Telegram\".",
    );
    return;
  }

  const lookup = await supabase
    .from("telegram_link_codes")
    .select("user_id, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (lookup.error) {
    console.error("link code lookup error:", lookup.error);
    await ctx.reply("Something went wrong. Try again in a moment.");
    return;
  }
  if (!lookup.data) {
    await ctx.reply("That link is invalid. Generate a new one from the app.");
    return;
  }
  if (lookup.data.used_at) {
    await ctx.reply("That link was already used. Generate a new one from the app.");
    return;
  }
  if (new Date(lookup.data.expires_at).getTime() < Date.now()) {
    await ctx.reply("That link has expired. Generate a new one from the app.");
    return;
  }

  const from = ctx.from;
  if (!from) {
    await ctx.reply("Couldn't read your Telegram account info. Try again.");
    return;
  }

  const update = await supabase
    .from("users")
    .update({
      telegram_chat_id: from.id,
      telegram_username: from.username ?? null,
    })
    .eq("id", lookup.data.user_id);
  if (update.error) {
    console.error("user update error:", update.error);
    await ctx.reply("Something went wrong saving your account. Try again.");
    return;
  }

  await supabase
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code);

  await ctx.reply(
    "Linked. You'll get a ping the moment something happens on your wallet.",
  );
});

bot.catch((err) => {
  console.error("bot error:", err);
});

console.log("PingChain bot polling. Press Ctrl+C to stop.");
await bot.start();
