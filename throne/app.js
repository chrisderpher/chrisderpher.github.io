(function () {
	"use strict";

	const SVG_NS = "http://www.w3.org/2000/svg";
	const MARKET_TIME_ZONE = "America/New_York";
	const VALUE_SERIES = [
		{ key: "strategyValue", className: "strategy", label: "Throne" },
		{ key: "spyValue", className: "spy", label: "SPY" },
		{ key: "qqqValue", className: "qqq", label: "QQQ" }
	];
	const EXCESS_SERIES = [
		{ key: "excessVsSpy", className: "excess-spy", label: "Throne − SPY" },
		{ key: "excessVsQqq", className: "excess-qqq", label: "Throne − QQQ" }
	];
	let snapshots = [];
	let startingCash = 10000;
	let activeView = "value";
	let selectedIndex = 0;
	let chartLayout = null;
	let resizeTimer;

	document.addEventListener("DOMContentLoaded", () => {
		setupControls();
		loadData().then(renderDashboard).catch((error) => {
			console.warn("Throne data could not be loaded.", error);
			renderDashboard({});
			const status = document.getElementById("data-status");
			status.textContent = "Unable to load throne data. The dashboard will return when data is available.";
			status.hidden = false;
		});
	});

	async function loadData() {
		let response;
		try {
			response = await fetch("/data/throne.json", { cache: "no-store" });
		} catch (error) {
			if (window.location.protocol !== "file:") throw error;
			response = await fetch("../data/throne.json", { cache: "no-store" });
		}
		if (!response.ok) throw new Error(`Data request returned ${response.status}.`);
		const data = await response.json();
		if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid throne data.");
		return data;
	}

	function renderDashboard(data) {
		const king = data.currentKing || {};
		const crown = data.crown || {};
		startingCash = positiveNumber(data.startingCash) || positiveNumber(crown.startingCash) || 10000;
		snapshots = marketSnapshots(data.history);
		selectedIndex = Math.max(0, snapshots.length - 1);
		const latest = snapshots[selectedIndex];
		const value = finiteNumber(crown.currentValue) ? Number(crown.currentValue) : king.portfolioValue;
		const profit = finiteNumber(value) ? Number(value) - startingCash : null;

		setText("king-name", king.name || "Awaiting first crown");
		setText("king-symbol", king.symbol);
		setText("king-market-cap", formatMarketCap(king.marketCap));
		setText("king-price", formatCurrency(king.price));
		setText("king-shares", formatShares(king.fakeSharesHeld));
		setDate("held-since", king.heldSince);
		setText("starting-cash", formatCurrency(startingCash));
		setText("portfolio-value", formatCurrency(value));
		setSignedMetric("return-value", profit, formatSignedCurrency);
		setSignedMetric("return-percent", finiteNumber(profit) ? profit / startingCash : null, formatSignedPercent);
		setDate("price-date", latest && latest.marketDate);
		setUpdatedDate(data.lastUpdated);
		const issuerCount = Array.isArray(data.candidateUniverse) ? data.candidateUniverse.length : (data.challengers || []).length;
		const initialCash = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(startingCash);
		setText("strategy-summary", `A ${initialCash} simulated portfolio tracking the largest company among ${issuerCount || "the"} tracked issuers.`);
		renderBenchmarkSummary(latest, king.symbol);
		renderChallengers(data.challengers, king);

		const range = document.getElementById("chart-date");
		range.min = "0";
		range.max = String(selectedIndex);
		range.step = "1";
		range.value = String(selectedIndex);
		range.disabled = !snapshots.length;
		const first = snapshots[0];
		setText("chart-period", first ? `${formatDate(first.date)} — ${formatDate(latest.marketDate)}` : "No market history yet");
		setText("chart-freshness", latest ? `Prices as of ${formatDate(latest.marketDate)} market close.` : "");
		document.getElementById("chart-freshness").hidden = !latest;
		drawChart();
	}

	function renderBenchmarkSummary(latest, symbol) {
		setText("chart-strategy-label", symbol ? `Throne · ${symbol}` : "Throne");
		setText("chart-strategy-value", formatCurrency(latest && latest.strategyValue));
		setSignedMetric("chart-strategy-return", latest ? latest.strategyValue / startingCash - 1 : null,
			(value) => finiteNumber(value) ? `${formatSignedPercent(value)} since start` : "---");
		setText("chart-spy-value", formatCurrency(latest && latest.spyValue));
		setText("chart-qqq-value", formatCurrency(latest && latest.qqqValue));
		setSignedMetric("chart-spy-delta", latest && latest.excessVsSpy, formatBenchmarkGap);
		setSignedMetric("chart-qqq-delta", latest && latest.excessVsQqq, formatBenchmarkGap);
	}

	function formatBenchmarkGap(value) {
		if (!finiteNumber(value)) return "---";
		if (Number(value) === 0) return "Level with Throne";
		return `Throne ${Number(value) > 0 ? "ahead" : "behind"} ${formatCurrency(Math.abs(Number(value)))}`;
	}

	function marketSnapshots(history) {
		const byDate = new Map();
		const rows = history && Array.isArray(history.snapshots) ? history.snapshots : [];
		rows.forEach((row) => {
			if (!row || !validDate(row.date)) return;
			const marketDate = row.marketDate || row.date;
			// Carry-forward rows repeat a previous close; they are not new observations.
			if (row.isCarriedForward || marketDate !== row.date) return;
			if (![row.strategyValue, row.spyValue, row.qqqValue].every(positiveNumber)) return;
			const strategyValue = Number(row.strategyValue);
			const spyValue = Number(row.spyValue);
			const qqqValue = Number(row.qqqValue);
			byDate.set(row.date, {
				date: row.date, marketDate, timestamp: Date.parse(`${row.date}T00:00:00Z`),
				strategyValue, spyValue, qqqValue,
				excessVsSpy: strategyValue - spyValue,
				excessVsQqq: strategyValue - qqqValue
			});
		});
		return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
	}

	function renderChallengers(companies, king) {
		const body = document.getElementById("challengers-body");
		body.replaceChildren();
		const ranked = (Array.isArray(companies) ? companies : [])
			.filter((company) => company && positiveNumber(company.marketCap))
			.slice().sort((a, b) => Number(b.marketCap) - Number(a.marketCap));
		const visible = ranked.slice(0, 5);
		setText("challengers-caption", ranked.length ? `Top ${visible.length} of ${ranked.length} tracked issuers` : "Market-cap rankings are not available yet.");
		setText("challengers-gap-label", king.symbol ? `Gap to ${king.symbol}` : "Gap to holder");
		if (!visible.length) {
			const row = document.createElement("tr");
			const cell = addCell(row, "No contender data has been published yet.");
			cell.colSpan = 4;
			body.append(row);
			return;
		}
		const holderCap = positiveNumber(king.marketCap);
		visible.forEach((company, index) => {
			const row = document.createElement("tr");
			row.classList.toggle("is-holder", company.symbol === king.symbol);
			addCell(row, String(index + 1), "rank");
			const companyCell = addCell(row, "", "company");
			companyCell.append(htmlEl("span", "company-name", company.name || "Unknown company"));
			companyCell.append(htmlEl("span", "company-symbol", company.symbol || "---"));
			const track = htmlEl("span", "cap-track");
			track.setAttribute("aria-hidden", "true");
			const fill = htmlEl("span", "cap-fill");
			fill.style.width = `${Number(company.marketCap) / Number(ranked[0].marketCap) * 100}%`;
			track.append(fill);
			companyCell.append(track);
			addCell(row, formatMarketCap(company.marketCap), "market-cap");
			let gap = "---";
			if (company.symbol === king.symbol) gap = "Holder";
			else if (holderCap) {
				const difference = (Number(company.marketCap) / holderCap - 1) * 100;
				gap = difference === 0 ? "Level" : `${Math.abs(difference).toFixed(1)}% ${difference > 0 ? "ahead" : "behind"}`;
			}
			addCell(row, gap, "market-gap");
			body.append(row);
		});
	}

	function setupControls() {
		const buttons = document.querySelectorAll("[data-chart-view]");
		buttons.forEach((button) => button.addEventListener("click", () => {
			activeView = button.dataset.chartView === "excess" ? "excess" : "value";
			buttons.forEach((control) => {
				const active = control.dataset.chartView === activeView;
				control.classList.toggle("is-active", active);
				control.setAttribute("aria-pressed", String(active));
			});
			drawChart();
			const row = snapshots[selectedIndex];
			setText("chart-announcement", `${chartViewDescription()}${row ? ` Inspecting ${formatDate(row.marketDate)}.` : " No market history yet."}`);
		}));
		document.getElementById("chart-date").addEventListener("input", (event) => {
			selectedIndex = clampIndex(Number(event.target.value));
			showInspection(selectedIndex, true);
		});
		const chart = document.getElementById("benchmark-chart");
		chart.addEventListener("pointermove", (event) => {
			const index = pointerIndex(event);
			if (index !== null) showInspection(index, false);
		});
		chart.addEventListener("pointerdown", (event) => {
			const index = pointerIndex(event);
			if (index !== null) {
				selectedIndex = index;
				showInspection(index, true);
			}
		});
		chart.addEventListener("pointerleave", () => showInspection(selectedIndex, false));
		window.addEventListener("resize", () => {
			window.clearTimeout(resizeTimer);
			resizeTimer = window.setTimeout(drawChart, 100);
		});
	}

	function drawChart() {
		const chart = document.getElementById("benchmark-chart");
		const empty = document.getElementById("chart-empty");
		chart.replaceChildren();
		chartLayout = null;
		const first = snapshots[0];
		const latest = snapshots[snapshots.length - 1];
		setText("chart-context", first
			? `${chartViewDescription()} Market-close history from ${formatDate(first.date)} through ${formatDate(latest.marketDate)}. All portfolios started with ${formatCurrency(startingCash)}. Use the date slider to inspect every available market close.`
			: `${chartViewDescription()} Benchmark history has not been published yet.`);
		empty.hidden = snapshots.length >= 2;
		if (snapshots.length < 2) {
			empty.textContent = snapshots.length
				? `The chart needs a second market close. The first was ${formatDate(snapshots[0].date)}.`
				: "Benchmark history has not been published yet.";
			showInspection(selectedIndex, false);
			return;
		}
		const width = Math.max(200, Math.round(chart.getBoundingClientRect().width));
		const height = 280;
		const margin = { left: width < 420 ? 49 : 59, right: 12, top: 28, bottom: 45 };
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const series = activeView === "value" ? VALUE_SERIES : EXCESS_SERIES;
		const values = series.flatMap((line) => snapshots.map((row) => row[line.key]));
		if (activeView === "excess") values.push(0);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const padding = Math.max((max - min) * 0.12, 1);
		const low = min - padding;
		const high = max + padding;
		const firstTime = snapshots[0].timestamp;
		const duration = snapshots[snapshots.length - 1].timestamp - firstTime;
		const xFor = (row) => margin.left + (row.timestamp - firstTime) / duration * plotWidth;
		const yFor = (value) => margin.top + (high - value) / (high - low) * plotHeight;
		chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
		chartLayout = { width, height, margin, plotWidth, plotHeight, series, xFor, yFor };
		chart.append(svgEl("text", { class: "chart-label", x: margin.left, y: 12 },
			activeView === "value" ? "Portfolio value (USD)" : "Lead / shortfall (USD)"));

		for (let tick = 0; tick <= 4; tick += 1) {
			const value = low + (high - low) * tick / 4;
			const y = yFor(value);
			chart.append(svgEl("line", { class: "chart-gridline", x1: margin.left, x2: width - margin.right, y1: y, y2: y }));
			chart.append(svgEl("text", { class: "chart-label", x: margin.left - 9, y: y + 4, "text-anchor": "end" }, formatCompactCurrency(value)));
		}
		chart.append(svgEl("path", { class: "chart-axis", d: `M ${margin.left} ${margin.top} V ${height - margin.bottom} H ${width - margin.right}` }));
		if (activeView === "excess") {
			const y = yFor(0);
			chart.append(svgEl("line", { class: "chart-zero", x1: margin.left, x2: width - margin.right, y1: y, y2: y }));
		}
		series.forEach((line) => {
			const d = snapshots.map((row, index) => `${index ? "L" : "M"} ${xFor(row).toFixed(2)} ${yFor(row[line.key]).toFixed(2)}`).join(" ");
			chart.append(svgEl("path", { class: `chart-line ${line.className}`, d, "aria-hidden": "true" }));
		});
		drawXAxis(chart, width, height, margin, xFor);
		const guide = svgEl("g", { "data-chart-guide": "", "pointer-events": "none", "aria-hidden": "true" });
		chart.append(guide);
		showInspection(selectedIndex, false);
	}

	function chartViewDescription() {
		return activeView === "value"
			? "Portfolio value in USD for Throne, SPY, and QQQ."
			: "Lead or shortfall in USD for Throne minus SPY and Throne minus QQQ.";
	}

	function drawXAxis(chart, width, height, margin, xFor) {
		const first = snapshots[0];
		const last = snapshots[snapshots.length - 1];
		appendDateLabel(chart, first.date, xFor(first), height - 25, "start");
		appendDateLabel(chart, last.date, xFor(last), height - 25, "end");
		if (width >= 580) {
			const middle = snapshots[Math.floor(snapshots.length / 2)];
			appendDateLabel(chart, middle.date, xFor(middle), height - 25, "middle");
		}
	}

	function appendDateLabel(chart, date, x, y, anchor) {
		const label = svgEl("text", { class: "chart-label", x, y, "text-anchor": anchor });
		label.append(svgEl("tspan", { x }, formatPlainDate(date)));
		if (isBirthdayDate(date)) label.append(svgEl("tspan", { x, dy: "15" }, "(my birthday!)"));
		chart.append(label);
	}

	function pointerIndex(event) {
		if (!chartLayout || !snapshots.length) return null;
		const box = event.currentTarget.getBoundingClientRect();
		const x = (event.clientX - box.left) / box.width * chartLayout.width;
		const ratio = Math.max(0, Math.min(1, (x - chartLayout.margin.left) / chartLayout.plotWidth));
		const first = snapshots[0].timestamp;
		const time = first + ratio * (snapshots[snapshots.length - 1].timestamp - first);
		let closest = 0;
		snapshots.forEach((row, index) => {
			if (Math.abs(row.timestamp - time) < Math.abs(snapshots[closest].timestamp - time)) closest = index;
		});
		return closest;
	}

	function showInspection(index, announce) {
		const row = snapshots[clampIndex(index)];
		const range = document.getElementById("chart-date");
		const values = document.getElementById("chart-inspect-values");
		values.replaceChildren();
		setText("chart-inspect-date", row ? formatDate(row.marketDate) : "No market history yet");
		if (!row) {
			range.removeAttribute("aria-valuetext");
			return;
		}
		range.value = String(clampIndex(index));
		const series = activeView === "value" ? VALUE_SERIES : EXCESS_SERIES;
		const descriptions = series.map((line) => {
			const formatted = activeView === "excess" ? formatSignedCurrency(row[line.key]) : formatCurrency(row[line.key]);
			const item = htmlEl("span", line.className);
			item.append(`${line.label} `, htmlEl("strong", "", formatted));
			values.append(item);
			return `${line.label} ${formatted}`;
		});
		const description = `${formatDate(row.marketDate)}. ${descriptions.join(". ")}.`;
		range.setAttribute("aria-valuetext", description);
		if (announce) setText("chart-announcement", description);
		const guide = document.querySelector("[data-chart-guide]");
		if (guide && chartLayout) {
			guide.replaceChildren();
			const x = chartLayout.xFor(row);
			guide.append(svgEl("line", { class: "chart-guide", x1: x, x2: x, y1: chartLayout.margin.top, y2: chartLayout.height - chartLayout.margin.bottom }));
			chartLayout.series.forEach((line) => guide.append(svgEl("circle", {
				class: `chart-marker ${line.className}`, cx: x, cy: chartLayout.yFor(row[line.key]), r: 4
			})));
		}
	}

	function clampIndex(index) {
		return Math.max(0, Math.min(snapshots.length - 1, Math.round(index) || 0));
	}

	function setText(id, value) {
		const element = document.getElementById(id);
		if (element) element.textContent = value == null || value === "" ? "---" : String(value);
	}

	function setSignedMetric(id, value, formatter) {
		const element = document.getElementById(id);
		if (!element) return;
		element.textContent = formatter(value);
		element.classList.toggle("is-positive", finiteNumber(value) && Number(value) > 0);
		element.classList.toggle("is-negative", finiteNumber(value) && Number(value) < 0);
	}

	function setDate(id, value) {
		const element = document.getElementById(id);
		if (!element) return;
		if (validDate(value)) {
			element.setAttribute("datetime", value);
			element.textContent = formatDate(value);
		} else {
			element.removeAttribute("datetime");
			element.textContent = "---";
		}
	}

	function setUpdatedDate(value) {
		const element = document.getElementById("last-updated");
		const date = new Date(value);
		if (!value || Number.isNaN(date.getTime())) {
			element.textContent = "---";
			element.removeAttribute("datetime");
			return;
		}
		const formatter = new Intl.DateTimeFormat("en-US", {
			timeZone: MARKET_TIME_ZONE, year: "numeric", month: "short", day: "numeric",
			hour: "numeric", minute: "2-digit", timeZoneName: "short"
		});
		const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
			timeZone: MARKET_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
		}).formatToParts(date).map((part) => [part.type, part.value]));
		const birthday = parts.month === "03" && parts.day === "31";
		element.setAttribute("datetime", value);
		element.textContent = `${formatter.format(date)}${birthday ? " (my birthday!)" : ""}`;
	}

	function addCell(row, text, className) {
		const cell = htmlEl("td", className || "", text);
		row.append(cell);
		return cell;
	}

	function htmlEl(tag, className, text) {
		const element = document.createElement(tag);
		if (className) element.className = className;
		if (text != null) element.textContent = text;
		return element;
	}

	function svgEl(tag, attributes, text) {
		const element = document.createElementNS(SVG_NS, tag);
		Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
		if (text != null) element.textContent = text;
		return element;
	}

	function formatCurrency(value) {
		return finiteNumber(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value)) : "---";
	}

	function formatSignedCurrency(value) {
		if (!finiteNumber(value)) return "---";
		return `${Number(value) >= 0 ? "+" : "−"}${formatCurrency(Math.abs(Number(value)))}`;
	}

	function formatSignedPercent(value) {
		if (!finiteNumber(value)) return "---";
		return `${Number(value) >= 0 ? "+" : "−"}${Math.abs(Number(value) * 100).toFixed(2)}%`;
	}

	function formatMarketCap(value) {
		if (!finiteNumber(value)) return "---";
		const amount = Number(value);
		if (amount >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
		if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
		return formatCurrency(amount);
	}

	function formatShares(value) {
		return finiteNumber(value) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(Number(value)) : "---";
	}

	function formatCompactCurrency(value) {
		const amount = Number(value);
		const absolute = Math.abs(amount);
		return `${amount < 0 ? "−" : ""}$${absolute >= 1000 ? `${(absolute / 1000).toFixed(1)}k` : absolute.toFixed(0)}`;
	}

	function formatDate(value) {
		return `${formatPlainDate(value)}${isBirthdayDate(value) ? " (my birthday!)" : ""}`;
	}

	function formatPlainDate(value) {
		if (!validDate(value)) return "---";
		return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
			.format(new Date(`${value}T00:00:00Z`));
	}

	function isBirthdayDate(value) {
		return /^\d{4}-03-31$/.test(String(value));
	}

	function validDate(value) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
		const date = new Date(`${value}T00:00:00Z`);
		return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
	}

	function finiteNumber(value) {
		return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
	}

	function positiveNumber(value) {
		return finiteNumber(value) && Number(value) > 0 ? Number(value) : null;
	}
})();
