#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const https = require("node:https");
const path = require("node:path");
const { URL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(REPO_ROOT, "data", "throne.json");
const STARTING_CASH = 10000;
const SUCCESSION_MARGIN = 0.005;
const BACKFILL_DAYS = 90;
const FMP_BASE_URL = "https://financialmodelingprep.com";

const CANDIDATES = [
	{ symbol: "AAPL", fmpSymbol: "AAPL", name: "Apple Inc." },
	{ symbol: "MSFT", fmpSymbol: "MSFT", name: "Microsoft Corporation" },
	{ symbol: "NVDA", fmpSymbol: "NVDA", name: "NVIDIA Corporation" },
	{ symbol: "GOOGL", fmpSymbol: "GOOGL", name: "Alphabet Inc." },
	{ symbol: "GOOG", fmpSymbol: "GOOG", name: "Alphabet Inc." },
	{ symbol: "AMZN", fmpSymbol: "AMZN", name: "Amazon.com, Inc." },
	{ symbol: "META", fmpSymbol: "META", name: "Meta Platforms, Inc." },
	{ symbol: "BRK.B", fmpSymbol: "BRK-B", name: "Berkshire Hathaway Inc." },
	{ symbol: "TSLA", fmpSymbol: "TSLA", name: "Tesla, Inc." },
	{ symbol: "AVGO", fmpSymbol: "AVGO", name: "Broadcom Inc." },
	{ symbol: "LLY", fmpSymbol: "LLY", name: "Eli Lilly and Company" },
	{ symbol: "JPM", fmpSymbol: "JPM", name: "JPMorgan Chase & Co." },
	{ symbol: "V", fmpSymbol: "V", name: "Visa Inc." },
	{ symbol: "XOM", fmpSymbol: "XOM", name: "Exxon Mobil Corporation" }
];

const BENCHMARKS = [
	{ key: "spy", symbol: "SPY", label: "SPY", description: "S&P 500 ETF proxy" },
	{ key: "qqq", symbol: "QQQ", label: "QQQ", description: "Nasdaq-style ETF proxy" }
];

main().catch((error) => {
	console.error(`update-throne failed: ${error.message}`);
	process.exitCode = 1;
});

async function main() {
	const apiKey = process.env.FMP_API_KEY;
	if (!apiKey) {
		throw new Error("Missing FMP_API_KEY environment variable.");
	}

	const now = new Date();
	const existingData = await readExistingData();
	const monthlyMode = isMonthlySuccessionCheck(now, process.argv.slice(2), existingData && existingData.lastSuccessionCheck);
	const [marketData, benchmarkData] = await Promise.all([
		fetchMarketData(apiKey, now, existingData),
		fetchBenchmarkData(apiKey, now)
	]);
	const nextData = buildNextData(existingData, marketData, now, monthlyMode);
	nextData.history = await buildHistory(existingData && existingData.history, nextData, benchmarkData, apiKey, now);

	validateOutput(nextData);
	await writeJsonIfChanged(nextData);

	console.log(`Updated throne data. King: ${nextData.currentKing.symbol}. Monthly succession check: ${monthlyMode ? "yes" : "no"}.`);
}

async function fetchMarketData(apiKey, now, existingData) {
	const fmpSymbols = CANDIDATES.map((candidate) => candidate.fmpSymbol).join(",");
	const [latestPrices, caps] = await Promise.all([
		fetchLatestEodPrices(CANDIDATES.map((candidate) => candidate.fmpSymbol), apiKey, now),
		fetchFmpJson("/stable/market-capitalization-batch", { symbols: fmpSymbols }, apiKey)
	]);

	const capBySymbol = indexBySymbol(Array.isArray(caps) ? caps : []);
	const existingPriceBySymbol = existingPrices(existingData);
	const existingCapBySymbol = existingMarketCaps(existingData);

	return CANDIDATES.map((candidate) => {
		const capRecord = capBySymbol.get(candidate.fmpSymbol);
		const freshPrice = toPositiveNumber(latestPrices.get(candidate.fmpSymbol));
		const fallbackPrice = toPositiveNumber(existingPriceBySymbol.get(candidate.symbol));
		const price = freshPrice || fallbackPrice;
		const freshMarketCap = toPositiveNumber(capRecord && capRecord.marketCap);
		const fallbackMarketCap = toPositiveNumber(existingCapBySymbol.get(candidate.symbol));
		const marketCap = freshMarketCap || fallbackMarketCap;

		if (!price || !marketCap) {
			throw new Error(`Incomplete FMP data for ${candidate.symbol}. Price and market cap are required.`);
		}

		return {
			name: candidate.name,
			symbol: candidate.symbol,
			fmpSymbol: candidate.fmpSymbol,
			marketCap,
			price,
			priceIsFresh: Boolean(freshPrice),
			marketCapIsFresh: Boolean(freshMarketCap)
		};
	});
}

async function fetchLatestEodPrices(symbols, apiKey, now) {
	const fromDate = toDateString(daysBefore(now, 7));
	const toDate = toDateString(now);
	const entries = await Promise.all(symbols.map(async (symbol) => {
		try {
			const prices = await fetchHistoricalPrices(symbol, apiKey, fromDate, toDate);
			const latest = latestPrice(prices);
			return [symbol, latest ? latest.price : null];
		} catch (error) {
			console.warn(`Price refresh skipped for ${symbol}: ${error.message}`);
			return [symbol, null];
		}
	}));

	return new Map(entries);
}

async function fetchBenchmarkData(apiKey, now) {
	const fromDate = toDateString(daysBefore(now, 7));
	const toDate = toDateString(now);

	return Promise.all(BENCHMARKS.map(async (benchmark) => {
		const prices = await fetchHistoricalPrices(benchmark.symbol, apiKey, fromDate, toDate);
		const latest = latestPrice(prices);
		if (!latest) {
			throw new Error(`Incomplete FMP benchmark data for ${benchmark.symbol}. Latest historical close is required.`);
		}

		return {
			...benchmark,
			price: latest.price,
			priceDate: latest.date,
			name: benchmark.description
		};
	}));
}

async function fetchFmpJson(endpoint, params, apiKey) {
	const url = new URL(endpoint, FMP_BASE_URL);
	Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
	url.searchParams.set("apikey", apiKey);

	const response = await fetchUrl(url);
	if (!response.ok) {
		throw new Error(`FMP request failed with HTTP ${response.status}: ${redactApiKey(url)}`);
	}

	try {
		return JSON.parse(response.body);
	} catch (error) {
		throw new Error(`FMP returned invalid JSON for ${redactApiKey(url)}.`);
	}
}

async function fetchUrl(url) {
	if (typeof fetch === "function") {
		const response = await fetch(url);
		return {
			ok: response.ok,
			status: response.status,
			body: await response.text()
		};
	}

	return new Promise((resolve, reject) => {
		https.get(url, (response) => {
			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => {
				body += chunk;
			});
			response.on("end", () => {
				resolve({
					ok: response.statusCode >= 200 && response.statusCode < 300,
					status: response.statusCode,
					body
				});
			});
		}).on("error", reject);
	});
}

