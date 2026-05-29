import AlertRules from "./alert-rules";
import ConnectWalletButton from "./connect-wallet-button";
import TelegramLink from "./telegram-link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-white dark:bg-black text-zinc-900 dark:text-zinc-100">
      <header className="px-6 py-5 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-900">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="text-blue-600 dark:text-blue-400">
            ◆
          </span>
          <span>PingChain</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
            Arc testnet
          </div>
          <ConnectWalletButton />
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight max-w-3xl leading-tight">
          Onchain alerts that{" "}
          <span className="text-blue-600 dark:text-blue-400">actually</span>{" "}
          work.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Get a Telegram ping the moment something happens on your wallet —
          incoming USDC, suspicious approvals, large transfers. Stop refreshing
          five apps.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
          <ConnectWalletButton />
          <TelegramLink />
        </div>

        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
          Connect a wallet on Arc testnet, link your Telegram, then pick your
          alerts below.
        </p>

        <AlertRules />
      </section>

      <section className="px-6 py-16 border-t border-zinc-200 dark:border-zinc-900">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 tracking-wide uppercase mb-8 text-center sm:text-left">
            What you&apos;ll be pinged for
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <Feature
              title="Incoming USDC"
              desc="Know the moment money lands. No more refreshing the explorer."
            />
            <Feature
              title="New approvals"
              desc="Get pinged when a contract gets permission to spend your tokens. Catch phishing attempts before they drain you."
            />
            <Feature
              title="Large outgoing"
              desc="Set a threshold. Get an alert if anything leaves your wallet above it."
            />
          </div>
        </div>
      </section>

      <footer className="px-6 py-8 border-t border-zinc-200 dark:border-zinc-900 text-xs text-zinc-500 dark:text-zinc-500 text-center">
        Built on Arc — Circle&apos;s stablecoin L1 ·{" "}
        <a
          href="https://github.com/Eco468/pingchain"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          Source
        </a>
      </footer>
    </main>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h3 className="font-semibold tracking-tight mb-2">{title}</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {desc}
      </p>
    </div>
  );
}
