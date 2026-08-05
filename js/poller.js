/* poller.js — data feeds. No websockets exist for monerod; poll REST.
   Chain: 10s. Price: 30s, Kraken -> CoinGecko -> Bitfinex failover. */
window.MW = window.MW || {};
(function (MW) {
	"use strict";

	var CHAIN_MS = 10000;
	var PRICE_MS = 30000;

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

	var activeSource = 0; // sticky: keep using the last source that worked
	var activeRatioSource = 0;
	var chainTimer = null;
	var priceTimer = null;
	var running = false;

	function rpc(method) {
		var node = MW.store.get("nodeUrl").replace(/\/+$/, "");
		return fetch(node + "/json_rpc", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: "0", method: method }),
		})
			.then(function (res) {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.json();
			})
			.then(function (j) {
				if (j.error) throw new Error(j.error.message || "rpc error");
				return j.result;
			});
	}

	function pollChain() {
		Promise.all([rpc("get_info"), rpc("get_last_block_header")])
			.then(function (r) {
				var info = r[0];
				var header = r[1].block_header;
				MW.store.setValue("blockHeight", info.height);
				// "estimated" — real network hashrate is unknowable on Monero
				MW.store.setValue("hashrate", info.difficulty / 120);
				MW.store.setValue("blockReward", header.reward / 1e12); // piconero -> XMR
				MW.store.setValue("txPoolSize", info.tx_pool_size); // pool count; not displayed yet
				MW.store.setStatus("chain", { ok: true });
			})
			.catch(function () {
				MW.store.setStatus("chain", { ok: false });
			});
	}

	function trySource(i) {
		var s = PRICE_SOURCES[i];
		return fetch(s.url)
			.then(function (res) {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.json();
			})
			.then(function (j) {
				var p = s.parse(j);
				if (!p || isNaN(p)) throw new Error("unparseable price");
				return p;
			});
	}

	function pollPrice() {
		// try the sticky source first, then fall through the rest
		var order = PRICE_SOURCES.map(function (_, i) {
			return (activeSource + i) % PRICE_SOURCES.length;
		});
		(function attempt(idx) {
			if (idx >= order.length) {
				MW.store.setStatus("price", { ok: false });
				return;
			}
			var i = order[idx];
			trySource(i)
				.then(function (p) {
					activeSource = i;
					MW.store.setValue("price", p);
					MW.store.setValue("piconeroPerDollar", 1e12 / p);
					MW.store.setStatus("price", { ok: true, source: PRICE_SOURCES[i].name });
				})
				.catch(function () {
					attempt(idx + 1);
				});
		})(0);
	}

	function pollRatio() {
		var order = RATIO_SOURCES.map(function (_, i) {
			return (activeRatioSource + i) % RATIO_SOURCES.length;
		});
		(function attempt(idx) {
			if (idx >= order.length) return; // ratio has no status line of its own
			var i = order[idx];
			var s = RATIO_SOURCES[i];
			fetch(s.url)
				.then(function (res) {
					if (!res.ok) throw new Error("HTTP " + res.status);
					return res.json();
				})
				.then(function (j) {
					var r = s.parse(j);
					if (!r || isNaN(r)) throw new Error("unparseable ratio");
					activeRatioSource = i;
					MW.store.setValue("xmrBtc", r);
				})
				.catch(function () {
					attempt(idx + 1);
				});
		})(0);
	}

	MW.poller = {
		CHAIN_MS: CHAIN_MS,
		PRICE_MS: PRICE_MS,

		start: function () {
			if (running) return;
			running = true;
			pollChain();
			pollPrice();
			pollRatio();
			chainTimer = setInterval(pollChain, CHAIN_MS);
			priceTimer = setInterval(function () {
				pollPrice();
				pollRatio();
			}, PRICE_MS);
		},

		stop: function () {
			running = false;
			clearInterval(chainTimer);
			clearInterval(priceTimer);
		},
	};
})(window.MW);