async function buildHistory(existingHistory, data, benchmarkData, apiKey, now) {
	const today = toDateString(now);
	let history = normalizeHistory(existingHistory);
	const needsBackfill = !history.snapshots.some((snapshot) => snapshot.phase === "proxy");

	if (needsBackfill) {
		const proxySnapshots = await fetchLightBackfill(data.currentKing.symbol, apiKey, now);
		history.snapshots = mergeSnapshots(history.snapshots, proxySnapshots);
	}

	if (!history.officialBaseline || !history.officialBaseline.startDate) {
		history.officialBaseline = createOfficialBaseline(benchmarkData, today);
	}

	const officialSnapshot = createOfficialSnapshot(data, benchmarkData, history.officialBaseline, today);
	history.snapshots = mergeSnapshots(history.snapshots, [officialSnapshot]);

	return finalizeHistory(history);
}

async function fetchLightBackfill(strategySymbol, apiKey, now) {
	const today = toDateString(now);
	const fromDate = toDateString(daysBefore(now, BACKFILL_DAYS));
	const strategyFmpSymbol = getFmpSymbol(strategySymbol);
	const [strategyPrices, spyPrices, qqqPrices] = await Promise.all([
		fetchHistoricalPrices(strategyFmpSymbol, apiKey, fromDate, today),
		fetchHistoricalPrices("SPY", apiKey, fromDate, today),
		fetchHistoricalPrices("QQQ", apiKey, fromDate, today)
	]);

	const commonDates = Array.from(strategyPrices.keys())
		.filter((date) => spyPrices.has(date) && qqqPrices.has(date))
		.sort();

	if (commonDates.length < 2) {
		throw new Error(`Not enough historical data to build ${BACKFILL_DAYS}-day benchmark backfill.`);
	}

	const firstDate = commonDates[0];
	const strategyStart = strategyPrices.get(firstDate);
	const spyStart = spyPrices.get(firstDate);
	const qqqStart = qqqPrices.get(firstDate);

	return commonDates.map((date) => {
		const strategyPrice = strategyPrices.get(date);
		const spyPrice = spyPrices.get(date);
		const qqqPrice = qqqPrices.get(date);
		const strategyValue = roundMoney(STARTING_CASH * strategyPrice / strategyStart);
		const spyValue = roundMoney(STARTING_CASH * spyPrice / spyStart);
		const qqqValue = roundMoney(STARTING_CASH * qqqPrice / qqqStart);

		return createHistorySnapshot({
			date,
			phase: "proxy",
			strategySymbol,
			strategyValue,
			spyValue,
			qqqValue,
			strategyPrice,
			spyPrice,
			qqqPrice
		});
	});
}

