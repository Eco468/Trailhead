# Trailhead

**Onchain alerts that actually work.** Get a Telegram ping the moment something happens on your wallet — incoming USDC, new token approvals, large outgoing transfers.

Built on **[Arc](https://arc.io)**, Circle's stablecoin-native L1.

## Why

Active crypto users juggle 4–6 apps just to know if anything happened on their wallets today. Existing notification tools are either dev-only (Push), abandoned (Hal), or basic (Etherscan watchlists). PingChain is the consumer-grade alternative.

## MVP scope

- Connect one wallet
- Link your Telegram
- Pick one of three alerts:
  - Incoming USDC transfer
  - New token approval (potential phishing signal)
  - Outgoing transfer above a threshold
- Receive Telegram message when something matches on Arc testnet

## Stack

- **Frontend**: Next.js 16 (App Router) + Tailwind CSS v4
- **Database + Auth**: Supabase
- **Wallet connect**: TBD (RainbowKit or Privy)
- **Chain interaction**: `viem` polling Arc testnet RPC
- **Bot**: Telegram Bot API

## Status

Pre-MVP — scaffolding in progress.

## Local dev

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Note: this machine needs `NODE_OPTIONS=--use-system-ca` for npm operations due to an SSL chain issue.
