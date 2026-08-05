/* store.js — in-memory state + localStorage persistence */
window.MW = window.MW || {};
(function (MW) {
	"use strict";

	var LS_CONFIG = "monerowatch.config.v1";
	var LS_NODE = "monerowatch.nodeUrl.v1";
	var LS_VALUES = "monerowatch.values.v1";
	var DEFAULT_NODE = "https://xmr-node.cakewallet.com:18081";

	var DEFAULT_CONFIG = {
		items: [
			{ modes: ["blockHeight"] },
			{ modes: ["price"] },
			{ modes: ["piconeroPerDollar"] },
			{ modes: ["hashrate"] },
			{ modes: ["blockReward"] },
		],
	};

	function clone(o) {
		return JSON.parse(JSON.stringify(o));
	}

	function loadConfig() {
		try {
			var raw = localStorage.getItem(LS_CONFIG);
			if (raw) {
				var c = JSON.parse(raw);
				if (c && Array.isArray(c.items)) return c;
			}
		} catch (e) {
			/* private mode / corrupt data — fall through */
		}
		return clone(DEFAULT_CONFIG);
	}

	function loadNode() {
		try {
			return localStorage.getItem(LS_NODE) || DEFAULT_NODE;
		} catch (e) {
			return DEFAULT_NODE;
		}
	}

	function loadValues() {
		try {
			var raw = localStorage.getItem(LS_VALUES);
			if (raw) {
				var v = JSON.parse(raw);
				if (v && typeof v === "object") return v;
			}
		} catch (e) {}
		return { values: {}, updatedAt: {} };
	}

	var saved = loadValues();

	var state = {
		values: saved.values, // widgetId -> last value (persisted: offline shows last-known)
		updatedAt: saved.updatedAt, // widgetId -> timestamp of last success
		status: {
			chain: { ok: null },
			price: { ok: null, source: null },
		},
		pulse: 0,
		config: loadConfig(),
		nodeUrl: loadNode(),
	};

	var subs = {};

	function notify(key) {
		(subs[key] || []).slice().forEach(function (fn) {
			fn(state[key]);
		});
	}

	MW.store = {
		DEFAULT_NODE: DEFAULT_NODE,

		get: function (key) {
			return state[key];
		},

		subscribe: function (key, fn) {
			(subs[key] = subs[key] || []).push(fn);
			return function () {
				subs[key] = subs[key].filter(function (f) {
					return f !== fn;
				});
			};
		},

		setValue: function (id, value) {
			state.values[id] = value;
			state.updatedAt[id] = Date.now();
			try {
				localStorage.setItem(
					LS_VALUES,
					JSON.stringify({ values: state.values, updatedAt: state.updatedAt })
				);
			} catch (e) {}
			notify("values");
		},

		getUpdatedAt: function (id) {
			return state.updatedAt[id] || 0;
		},

		setStatus: function (kind, patch) {
			Object.assign(state.status[kind], patch);
			notify("status");
		},

		setConfig: function (config) {
			state.config = config;
			try {
				localStorage.setItem(LS_CONFIG, JSON.stringify(config));
			} catch (e) {}
			notify("config");
		},

		resetConfig: function () {
			this.setConfig(clone(DEFAULT_CONFIG));
		},

		setNodeUrl: function (url) {
			state.nodeUrl = url;
			try {
				localStorage.setItem(LS_NODE, url);
			} catch (e) {}
			notify("nodeUrl");
		},

		tickPulse: function () {
			state.pulse += 1;
			notify("pulse");
		},
	};
})(window.MW);