async function fetchHistoricalPrices(symbol, apiKey, fromDate, toDate) {
	let records;
	try {
		records = await fetchFmpJson("/stable/historical-price-eod/full", {
			symbol,
			from: fromDate,
			to: toDate
		}, apiKey);
	} catch (error) {
		console.warn(`FMP historical price unavailable for ${symbol}; trying public chart fallback.`);
		return fetchYahooHistoricalPrices(symbol, fromDate, toDate, error);
	}

	if (!Array.isArray(records)) {
		throw new Error(`FMP returned invalid historical price data for ${symbol}.`);
	}

	const prices = new Map();
	records.forEach((record) => {
		const date = record && record.date;
		const close = toPositiveNumber(record && (record.close || record.adjClose || record.price));
		if (date && close) {
			prices.set(date, close);
		}
	});

	return prices;
}

async function fetchYahooHistoricalPrices(symbol, fromDate, toDate, originalError) {
	const period1 = Math.floor(new Date(`${fromDate}T00:00:00.000Z`).getTime() / 1000);
	const period2Date = new Date(`${toDate}T00:00:00.000Z`);
	period2Date.setUTCDate(period2Date.getUTCDate() + 1);
	const period2 = Math.floor(period2Date.getTime() / 1000);
	const url = new URL(`/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}`, "https://query1.finance.yahoo.com");
	url.searchParams.set("period1", String(period1));
	url.searchParams.set("period2", String(period2));
	url.searchParams.set("interval", "1d");
	url.searchParams.set("events", "history");

	const response = await fetchUrl(url);
	if (!response.ok) {
		throw new Error(`Yahoo fallback failed for ${symbol} after FMP error (${originalError.message}).`);
	}

	let json;
	try {
		json = JSON.parse(response.body);
	} catch (error) {
		throw new Error(`Yahoo fallback returned invalid JSON for ${symbol}.`);
	}

	const result = json.chart && json.chart.result && json.chart.result[0];
	const timestamps = result && result.timestamp;
	const closes = result && result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
	if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
		throw new Error(`Yahoo fallback returned no historical closes for ${symbol}.`);
	}

	const prices = new Map();
	timestamps.forEach((timestamp, index) => {
		const close = toPositiveNumber(closes[index]);
		if (close) {
			prices.set(new Date(timestamp * 1000).toISOString().slice(0, 10), close);
		}
	});
	return prices;
}

function latestPrice(prices) {
	const dates = Array.from(prices.keys()).sort();
	if (!dates.length) {
		return null;
	}
	const date = dates[dates.length - 1];
	return {
		date,
		price: prices.get(date)
	};
}

