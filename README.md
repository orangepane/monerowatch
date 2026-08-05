# MoneroWatch

A live Monero network display that runs entirely in the browser. No backend, no trackers, no third-party scripts.

## What it shows

- Block height, estimated network hashrate, and block reward (tail emission)
- XMR price in USD, piconero per dollar, and the XMR/BTC ratio

## Features

- Add, remove, and configure displays; a display can rotate through several stats
- Fullscreen mode per display
- Installable PWA: opens offline and shows last-known values
- Custom monerod node URL in settings. Public nodes see your IP; your own node does not.
- Polls chain data every 10 seconds and price every 30 seconds; pauses when the tab is hidden

## Run

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Opening `index.html` directly also works, but PWA install needs http(s).

## Data sources

- Chain: monerod JSON-RPC. Default node is `xmr-node.cakewallet.com:18081`; change it in settings.
- Price: Kraken public API, with CoinGecko and Bitfinex as fallbacks.

Monero has no public mempool, so there is no mempool widget. That is by design.

The Monero symbol is from the getmonero.org press kit. Fonts are Red Hat Mono (SIL OFL 1.1).
