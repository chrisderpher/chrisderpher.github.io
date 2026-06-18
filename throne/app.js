(function () {
	"use strict";

	const DATA_PATH = "/data/throne.json";
	const LOCAL_DATA_PATH = "../data/throne.json";
	const SVG_NS = "http://www.w3.org/2000/svg";
	let activeChartView = "value";
	let activeHistory = null;
	let chartResizeTimer = null;

	const FALLBACK_DATA = {
		startingCash: 10000,
		lastUpdated: null,
		currentKing: {
			name: "Awaiting first crown",
			symbol: "---",
			marketCap: null,
			price: null,
			fakeSharesHeld: null,
			portfolioValue: null,
			heldSince: null
		},
		crown: {
			startingCash: 10000,
			currentValue: null,
			returnSinceStart: null,
			returnPercent: null
		},
		challengers: [],
		chronicle: [],
		history: {
			snapshots: []
		}
	};

	document.addEventListener("DOMContentLoaded", () => {
		setupChartControls();
		setupChartResize();
		loadThroneData()
			.then((data) => {
				renderDashboard(data);
			})
			.catch((error) => {
				console.warn(error);
				renderDashboard(FALLBACK_DATA);
				setStatus("Unable to load throne data yet. Showing a safe empty-state dashboard.");
			});
	});

	async function loadThroneData() {
		try {
			return await fetchJson(DATA_PATH);
		} catch (error) {
			if (window.location.protocol !== "file:") {
				throw error;
			}
			return fetchJson(LOCAL_DATA_PATH);
		}
	}

	async function fetchJson(path) {
		const response = await fetch(path, { cache: "no-store" });
		if (!response.ok) {
			throw new Error(`Could not load ${path}: ${response.status}`);
		}
		return response.json();
	}

	function renderDashboard(rawData) {
		const data = normalizeData(rawData);
		const king = data.currentKing;

		setText("hero-king-name", king.name);
		setText("king-ticker-badge", king.symbol);
		setText("king-name", king.name);
		setText("king-symbol", king.symbol);
		setText("king-market-cap", formatMarketCap(king.marketCap));
		setText("king-price", formatCurrency(king.price));
		setText("king-shares", formatShares(king.fakeSharesHeld));
		setText("king-value", formatCurrency(king.portfolioValue));
		setDate("held-since", king.heldSince);
		setDateTime("last-updated", data.lastUpdated);

		const crown = data.crown;
		setText("starting-cash", formatCurrency(crown.startingCash));
		setText("portfolio-value", formatCurrency(crown.currentValue));
		setText("return-value", formatSignedCurrency(crown.returnSinceStart));

		const returnPercent = document.getElementById("return-percent");
		returnPercent.textContent = formatSignedPercent(crown.returnPercent);
		returnPercent.classList.toggle("is-positive", Number(crown.returnPercent) > 0);
		returnPercent.classList.toggle("is-negative", Number(crown.returnPercent) < 0);

		renderChallengers(data.challengers);
		renderChronicle(data.chronicle);
		activeHistory = data.history;
		renderBenchmarkChart(activeHistory);
	}

	function normalizeData(data) {
		const merged = { ...FALLBACK_DATA, ...(data || {}) };
		const currentKing = { ...FALLBACK_DATA.currentKing, ...(merged.currentKing || {}) };
		const startingCash = numberOrFallback(merged.startingCash, FALLBACK_DATA.startingCash);
		const crown = {
			...FALLBACK_DATA.crown,
			...(merged.crown || {}),
			startingCash
		};

		if (crown.currentValue == null && currentKing.portfolioValue != null) {
			crown.currentValue = currentKing.portfolioValue;
		}

		if (crown.returnSinceStart == null && crown.currentValue != null) {
			crown.returnSinceStart = Number(crown.currentValue) - startingCash;
		}

		if (crown.returnPercent == null && crown.returnSinceStart != null && startingCash > 0) {
			crown.returnPercent = Number(crown.returnSinceStart) / startingCash;
		}

		return {
			...merged,
			currentKing,
			crown,
			challengers: Array.isArray(merged.challengers) ? merged.challengers : [],
			chronicle: Array.isArray(merged.chronicle) ? merged.chronicle : [],
			history: normalizeHistory(merged.history)
		};
	}

	function normalizeHistory(history) {
		const snapshots = Array.isArray(history && history.snapshots)
			? history.snapshots
				.map(normalizeSnapshot)
				.filter(Boolean)
				.sort((a, b) => a.date.localeCompare(b.date))
			: [];

		return {
			...(history || {}),
			snapshots
		};
	}

	function normalizeSnapshot(snapshot) {
		if (!snapshot || !snapshot.date) {
			return null;
		}

		const required = ["strategyValue", "spyValue", "qqqValue", "excessVsSpy", "excessVsQqq"];
		if (!required.every((key) => isFiniteNumber(snapshot[key]))) {
			return null;
		}

		return {
			...snapshot,
			strategyValue: Number(snapshot.strategyValue),
			spyValue: Number(snapshot.spyValue),
			qqqValue: Number(snapshot.qqqValue),
			excessVsSpy: Number(snapshot.excessVsSpy),
			excessVsQqq: Number(snapshot.excessVsQqq)
		};
	}

	function renderChallengers(challengers) {
		const tbody = document.getElementById("challengers-body");
		tbody.replaceChildren();

		const rows = challengers
			.slice()
			.sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999))
			.slice(0, 10);

		if (!rows.length) {
			const row = document.createElement("tr");
			const cell = document.createElement("td");
			cell.colSpan = 4;
			cell.textContent = "No challenger data has been published yet.";
			row.append(cell);
			tbody.append(row);
			return;
		}

		rows.forEach((company, index) => {
			const row = document.createElement("tr");
			addCell(row, company.rank || index + 1, "Rank");
			addCell(row, company.name || "Unknown company", "Company");
			addCell(row, company.symbol || "---", "Ticker");
			addCell(row, formatMarketCap(company.marketCap), "Market cap");
			tbody.append(row);
		});
	}

	function renderChronicle(entries) {
		const list = document.getElementById("chronicle-list");
		list.replaceChildren();

		if (!entries.length) {
			const item = document.createElement("li");
			item.textContent = "No succession reviews have been recorded yet.";
			list.append(item);
			return;
		}

		entries.slice(0, 8).forEach((entry) => {
			const item = document.createElement("li");
			const time = document.createElement("time");
			time.dateTime = entry.date || "";
			time.textContent = entry.date ? formatDate(entry.date) : "Unknown date";
			const eventType = entry.eventType || "rotation";
			let summary;
			if (eventType === "review") {
				summary = `${entry.to || entry.from || "---"} retained the throne`;
			} else if (eventType === "assignment") {
				summary = `${entry.to || "---"} received the throne`;
			} else {
				summary = `${entry.from || "CASH"} -> ${entry.to || "---"}`;
			}
			item.append(time, ` - ${summary} - ${entry.note || "Monthly succession review."}`);
			list.append(item);
		});
	}

	function setupChartControls() {
		const controls = document.querySelectorAll("[data-chart-view]");
		const activeControl = document.querySelector("[data-chart-view].is-active");
		activeChartView = (activeControl && activeControl.dataset.chartView) || activeChartView;

		controls.forEach((button) => {
			button.addEventListener("click", () => {
				activeChartView = button.dataset.chartView || "excess";
				controls.forEach((control) => {
					const isActive = control === button;
					control.classList.toggle("is-active", isActive);
					control.setAttribute("aria-pressed", String(isActive));
				});
				renderBenchmarkChart(activeHistory);
			});
		});
	}

	function setupChartResize() {
		window.addEventListener("resize", () => {
			window.clearTimeout(chartResizeTimer);
			chartResizeTimer = window.setTimeout(() => {
				renderBenchmarkChart(activeHistory);
			}, 120);
		});
	}

	function renderBenchmarkChart(history) {
		const snapshots = history && Array.isArray(history.snapshots) ? history.snapshots : [];
		const chart = document.getElementById("benchmark-chart");
		const empty = document.getElementById("chart-empty");
		chart.replaceChildren();

		if (!snapshots.length) {
			empty.hidden = false;
			setText("chart-strategy-value", "---");
			setText("chart-spy-delta", "---");
			setText("chart-qqq-delta", "---");
			empty.textContent = "Benchmark history has not been published yet.";
			setText("chart-context", empty.textContent);
			return;
		}

		const latest = snapshots[snapshots.length - 1];
		setText("chart-strategy-label", "Throne");
		setText("chart-strategy-value", formatCurrency(latest.strategyValue));
		setSignedMetric("chart-spy-delta", latest.excessVsSpy);
		setSignedMetric("chart-qqq-delta", latest.excessVsQqq);
		setText("chart-context", chartContext(snapshots));

		if (snapshots.length < 2) {
			empty.hidden = false;
			empty.textContent = `The chart needs at least two daily snapshots. The first point was recorded on ${formatDate(latest.date)}.`;
			return;
		}

		empty.hidden = true;
		empty.textContent = "";
		drawChart(chart, snapshots, activeChartView);
	}

	function chartContext(snapshots) {
		const latest = snapshots[snapshots.length - 1];
		return `Throne-method tracking from March 31, 2026 (My birthday!) through ${formatDate(latest.date)}. All three portfolios began with exactly $10,000.`;
	}

	function drawChart(chart, snapshots, view) {
		const width = Math.max(Math.round(chart.getBoundingClientRect().width), 280);
		const height = 320;
		const margin = { top: 30, right: 30, bottom: 46, left: 84 };
		chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const series = chartSeries(view);
		const values = series.flatMap((line) => snapshots.map((snapshot) => snapshot[line.key]).filter(isFiniteNumber));

		if (view === "excess") {
			values.push(0);
		}

		const domain = paddedDomain(values);
		const xFor = (index) => margin.left + (snapshots.length === 1 ? 0 : (index / (snapshots.length - 1)) * plotWidth);
		const yFor = (value) => margin.top + (1 - ((value - domain.min) / (domain.max - domain.min))) * plotHeight;

		drawGrid(chart, width, height, margin, plotWidth, plotHeight, domain, yFor, view);
		drawLegend(chart, series, margin, plotWidth);

		series.forEach((line) => {
			const path = document.createElementNS(SVG_NS, "path");
			path.setAttribute("class", `chart-line ${line.className}`);
			path.setAttribute("d", linePath(snapshots, line.key, xFor, yFor));
			chart.append(path);
		});

		drawXAxisLabels(chart, snapshots, margin, height, plotWidth);
	}

	function chartSeries(view) {
		if (view === "value") {
			return [
				{ key: "strategyValue", className: "strategy", label: "Throne" },
				{ key: "spyValue", className: "spy", label: "SPY" },
				{ key: "qqqValue", className: "qqq", label: "QQQ" }
			];
		}

		return [
			{ key: "excessVsSpy", className: "excess-spy", label: "Throne - SPY" },
			{ key: "excessVsQqq", className: "excess-qqq", label: "Throne - QQQ" }
		];
	}

	function paddedDomain(values) {
		const finite = values.map(Number).filter(Number.isFinite);
		let min = Math.min(...finite);
		let max = Math.max(...finite);
		if (min === max) {
			min -= 1;
			max += 1;
		}
		const padding = (max - min) * 0.12;
		return {
			min: min - padding,
			max: max + padding
		};
	}

	function drawGrid(chart, width, height, margin, plotWidth, plotHeight, domain, yFor, view) {
		const axis = svgEl("path", {
			class: "chart-axis",
			d: `M ${margin.left} ${margin.top} V ${height - margin.bottom} H ${width - margin.right}`
		});
		chart.append(axis);

		for (let index = 0; index <= 4; index += 1) {
			const value = domain.min + ((domain.max - domain.min) * index / 4);
			const y = yFor(value);
			chart.append(svgEl("line", {
				class: "chart-gridline",
				x1: margin.left,
				x2: margin.left + plotWidth,
				y1: y,
				y2: y
			}));
			chart.append(svgEl("text", {
				class: "chart-label",
				x: margin.left - 10,
				y: y + 4,
				"text-anchor": "end"
			}, formatCompactCurrency(value)));
		}

		if (view === "excess" && domain.min < 0 && domain.max > 0) {
			const y = yFor(0);
			chart.append(svgEl("line", {
				class: "chart-zero",
				x1: margin.left,
				x2: margin.left + plotWidth,
				y1: y,
				y2: y
			}));
		}

		for (let index = 0; index <= 3; index += 1) {
			const x = margin.left + (plotWidth * index / 3);
			chart.append(svgEl("line", {
				class: "chart-gridline",
				x1: x,
				x2: x,
				y1: margin.top,
				y2: margin.top + plotHeight
			}));
		}
	}

	function drawLegend(chart, series, margin, plotWidth) {
		const segmentWidth = plotWidth / series.length;
		series.forEach((line, index) => {
			const x = margin.left + segmentWidth * index;
			chart.append(svgEl("line", {
				class: `chart-line ${line.className}`,
				x1: x,
				x2: x + 18,
				y1: 17,
				y2: 17
			}));
			chart.append(svgEl("text", {
				class: "chart-legend",
				x: x + 25,
				y: 21
			}, line.label));
		});
	}

	function drawXAxisLabels(chart, snapshots, margin, height, plotWidth) {
		const first = snapshots[0];
		const latest = snapshots[snapshots.length - 1];
		if (isBirthdayDate(first.date)) {
			chart.append(svgEl("text", {
				class: "chart-label",
				x: margin.left,
				y: height - 27
			}, formatPlainDate(first.date)));
			chart.append(svgEl("text", {
				class: "chart-label",
				x: margin.left,
				y: height - 11
			}, "(My birthday!)"));
		} else {
			chart.append(svgEl("text", {
				class: "chart-label",
				x: margin.left,
				y: height - 14
			}, formatDate(first.date)));
		}
		chart.append(svgEl("text", {
			class: "chart-label",
			x: margin.left + plotWidth,
			y: height - 11,
			"text-anchor": "end"
		}, formatDate(latest.date)));
	}

	function linePath(snapshots, key, xFor, yFor) {
		return snapshots
			.map((snapshot, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(snapshot[key]).toFixed(2)}`)
			.join(" ");
	}

	function svgEl(tag, attributes, text) {
		const element = document.createElementNS(SVG_NS, tag);
		Object.entries(attributes).forEach(([key, value]) => {
			element.setAttribute(key, value);
		});
		if (text != null) {
			element.textContent = text;
		}
		return element;
	}

	function addCell(row, value, label) {
		const cell = document.createElement("td");
		cell.dataset.label = label;
		cell.textContent = value;
		row.append(cell);
	}

	function setStatus(message) {
		const status = document.getElementById("data-status");
		status.textContent = message;
		status.hidden = false;
	}

	function setText(id, value) {
		const element = document.getElementById(id);
		element.textContent = value == null || value === "" ? "---" : String(value);
	}

	function setSignedMetric(id, value) {
		const element = document.getElementById(id);
		element.textContent = formatSignedCurrency(value);
		element.classList.toggle("is-positive", Number(value) > 0);
		element.classList.toggle("is-negative", Number(value) < 0);
	}

	function setDate(id, value) {
		const element = document.getElementById(id);
		if (!value) {
			element.textContent = "---";
			element.removeAttribute("datetime");
			return;
		}
		element.dateTime = value;
		element.textContent = formatDate(value);
	}

	function setDateTime(id, value) {
		const element = document.getElementById(id);
		if (!value) {
			element.textContent = "---";
			element.removeAttribute("datetime");
			return;
		}
		element.dateTime = value;
		element.textContent = formatDateTime(value);
	}

	function formatCurrency(value) {
		if (!isFiniteNumber(value)) {
			return "---";
		}
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: 2
		}).format(Number(value));
	}

	function formatSignedCurrency(value) {
		if (!isFiniteNumber(value)) {
			return "---";
		}
		const amount = Number(value);
		const formatted = formatCurrency(Math.abs(amount));
		return `${amount >= 0 ? "+" : "-"}${formatted}`;
	}

	function formatMarketCap(value) {
		if (!isFiniteNumber(value)) {
			return "---";
		}
		const amount = Number(value);
		if (amount >= 1e12) {
			return `$${(amount / 1e12).toFixed(2)}T`;
		}
		if (amount >= 1e9) {
			return `$${(amount / 1e9).toFixed(2)}B`;
		}
		return formatCurrency(amount);
	}

	function formatShares(value) {
		if (!isFiniteNumber(value)) {
			return "---";
		}
		return new Intl.NumberFormat("en-US", {
			maximumFractionDigits: 6
		}).format(Number(value));
	}

	function formatCompactCurrency(value) {
		if (!isFiniteNumber(value)) {
			return "---";
		}
		const amount = Number(value);
		const sign = amount < 0 ? "-" : "";
		const absolute = Math.abs(amount);
		if (absolute >= 1000) {
			return `${sign}$${(absolute / 1000).toFixed(1)}k`;
		}
		return `${sign}$${absolute.toFixed(0)}`;
	}

	function formatSignedPercent(value) {
		if (!isFiniteNumber(value)) {
			return "";
		}
		const percent = Number(value);
		return `(${percent >= 0 ? "+" : ""}${(percent * 100).toFixed(2)}%)`;
	}

	function formatDate(value) {
		const formatted = formatPlainDate(value);
		return isBirthdayDate(value) ? `${formatted} (My birthday!)` : formatted;
	}

	function formatPlainDate(value) {
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			const [year, month, day] = value.split("-").map(Number);
			return new Intl.DateTimeFormat("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric"
			}).format(new Date(year, month - 1, day));
		}

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return value;
		}
		return new Intl.DateTimeFormat("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric"
		}).format(date);
	}

	function isBirthdayDate(value) {
		return /^\d{4}-03-31$/.test(String(value));
	}

	function formatDateTime(value) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return value;
		}
		return new Intl.DateTimeFormat("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			timeZoneName: "short"
		}).format(date);
	}

	function numberOrFallback(value, fallback) {
		return isFiniteNumber(value) ? Number(value) : fallback;
	}

	function isFiniteNumber(value) {
		return value !== null && value !== "" && Number.isFinite(Number(value));
	}
})();