function buildNextData(existingData, marketData, now, monthlyMode) {
	const lastUpdated = now.toISOString();
	const today = toDateString(now);
	const ranked = marketData
		.slice()
		.sort((a, b) => b.marketCap - a.marketCap)
		.map((company, index) => ({ ...company, rank: index + 1 }));

	const marketBySymbol = new Map(ranked.map((company) => [company.symbol, company]));
	const existingKing = existingData && existingData.currentKing;
	const chronicle = normalizeChronicle(existingData && existingData.chronicle);

	if (!existingKing || !existingKing.symbol || !marketBySymbol.has(existingKing.symbol)) {
		return initializeThrone(ranked, chronicle, lastUpdated, today);
	}

	let currentMarket = marketBySymbol.get(existingKing.symbol);
	if (!currentMarket.priceIsFresh) {
		throw new Error(`Cannot update portfolio value for ${currentMarket.symbol}; fresh FMP price is unavailable.`);
	}
	if (!currentMarket.marketCapIsFresh) {
		throw new Error(`Cannot reassess ${currentMarket.symbol}; fresh FMP market cap is unavailable.`);
	}
	let sharesHeld = toPositiveNumber(existingKing.fakeSharesHeld || existingKing.sharesHeld);
	if (!sharesHeld) {
		throw new Error(`Existing throne data for ${existingKing.symbol} is missing fakeSharesHeld.`);
	}

	let portfolioValue = roundMoney(sharesHeld * currentMarket.price);
	let currentKing = {
		name: currentMarket.name,
		symbol: currentMarket.symbol,
		marketCap: currentMarket.marketCap,
		price: currentMarket.price,
		fakeSharesHeld: roundShares(sharesHeld),
		portfolioValue,
		heldSince: existingKing.heldSince || today
	};

	// Daily runs refresh prices and rankings. Succession opens once per calendar
	// month, or immediately when --monthly is passed for a manual check.
	if (monthlyMode) {
		const leader = ranked[0];
		const successionThreshold = currentMarket.marketCap * (1 + SUCCESSION_MARGIN);
		if (leader.symbol !== currentKing.symbol && leader.marketCap >= successionThreshold) {
			if (!leader.marketCapIsFresh) {
				throw new Error(`Cannot rotate to ${leader.symbol}; fresh FMP market cap is unavailable.`);
			}
			if (!leader.priceIsFresh) {
				throw new Error(`Cannot rotate to ${leader.symbol}; fresh FMP price is unavailable.`);
			}
			const newShares = portfolioValue / leader.price;
			currentKing = {
				name: leader.name,
				symbol: leader.symbol,
				marketCap: leader.marketCap,
				price: leader.price,
				fakeSharesHeld: roundShares(newShares),
				portfolioValue,
				heldSince: today
			};
			chronicle.unshift({
				date: today,
				from: currentMarket.symbol,
				to: leader.symbol,
				note: `${leader.symbol} exceeded ${currentMarket.symbol} by at least 0.5% market cap.`,
				portfolioValue
			});
		}
	}

	return composeData({
		lastUpdated,
		lastSuccessionCheck: monthlyMode ? today : existingData.lastSuccessionCheck || null,
		currentKing,
		ranked,
		chronicle
	});
}

function initializeThrone(ranked, chronicle, lastUpdated, today) {
	const leader = ranked[0];
	const fakeSharesHeld = STARTING_CASH / leader.price;
	const currentKing = {
		name: leader.name,
		symbol: leader.symbol,
		marketCap: leader.marketCap,
		price: leader.price,
		fakeSharesHeld: roundShares(fakeSharesHeld),
		portfolioValue: STARTING_CASH,
		heldSince: today
	};

	chronicle.unshift({
		date: today,
		from: "CASH",
		to: leader.symbol,
		note: "Initial throne assignment.",
		portfolioValue: STARTING_CASH
	});

	return composeData({
		lastUpdated,
		lastSuccessionCheck: today,
		currentKing,
		ranked,
		chronicle
	});
}

function composeData({ lastUpdated, lastSuccessionCheck, currentKing, ranked, chronicle }) {
	const currentValue = roundMoney(currentKing.portfolioValue);
	const returnSinceStart = roundMoney(currentValue - STARTING_CASH);
	const returnPercent = roundRatio(returnSinceStart / STARTING_CASH);

	return {
		schemaVersion: 1,
		title: "Who Owns the Throne?",
		startingCash: STARTING_CASH,
		lastUpdated,
		lastSuccessionCheck,
		successionMargin: SUCCESSION_MARGIN,
		candidateUniverse: CANDIDATES.map((candidate) => candidate.symbol),
		dataSource: {
			provider: "Financial Modeling Prep",
			endpoints: [
				"/stable/market-capitalization-batch",
				"/stable/historical-price-eod/full"
			]
		},
		currentKing,
		crown: {
			startingCash: STARTING_CASH,
			currentValue,
			returnSinceStart,
			returnPercent
		},
		challengers: ranked.map(({ fmpSymbol, ...company }) => company),
		chronicle: chronicle.slice(0, 25),
		disclaimer: "This is fake money and real market data. It is not a recommendation, signal, or investing strategy. It is a public experiment in concentration, momentum, and market mythology."
	};
}

