// Arc testnet indexer — polls for native USDC transfers and ERC-20 Approvals,
// fires Telegram messages via grammy when an enabled alert_rule matches.
// Run separately from `npm run dev` and `npm run bot`:    npm run indexer
import { createPublicClient, http, parseAbiItem, formatUnits, getAddress } from "viem";
import { defineChain } from "viem";
import { createClient } from "@supabase/supabase-js";
import { Bot } from "grammy";

const RPC = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const POLL_MS = 5_000;
const MAX_BLOCK_WINDOW = 100n;
const BLOCK_CONCURRENCY = 10;
const CONFIRMATIONS = 1n;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const explorer = "https://testnet.arcscan.app";

if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN missing");

const arcTestnet = defineChain({
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "ArcScan", url: explorer } },
  testnet: true,
});

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(RPC, { retryCount: 1, retryDelay: 200, timeout: 8_000 }),
});
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bot = new Bot(botToken);

const APPROVAL_EVENT = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shortAddr(a) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function txLink(hash) {
  return `${explorer}/tx/${hash}`;
}

// Fetch every wallet that has at least one enabled rule, joined with the user's chat_id.
// Returns Map<addressLower, { walletId, chatId, rules: { incoming_usdc?, outgoing_above?, new_approval? } }>.
async function loadWatchlist() {
  const res = await supabase
    .from("alert_rules")
    .select(
      "rule_type, threshold_usdc, enabled, wallet_id, wallets!inner(id, address, users!inner(telegram_chat_id))",
    )
    .eq("enabled", true);

  if (res.error) throw new Error(`watchlist load: ${res.error.message}`);

  const map = new Map();
  for (const row of res.data ?? []) {
    const wallet = Array.isArray(row.wallets) ? row.wallets[0] : row.wallets;
    if (!wallet) continue;
    const user = Array.isArray(wallet.users) ? wallet.users[0] : wallet.users;
    if (!user?.telegram_chat_id) continue;

    const addr = wallet.address.toLowerCase();
    let entry = map.get(addr);
    if (!entry) {
      entry = { walletId: wallet.id, chatId: Number(user.telegram_chat_id), rules: {} };
      map.set(addr, entry);
    }
    entry.rules[row.rule_type] = {
      threshold: row.threshold_usdc != null ? BigInt(Math.round(Number(row.threshold_usdc) * 1e6)) : null,
    };
  }
  return map;
}

async function getCursor(stream, fallback) {
  const res = await supabase
    .from("indexer_state")
    .select("last_block")
    .eq("stream", stream)
    .maybeSingle();
  if (res.error) throw new Error(`cursor read: ${res.error.message}`);
  if (res.data) return BigInt(res.data.last_block);
  await supabase.from("indexer_state").insert({ stream, last_block: fallback.toString() });
  return fallback;
}

async function setCursor(stream, block) {
  const res = await supabase
    .from("indexer_state")
    .update({ last_block: block.toString(), updated_at: new Date().toISOString() })
    .eq("stream", stream);
  if (res.error) throw new Error(`cursor write: ${res.error.message}`);
}

// Insert into processed_events; return true if we won the race (first to claim it).
async function claimEvent({ txHash, logIndex, ruleType, walletId }) {
  const res = await supabase
    .from("processed_events")
    .insert({
      tx_hash: txHash,
      log_index: logIndex,
      rule_type: ruleType,
      wallet_id: walletId,
    });
  if (res.error) {
    // 23505 = unique_violation in postgres → already fired
    if (res.error.code === "23505") return false;
    throw new Error(`claim: ${res.error.message}`);
  }
  return true;
}

async function fire(chatId, text) {
  console.log(`[fire] chat=${chatId} ${text.split("\n")[0].replace(/<[^>]+>/g, "")}`);
  try {
    await bot.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    console.error("telegram send failed:", e?.description ?? e?.message ?? e);
  }
}

