/* poller.js — data feeds. No websockets exist for monerod; poll REST.
   Chain: 10s. Price: 30s, Kraken -> CoinGecko -> Bitfinex failover. */
window.MW = window.MW || {};
(function (MW) {
	"use strict";

	var CHAIN_MS = 10000;
	var PRICE_MS = 30000;
	var TIMEOUT_MS = 8000; // a hung node must fail before the next tick fires

	var PRICE_SOURCES = [
		{
			name: "Kraken",
			url: "https://api.kraken.com/0/public/Ticker?pair=XMRUSD",
			parse: function (j) {
				var r = j && j.result && (j.result.XXMRZUSD || j.result.XMRUSD);
				return r && r.c && parseFloat(r.c[0]); // last trade
			},
		},
		{
			name: "CoinGecko",
			url: "https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd",
			parse: function (j) {
				return j && j.monero && j.monero.usd;
			},
		},
		{
			name: "Bitfinex",
			url: "https://api.bitfinex.com/v1/pubticker/xmrusd",
			parse: function (j) {
				return j && parseFloat(j.last_price);
			},
		},
	];

	var RATIO_SOURCES = [
		{
			name: "Kraken",
			url: "https://api.kraken.com/0/public/Ticker?pair=XMRXBT",
			parse: function (j) {
				var r = j && j.result && (j.result.XXMRXXBT || j.result.XMRXBT);
				return r && r.c && parseFloat(r.c[0]);
			},
		},
		{
			name: "CoinGecko",
			url: "https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=btc",
			parse: function (j) {
				return j && j.monero && j.monero.btc;
			},
		},
		{
			name: "Bitfinex",
			url: "https://api.bitfinex.com/v1/pubticker/xmrbtc",
			parse: function (j) {
				return j && parseFloat(j.last_price);
			},
		},
	];

	var sticky = { price: 0, ratio: 0 }; // keep using the last source that worked
	var chainTimer = null;
	var priceTimer = null;
	var running = false;

	/* every request is time-boxed: without this a hung socket never settles and
	   the next interval stacks another request on top of it, forever */
	function fetchJSON(url, opts) {
		var ctl = new AbortController();
		var timer = setTimeout(function () {
			ctl.abort();
		}, TIMEOUT_MS);
		opts = opts || {};
		opts.signal = ctl.signal;
		return fetch(url, opts)
			.then(function (res) {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.json();
			})
			.finally(function () {
				clearTimeout(timer);
			});
	}

	function rpc(method) {
		var node = MW.store.get("nodeUrl").replace(/\/+$/, "");
		return fetchJSON(node + "/json_rpc", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: "0", method: method }),
		}).then(function (j) {
			if (j.error) throw new Error(j.error.message || "rpc error");
			return j.result;
		});
	}

	function pollChain() {
		Promise.all([rpc("get_info"), rpc("get_last_block_header")])
			.then(function (r) {
				var info = r[0];
				var header = r[1].block_header;
				MW.store.setValues({
					blockHeight: info.height,
					// "estimated" — real network hashrate is unknowable on Monero
					hashrate: info.difficulty / 120,
					blockReward: header.reward / 1e12, // piconero -> XMR
					txPool: info.tx_pool_size,
				});
				MW.store.setStatus("chain", { ok: true });
			})
			.catch(function () {
				MW.store.setStatus("chain", { ok: false });
			});
	}

	/* walk the sources starting from the last one that worked; onValue gets the
	   first parseable answer, onFail runs only when every source is exhausted */
	function pollFeed(key, sources, onValue, onFail) {
		(function attempt(step) {
			if (step >= sources.length) {
				if (onFail) onFail();
				return;
			}
			var i = (sticky[key] + step) % sources.length;
			var s = sources[i];
			fetchJSON(s.url)
				.then(function (j) {
					var v = s.parse(j);
					if (!v || isNaN(v)) throw new Error("unparseable " + key);
					sticky[key] = i;
					onValue(v, s.name);
				})
				.catch(function () {
					attempt(step + 1);
				});
		})(0);
	}

	function pollPrice() {
		pollFeed(
			"price",
			PRICE_SOURCES,
			function (p, name) {
				MW.store.setValues({ price: p, piconeroPerDollar: 1e12 / p });
				MW.store.setStatus("price", { ok: true, source: name });
			},
			function () {
				MW.store.setStatus("price", { ok: false });
			}
		);
		// the ratio has no status line of its own — failure just leaves it stale
		pollFeed("ratio", RATIO_SOURCES, function (r) {
			MW.store.setValues({ xmrBtc: r });
		});
	}

	MW.poller = {
		CHAIN_MS: CHAIN_MS,
		PRICE_MS: PRICE_MS,

		start: function () {
			if (running) return;
			running = true;
			pollChain();
			pollPrice();
			chainTimer = setInterval(pollChain, CHAIN_MS);
			priceTimer = setInterval(pollPrice, PRICE_MS);
		},

		stop: function () {
			running = false;
			clearInterval(chainTimer);
			clearInterval(priceTimer);
		},
	};
})(window.MW);