function normalizeHistory(history) {
	const snapshots = Array.isArray(history && history.snapshots)
		? history.snapshots.map(normalizeHistorySnapshot).filter(Boolean)
		: [];

	return {
		schemaVersion: 1,
		mode: "current-holder-proxy",
		benchmarkStartCash: STARTING_CASH,
		backfillWindowDays: BACKFILL_DAYS,
		note: "The 90-day backfill is current-holder proxy context, not an official historical throne backtest. Official strategy snapshots begin at the real held-since date and continue daily.",
		benchmarks: BENCHMARKS.map(({ symbol, label, description }) => ({ symbol, label, description })),
		officialBaseline: history && history.officialBaseline ? history.officialBaseline : null,
		snapshots
	};
}

function createOfficialBaseline(benchmarkData, today) {
	const benchmarkPrices = {};
	benchmarkData.forEach((benchmark) => {
		benchmarkPrices[benchmark.symbol] = benchmark.price;
	});

	return {
		startDate: today,
		startingCash: STARTING_CASH,
		benchmarkPrices
	};
}

function createOfficialSnapshot(data, benchmarkData, officialBaseline, today) {
	const prices = new Map(benchmarkData.map((benchmark) => [benchmark.symbol, benchmark.price]));
	const spyValue = benchmarkValue("SPY", prices, officialBaseline);
	const qqqValue = benchmarkValue("QQQ", prices, officialBaseline);

	return createHistorySnapshot({
		date: today,
		phase: "official",
		strategySymbol: data.currentKing.symbol,
		strategyValue: data.currentKing.portfolioValue,
		spyValue,
		qqqValue,
		strategyPrice: data.currentKing.price,
		spyPrice: prices.get("SPY"),
		qqqPrice: prices.get("QQQ")
	});
}

function benchmarkValue(symbol, prices, officialBaseline) {
	const startPrice = toPositiveNumber(officialBaseline && officialBaseline.benchmarkPrices && officialBaseline.benchmarkPrices[symbol]);
	const currentPrice = toPositiveNumber(prices.get(symbol));
	if (!startPrice || !currentPrice) {
		throw new Error(`Cannot build benchmark value for ${symbol}; missing start or current price.`);
	}
	return roundMoney(STARTING_CASH * currentPrice / startPrice);
}

function createHistorySnapshot({ date, phase, strategySymbol, strategyValue, spyValue, qqqValue, strategyPrice, spyPrice, qqqPrice }) {
	return {
		date,
		phase,
		strategySymbol,
		strategyValue: roundMoney(strategyValue),
		spyValue: roundMoney(spyValue),
		qqqValue: roundMoney(qqqValue),
		excessVsSpy: roundMoney(strategyValue - spyValue),
		excessVsQqq: roundMoney(strategyValue - qqqValue),
		strategyPrice: roundMoney(strategyPrice),
		spyPrice: roundMoney(spyPrice),
		qqqPrice: roundMoney(qqqPrice)
	};
}

function normalizeHistorySnapshot(snapshot) {
	if (!snapshot || !snapshot.date) {
		return null;
	}

	const strategyValue = toPositiveNumber(snapshot.strategyValue);
	const spyValue = toPositiveNumber(snapshot.spyValue);
	const qqqValue = toPositiveNumber(snapshot.qqqValue);
	if (!strategyValue || !spyValue || !qqqValue) {
		return null;
	}

	return createHistorySnapshot({
		date: snapshot.date,
		phase: snapshot.phase === "official" ? "official" : "proxy",
		strategySymbol: snapshot.strategySymbol || "---",
		strategyValue,
		spyValue,
		qqqValue,
		strategyPrice: snapshot.strategyPrice || 0,
		spyPrice: snapshot.spyPrice || 0,
		qqqPrice: snapshot.qqqPrice || 0
	});
}

function mergeSnapshots(existingSnapshots, nextSnapshots) {
	const byKey = new Map();
	existingSnapshots.forEach((snapshot) => {
		byKey.set(snapshotKey(snapshot), snapshot);
	});
	nextSnapshots.forEach((snapshot) => {
		byKey.set(snapshotKey(snapshot), snapshot);
	});

	return Array.from(byKey.values()).sort(compareSnapshots);
}

