// Fast-forward indexer cursor to near head for testing
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env vars");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const client = createPublicClient({
  transport: http("https://rpc.testnet.arc.network"),
});

const head = await client.getBlockNumber();
const target = head - 50n;

console.log(`head: ${head}, setting cursor to ${target}`);

const { error } = await supabase
  .from("indexer_state")
  .update({ last_block: target.toString() })
  .in("stream", ["native_transfers", "erc20_approvals"]);

if (error) throw new Error(`update failed: ${error.message}`);

console.log("✓ Cursor updated. Indexer will pick up the new position on next tick.");
