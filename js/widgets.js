/* widgets.js — widget registry: id, name, description copy, format() */
window.MW = window.MW || {};
(function (MW) {
	"use strict";

	function int(v) {
		return Math.round(v).toLocaleString("en-US");
	}

	var HASH_UNITS = [
		["H/s", 1],
		["kH/s", 1e3],
		["MH/s", 1e6],
		["GH/s", 1e9],
		["TH/s", 1e12],
	];

	MW.widgets = {
		blockHeight: {
			name: "Block Height",
			desc: "blocks in the blockchain",
			format: int,
		},
		price: {
			name: "XMR Price",
			desc: "market price of monero in USD",
			format: function (v) {
				return "$" + v.toLocaleString("en-US", {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				});
			},
		},
		piconeroPerDollar: {
			name: "Piconero per Dollar",
			desc: "value of 1 USD measured in piconero",
			format: int,
		},
		hashrate: {
			name: "Network Hashrate",
			desc: "estimated network hashrate · difficulty ÷ 120s",
			format: function (v) {
				var u = HASH_UNITS[0];
				for (var i = 0; i < HASH_UNITS.length; i++) {
					if (v >= HASH_UNITS[i][1]) u = HASH_UNITS[i];
				}
				return (v / u[1]).toFixed(1) + " " + u[0];
			},
		},
		blockReward: {
			name: "Block Reward",
			desc: "subsidy 0.6 XMR + fees · tail emission",
			format: function (v) {
				return v.toFixed(4) + " XMR";
			},
		},
		txPool: {
			name: "Tx Pool",
			desc: "transactions waiting to be mined",
			format: function (v) {
				return int(v) + (v === 1 ? " tx" : " txs");
			},
		},
		xmrBtc: {
			name: "XMR/BTC",
			desc: "the ratio · monero priced in bitcoin",
			format: function (v) {
				return v.toFixed(6) + " BTC";
			},
		},
	};

	MW.widgetIds = Object.keys(MW.widgets);
})(window.MW);