function finalizeHistory(history) {
	const snapshots = history.snapshots.slice().sort(compareSnapshots);
	return {
		...history,
		startDate: snapshots.length ? snapshots[0].date : null,
		endDate: snapshots.length ? snapshots[snapshots.length - 1].date : null,
		snapshots
	};
}

function snapshotKey(snapshot) {
	return `${snapshot.phase || "proxy"}:${snapshot.date}`;
}

function compareSnapshots(a, b) {
	const dateCompare = a.date.localeCompare(b.date);
	if (dateCompare !== 0) {
		return dateCompare;
	}
	if (a.phase === b.phase) {
		return 0;
	}
	return a.phase === "proxy" ? -1 : 1;
}

async function readExistingData() {
	try {
		return JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") {
			return null;
		}
		throw new Error(`Could not read existing throne data: ${error.message}`);
	}
}

async function writeJsonIfChanged(data) {
	await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
	const nextJson = `${JSON.stringify(data, null, 2)}\n`;
	let previousJson = null;

	try {
		previousJson = await fs.readFile(DATA_PATH, "utf8");
	} catch (error) {
		if (error.code !== "ENOENT") {
			throw error;
		}
	}

	if (previousJson === nextJson) {
		console.log("No changes to data/throne.json.");
		return;
	}

	const tempPath = `${DATA_PATH}.tmp`;
	await fs.writeFile(tempPath, nextJson, "utf8");
	await fs.rename(tempPath, DATA_PATH);
}

function validateOutput(data) {
	if (!data.currentKing || !data.currentKing.symbol || !toPositiveNumber(data.currentKing.price)) {
		throw new Error("Refusing to write invalid throne data: current king is incomplete.");
	}
	if (!Array.isArray(data.challengers) || data.challengers.length !== CANDIDATES.length) {
		throw new Error("Refusing to write invalid throne data: challenger list is incomplete.");
	}
	if (!data.history || !Array.isArray(data.history.snapshots) || data.history.snapshots.length < 2) {
		throw new Error("Refusing to write invalid throne data: benchmark history is incomplete.");
	}
}

function indexBySymbol(records) {
	const map = new Map();
	records.forEach((record) => {
		if (record && record.symbol) {
			map.set(String(record.symbol).toUpperCase(), record);
		}
	});
	return map;
}

function existingPrices(existingData) {
	const prices = new Map();
	if (existingData && existingData.currentKing && existingData.currentKing.symbol) {
		prices.set(existingData.currentKing.symbol, existingData.currentKing.price);
	}
	if (existingData && Array.isArray(existingData.challengers)) {
		existingData.challengers.forEach((company) => {
			if (company && company.symbol) {
				prices.set(company.symbol, company.price);
			}
		});
	}
	return prices;
}

function existingMarketCaps(existingData) {
	const marketCaps = new Map();
	if (existingData && existingData.currentKing && existingData.currentKing.symbol) {
		marketCaps.set(existingData.currentKing.symbol, existingData.currentKing.marketCap);
	}
	if (existingData && Array.isArray(existingData.challengers)) {
		existingData.challengers.forEach((company) => {
			if (company && company.symbol) {
				marketCaps.set(company.symbol, company.marketCap);
			}
		});
	}
	return marketCaps;
}

function normalizeChronicle(entries) {
	return Array.isArray(entries) ? entries.slice() : [];
}

function isMonthlySuccessionCheck(now, args, lastSuccessionCheck) {
	if (args.includes("--monthly") || args.includes("--force-monthly")) {
		return true;
	}
	if (!lastSuccessionCheck) {
		return true;
	}
	return monthKey(lastSuccessionCheck) !== monthKey(toDateString(now));
}

function getFmpSymbol(symbol) {
	const candidate = CANDIDATES.find((item) => item.symbol === symbol);
	return candidate ? candidate.fmpSymbol : symbol;
}

function daysBefore(date, days) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() - days);
	return next;
}

function monthKey(value) {
	return String(value).slice(0, 7);
}

function toYahooSymbol(symbol) {
	return symbol.replace(".", "-");
}

function toPositiveNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
}

function toDateString(date) {
	return date.toISOString().slice(0, 10);
}

function roundMoney(value) {
	return Number(Number(value).toFixed(2));
}

function roundShares(value) {
	return Number(Number(value).toFixed(6));
}

function roundRatio(value) {
	return Number(Number(value).toFixed(6));
}

function redactApiKey(url) {
	const redacted = new URL(url.toString());
	redacted.searchParams.set("apikey", "[redacted]");
	return redacted.toString();
}