async function scanNativeTransfers(fromBlock, toBlock, watchlist) {
  const numbers = [];
  for (let n = fromBlock; n <= toBlock; n++) numbers.push(n);

  // Fetch blocks in parallel chunks. The Arc RPC is intermittently flaky, so
  // we Promise.allSettled each chunk and silently skip failures — the next
  // tick will re-cover them since we only advance the cursor on a clean tick.
  const blocks = [];
  for (let i = 0; i < numbers.length; i += BLOCK_CONCURRENCY) {
    const chunk = numbers.slice(i, i + BLOCK_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((n) => client.getBlock({ blockNumber: n, includeTransactions: true })),
    );
    for (const r of results) {
      if (r.status === "fulfilled") blocks.push(r.value);
      else throw new Error(`getBlock failed: ${r.reason?.shortMessage ?? r.reason?.message ?? r.reason}`);
    }
  }

  for (const block of blocks) {
    for (const tx of block.transactions) {
      if (!tx.value || tx.value === 0n) continue;

      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase();

      if (to && watchlist.has(to)) {
        const w = watchlist.get(to);
        if (w.rules.incoming_usdc) {
          const fired = await claimEvent({
            txHash: tx.hash,
            logIndex: -1,
            ruleType: "incoming_usdc",
            walletId: w.walletId,
          });
          if (fired) {
            const amount = formatUnits(tx.value, 18);
            await fire(
              w.chatId,
              `<b>+ ${amount} USDC</b>\nIncoming to ${shortAddr(getAddress(to))}\nFrom ${shortAddr(getAddress(from))}\n<a href="${txLink(tx.hash)}">View on ArcScan</a>`,
            );
          }
        }
      }

      if (from && watchlist.has(from)) {
        const w = watchlist.get(from);
        const rule = w.rules.outgoing_above;
        if (rule && rule.threshold != null && tx.value > rule.threshold) {
          const fired = await claimEvent({
            txHash: tx.hash,
            logIndex: -1,
            ruleType: "outgoing_above",
            walletId: w.walletId,
          });
          if (fired) {
            const amount = formatUnits(tx.value, 18);
            const threshold = formatUnits(rule.threshold, 18);
            await fire(
              w.chatId,
              `<b>− ${amount} USDC</b>\nOutgoing from ${shortAddr(getAddress(from))} (above ${threshold} threshold)\nTo ${to ? shortAddr(getAddress(to)) : "contract"}\n<a href="${txLink(tx.hash)}">View on ArcScan</a>`,
            );
          }
        }
      }
    }
  }
}

async function scanApprovals(fromBlock, toBlock, watchlist) {
  const owners = Array.from(watchlist.keys()).filter(
    (a) => watchlist.get(a).rules.new_approval,
  );
  if (owners.length === 0) return;

  const logs = await client.getLogs({
    event: APPROVAL_EVENT,
    fromBlock,
    toBlock,
  });

  for (const log of logs) {
    const owner = log.args.owner?.toLowerCase();
    if (!owner) continue;
    const w = watchlist.get(owner);
    if (!w?.rules.new_approval) continue;

    const fired = await claimEvent({
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      ruleType: "new_approval",
      walletId: w.walletId,
    });
    if (!fired) continue;

    const spender = log.args.spender ? getAddress(log.args.spender) : "?";
    const token = getAddress(log.address);
    await fire(
      w.chatId,
      `<b>⚠ New approval</b>\nWallet ${shortAddr(getAddress(owner))} just approved\nSpender: ${shortAddr(spender)}\nToken: ${shortAddr(token)}\n<a href="${txLink(log.transactionHash)}">View on ArcScan</a>`,
    );
  }
}

async function tick() {
  const watchlist = await loadWatchlist();
  if (watchlist.size === 0) return;

  const head = await client.getBlockNumber();
  const safeHead = head - CONFIRMATIONS;

  for (const stream of ["native_transfers", "erc20_approvals"]) {
    const last = await getCursor(stream, safeHead);
    if (safeHead <= last) continue;

    const from = last + 1n;
    const to = from + MAX_BLOCK_WINDOW - 1n > safeHead ? safeHead : from + MAX_BLOCK_WINDOW - 1n;

    if (stream === "native_transfers") {
      await scanNativeTransfers(from, to, watchlist);
    } else {
      await scanApprovals(from, to, watchlist);
    }
    await setCursor(stream, to);
    console.log(`[${stream}] scanned ${from}..${to} (head=${head})`);
  }
}

console.log(`Trailhead indexer starting on Arc testnet (chainId=${CHAIN_ID}).`);

while (true) {
  try {
    await tick();
  } catch (e) {
    console.error("tick error:", e?.message ?? e);
  }
  await sleep(POLL_MS);
}
