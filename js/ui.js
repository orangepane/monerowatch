/* ui.js — rendering, interactions, marquee, settings */
window.MW = window.MW || {};
(function (MW) {
	"use strict";

	var FACTS = [
		"ring size 16 · your signature hides among 15 decoys",
		"target block time · 120 seconds",
		"tail emission · 0.6 XMR per block, forever",
		"1 XMR = 1,000,000,000,000 piconero",
		"every block is a difficulty adjustment",
		"no public mempool · by design",
		"randomx · mined by cpus, not warehouses",
		"zero third-party scripts on this page",
		"your node · your rules",
		"private digital cash",
	];

	var PULSE_MS = 30000; // multi-mode rotation cadence: settle, change, settle
	var MARQUEE_MS = 8000;

	var grid = document.getElementById("grid");
	var footStatus = document.getElementById("foot-status");
	var marquee = document.getElementById("marquee");
	var netDot = document.getElementById("net-dot");

	var rotIdx = {}; // display index -> rotation offset for multi-mode cards
	var openPicker = -1; // display index with open mode picker (-1 = none)
	var fullscreenIdx = -1;
	var lastHeight = null;

	/* ---------- svg icon helpers ---------- */

	function icon(paths) {
		var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "1.5");
		svg.setAttribute("aria-hidden", "true");
		paths.forEach(function (d) {
			var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
			p.setAttribute("d", d);
			p.setAttribute("stroke-linecap", "round");
			p.setAttribute("stroke-linejoin", "round");
			svg.appendChild(p);
		});
		return svg;
	}

	var ICON_COG = ["M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15v4.5M15 15h4.5m0-4.5l5.25 5.25"];
	var ICON_SHRINK = ["M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0L15 9m5.25 11.25h-4.5m4.5 0L15 15"];
	var ICON_X = ["M6 18L18 6M6 6l12 12"];
	var ICON_MODES = [
		"M17.004 10.407c.138.435-.216.842-.672.842h-3.465a.75.75 0 01-.65-.375l-1.732-3c-.229-.396-.053-.907.393-1.004a5.252 5.252 0 016.126 3.537z",
		"M8.12 8.464c.307-.338.838-.235 1.066.16l1.732 3a.75.75 0 010 .75l-1.732 3.001c-.229.396-.76.498-1.067.16A5.231 5.231 0 016.75 12c0-1.362.519-2.603 1.37-3.536z",
	];

	/* ---------- ring loader: 16 dots (1 signer + 15 decoys) ---------- */

	function makeRing() {
		var ring = document.createElement("div");
		ring.className = "ring";
		ring.setAttribute("role", "progressbar");
		ring.setAttribute("aria-label", "loading");
		for (var i = 0; i < 16; i++) {
			var dot = document.createElement("i");
			dot.style.setProperty("transform", "rotate(" + i * 22.5 + "deg) translateY(-430%)");
			dot.style.setProperty("animation-delay", (i * 0.1).toFixed(2) + "s");
			ring.appendChild(dot);
		}
		return ring;
	}

	/* ---------- display cards ---------- */

	function activeMode(item, idx) {
		if (!item.modes.length) return null;
		var r = (rotIdx[idx] || 0) % item.modes.length;
		return item.modes[r];
	}

	function renderValues() {
		var values = MW.store.get("values");
		var config = MW.store.get("config");
		Array.prototype.forEach.call(grid.children, function (card, idx) {
			if (!card.classList.contains("card")) return;
			var item = config.items[idx];
			if (!item) return;
			var mode = activeMode(item, idx);
			var label = card.querySelector(".card-label-text");
			var valueEl = card.querySelector(".card-value");
			var descEl = card.querySelector(".card-desc");
			if (!mode) return; // hint state
			var w = MW.widgets[mode];
			var v = values[mode];
			label.textContent = w.name;
			descEl.textContent = w.desc;
			if (v === undefined) {
				if (!valueEl.querySelector(".ring")) {
					valueEl.textContent = "";
					valueEl.appendChild(makeRing());
				}
				return;
			}
			var ring = valueEl.querySelector(".ring");
			if (ring) ring.remove();
			var text = w.format(v);
			if (valueEl.textContent !== text) {
				valueEl.textContent = text;
				// auto-fit: monospace advance ~0.6em, CSS scales font by char count
				valueEl.style.setProperty("--chars", String(text.length));
				if (mode === "blockHeight" && lastHeight !== null && v !== lastHeight) {
					valueEl.classList.remove("flash");
					void valueEl.offsetWidth; // restart animation
					valueEl.classList.add("flash");
				}
			}
		});
		lastHeight = values.blockHeight !== undefined ? values.blockHeight : lastHeight;
	}

	function renderStaleness() {
		var updatedAt = MW.store.get("updatedAt") || {};
		var now = Date.now();
		// chain widgets stale after 2x10s; price widgets after 2x30s
		var budgets = { blockHeight: 20000, hashrate: 20000, blockReward: 20000, price: 60000, piconeroPerDollar: 60000, xmrBtc: 60000 };
		var config = MW.store.get("config");
		Array.prototype.forEach.call(grid.children, function (card, idx) {
			if (!card.classList.contains("card")) return;
			var item = config.items[idx];
			var mode = item && activeMode(item, idx);
			if (!mode) return;
			var at = updatedAt[mode] || 0;
			card.classList.toggle("stale", at > 0 && now - at > budgets[mode]);
		});
	}

	function buildModePicker(idx) {
		var pop = document.createElement("div");
		pop.className = "mode-pop";
		pop.setAttribute("role", "menu");
		var h = document.createElement("h3");
		h.textContent = "modes for this display";
		pop.appendChild(h);

		var config = MW.store.get("config");
		var item = config.items[idx];

		MW.widgetIds.forEach(function (id) {
			var row = document.createElement("div");
			row.className = "mode-row";
			var cb = document.createElement("input");
			cb.type = "checkbox";
			cb.id = "mode-" + idx + "-" + id;
			cb.checked = item.modes.indexOf(id) !== -1;
			var label = document.createElement("label");
			label.setAttribute("for", cb.id);
			var w = MW.widgets[id];
			label.innerHTML = "";
			label.appendChild(document.createTextNode(w.name));
			var d = document.createElement("span");
			d.className = "mode-desc";
			d.textContent = w.desc;
			label.appendChild(d);
			cb.addEventListener("change", function () {
				var c = MW.store.get("config");
				var modes = c.items[idx].modes;
				var at = modes.indexOf(id);
				if (at === -1) modes.push(id);
				else modes.splice(at, 1);
				rotIdx[idx] = 0;
				MW.store.setConfig(c);
			});
			row.appendChild(cb);
			row.appendChild(label);
			pop.appendChild(row);
		});
		return pop;
	}

	function togglePicker(card, idx) {
		var existing = card.querySelector(".mode-pop");
		if (existing) {
			existing.remove();
			card.classList.remove("picker-open");
			openPicker = -1;
			return;
		}
		closeAllPickers();
		card.appendChild(buildModePicker(idx));
		card.classList.add("picker-open");
		openPicker = idx;
	}

	function closeAllPickers() {
		Array.prototype.forEach.call(grid.querySelectorAll(".mode-pop"), function (p) {
			p.remove();
		});
		Array.prototype.forEach.call(grid.querySelectorAll(".card.picker-open"), function (c) {
			c.classList.remove("picker-open");
		});
		openPicker = -1;
	}

	function makeCard(item, idx) {
		var card = document.createElement("section");
		card.className = "card";
		card.setAttribute("tabindex", "-1");

		var head = document.createElement("div");
		head.className = "card-head";

		var label = document.createElement("span");
		label.className = "card-label";
		var staleDot = document.createElement("i");
		staleDot.className = "stale-dot";
		staleDot.title = "data is stale";
		var labelText = document.createElement("span");
		labelText.className = "card-label-text";
		label.appendChild(staleDot);
		label.appendChild(labelText);

		var controls = document.createElement("div");
		controls.className = "card-controls";

		var btnModes = document.createElement("button");
		btnModes.type = "button";
		btnModes.className = "icon-btn";
		btnModes.setAttribute("aria-label", "Choose modes for this display");
		btnModes.appendChild(icon(ICON_MODES));
		btnModes.addEventListener("click", function (e) {
			e.stopPropagation();
			togglePicker(card, idx);
		});

		var btnMax = document.createElement("button");
		btnMax.type = "button";
		btnMax.className = "icon-btn";
		btnMax.setAttribute("aria-label", "Maximize display");
		btnMax.appendChild(icon(ICON_COG));
		btnMax.addEventListener("click", function () {
			enterFullscreen(idx);
		});

		var btnRemove = document.createElement("button");
		btnRemove.type = "button";
		btnRemove.className = "icon-btn";
		btnRemove.setAttribute("aria-label", "Remove this display");
		btnRemove.appendChild(icon(ICON_X));
		btnRemove.addEventListener("click", function () {
			var c = MW.store.get("config");
			c.items.splice(idx, 1);
			MW.store.setConfig(c);
		});

		controls.appendChild(btnModes);
		controls.appendChild(btnMax);
		controls.appendChild(btnRemove);

		head.appendChild(label);
		head.appendChild(controls);

		var valueEl = document.createElement("div");
		valueEl.className = "card-value";

		var desc = document.createElement("div");
		desc.className = "card-desc";

		card.appendChild(head);
		card.appendChild(valueEl);
		card.appendChild(desc);

		if (!item.modes.length) {
			var hint = document.createElement("div");
			hint.className = "card-hint";
			hint.textContent = "click the modes icon to configure";
			card.insertBefore(hint, desc);
		}
		return card;
	}

	function renderGrid() {
		closeAllPickers();
		grid.innerHTML = "";
		var config = MW.store.get("config");
		if (!config.items.length) {
			var empty = document.createElement("div");
			empty.className = "empty-state";
			var btn = document.createElement("button");
			btn.type = "button";
			btn.textContent = "Add a display";
			btn.addEventListener("click", addDisplay);
			empty.appendChild(btn);
			grid.appendChild(empty);
			return;
		}
		config.items.forEach(function (item, idx) {
			grid.appendChild(makeCard(item, idx));
		});
		renderValues();
		renderStaleness();
	}

	function addDisplay() {
		var c = MW.store.get("config");
		c.items.push({ modes: [] });
		MW.store.setConfig(c);
		// auto-open the picker on the new card
		var cards = grid.querySelectorAll(".card");
		if (cards.length) togglePicker(cards[cards.length - 1], c.items.length - 1);
	}

	/* ---------- fullscreen ---------- */

	function enterFullscreen(idx) {
		exitFullscreen();
		var card = grid.children[idx];
		if (!card || !card.classList.contains("card")) return;
		fullscreenIdx = idx;
		card.classList.add("fullscreen");
		var btn = card.querySelector('.card-controls .icon-btn[aria-label^="Maximize"]');
		if (btn) {
			btn.innerHTML = "";
			btn.appendChild(icon(ICON_SHRINK));
			btn.setAttribute("aria-label", "Exit fullscreen");
		}
		card.focus();
	}

	function exitFullscreen() {
		if (fullscreenIdx === -1) return;
		var card = grid.children[fullscreenIdx];
		if (card && card.classList.contains("card")) {
			card.classList.remove("fullscreen");
			var btn = card.querySelector('.card-controls .icon-btn[aria-label^="Exit"]');
			if (btn) {
				btn.innerHTML = "";
				btn.appendChild(icon(ICON_COG));
				btn.setAttribute("aria-label", "Maximize display");
			}
		}
		fullscreenIdx = -1;
	}

	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") {
			exitFullscreen();
			closeAllPickers();
			closeSettings();
		}
	});

	document.addEventListener("click", function (e) {
		if (openPicker !== -1 && !e.target.closest(".card")) closeAllPickers();
	});

	/* ---------- footer status ---------- */

	function renderStatus() {
		var st = MW.store.get("status");
		var nodeHost = MW.store.get("nodeUrl").replace(/^https?:\/\//, "");
		function mark(ok) {
			return ok === null ? "…" : ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>';
		}
		// spans let CSS drop the hostname / source name on narrow screens
		footStatus.innerHTML =
			"chain <span class=\"st-node\">" + nodeHost + "</span> " + mark(st.chain.ok) +
			" · price <span class=\"st-src\">" + (st.price.source || "—") + "</span> " + mark(st.price.ok);

		var c = st.chain.ok, p = st.price.ok;
		netDot.className = "net-dot " + (c && p ? "ok" : c === false && p === false ? "down" : "degraded");
	}

	/* ---------- marquee facts ---------- */

	var factIdx = 0;
	function rotateFact() {
		marquee.classList.add("faded");
		setTimeout(function () {
			factIdx = (factIdx + 1) % FACTS.length;
			marquee.textContent = FACTS[factIdx];
			marquee.classList.remove("faded");
		}, 400);
	}

	/* ---------- settings popover ---------- */

	var settingsPop = null;
	function closeSettings() {
		if (settingsPop) settingsPop.remove();
		settingsPop = null;
	}

	function openSettings() {
		closeSettings();
		var pop = document.createElement("div");
		pop.className = "settings-pop";
		pop.setAttribute("role", "dialog");
		pop.setAttribute("aria-label", "Settings");

		var h = document.createElement("h2");
		h.textContent = "node settings";
		pop.appendChild(h);

		var label = document.createElement("label");
		label.setAttribute("for", "node-url");
		label.textContent = "monerod json-rpc node";
		pop.appendChild(label);

		var input = document.createElement("input");
		input.id = "node-url";
		input.type = "text";
		input.spellcheck = false;
		input.value = MW.store.get("nodeUrl");
		pop.appendChild(input);

		var hint = document.createElement("div");
		hint.className = "hint";
		hint.textContent =
			"public nodes see your IP. run your own monerod and point here — applies on next poll.";
		pop.appendChild(hint);

		var row = document.createElement("div");
		row.className = "row";

		var save = document.createElement("button");
		save.type = "button";
		save.textContent = "save";
		save.addEventListener("click", function () {
			var url = input.value.trim();
			if (url) MW.store.setNodeUrl(url);
			closeSettings();
			renderStatus();
		});

		var reset = document.createElement("button");
		reset.type = "button";
		reset.textContent = "reset layout";
		reset.addEventListener("click", function () {
			MW.store.resetConfig();
			closeSettings();
		});

		row.appendChild(save);
		row.appendChild(reset);
		pop.appendChild(row);

		document.getElementById("nav").appendChild(pop);
		settingsPop = pop;
		input.focus();
		input.select();
	}

	/* ---------- init ---------- */

	document.getElementById("btn-add").addEventListener("click", addDisplay);
	document.getElementById("btn-settings").addEventListener("click", function (e) {
		e.stopPropagation();
		if (settingsPop) closeSettings();
		else openSettings();
	});

	MW.store.subscribe("config", renderGrid);
	MW.store.subscribe("values", renderValues);
	MW.store.subscribe("status", renderStatus);
	MW.store.subscribe("pulse", function () {
		var config = MW.store.get("config");
		config.items.forEach(function (item, idx) {
			if (item.modes.length > 1) {
				rotIdx[idx] = ((rotIdx[idx] || 0) + 1) % item.modes.length;
			}
		});
		renderValues();
		renderStaleness();
	});

	// pause when tab hidden — no point polling a screen nobody is watching
	document.addEventListener("visibilitychange", function () {
		if (document.hidden) MW.poller.stop();
		else MW.poller.start();
	});

	// installable PWA: register the offline shell (needs http(s), not file://)
	if ("serviceWorker" in navigator && location.protocol !== "file:") {
		navigator.serviceWorker.register("./sw.js").catch(function () {});
	}

	marquee.textContent = FACTS[0];
	setInterval(rotateFact, MARQUEE_MS);
	setInterval(function () {
		MW.store.tickPulse();
	}, PULSE_MS);

	renderGrid();
	renderStatus();
	MW.poller.start();
})(window.MW);
