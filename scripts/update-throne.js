#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const https = require("node:https");
const path = require("node:path");
const { URL } = require("node:url");
const {
	STARTING_CASH,
	STRATEGY_START_DATE,
	SUCCESSION_MARGIN,
	completedMonthEnds,
	effectiveMarketDate,
	estimateMarketCaps,
	evaluateSuccession,
	rotatePortfolio,
	simulatePortfolioHistory
} = require("./throne-core");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(REPO_ROOT, "data", "throne.json");
const FMP_BASE_URL = "https://financialmodelingprep.com";

const CANDIDATES = [
	{ symbol: "AAPL", fmpSymbol: "AAPL", issuerId: "0000320193", name: "Apple Inc." },
	{ symbol: "MSFT", fmpSymbol: "MSFT", issuerId: "0000789019", name: "Microsoft Corporation" },
	{ symbol: "NVDA", fmpSymbol: "NVDA", issuerId: "0001045810", name: "NVIDIA Corporation" },
	{ symbol: "GOOGL", fmpSymbol: "GOOGL", issuerId: "0001652044", alternateTickers: ["GOOG"], name: "Alphabet Inc." },
	{ symbol: "AMZN", fmpSymbol: "AMZN", issuerId: "0001018724", name: "Amazon.com, Inc." },
	{ symbol: "META", fmpSymbol: "META", issuerId: "0001326801", name: "Meta Platforms, Inc." },
	{ symbol: "BRK.B", fmpSymbol: "BRK-B", issuerId: "0001067983", alternateTickers: ["BRK.A"], name: "Berkshire Hathaway Inc." },
	{ symbol: "TSLA", fmpSymbol: "TSLA", issuerId: "0001318605", name: "Tesla, Inc." },
	{ symbol: "AVGO", fmpSymbol: "AVGO", issuerId: "0001730168", name: "Broadcom Inc." },
	{ symbol: "LLY", fmpSymbol: "LLY", issuerId: "0000059478", name: "Eli Lilly and Company" },
	{ symbol: "JPM", fmpSymbol: "JPM", issuerId: "0000019617", name: "JPMorgan Chase & Co." },
	{ symbol: "V", fmpSymbol: "V", issuerId: "0001403161", name: "Visa Inc." },
	{ symbol: "XOM", fmpSymbol: "XOM", issuerId: "0000034088", name: "Exxon Mobil Corporation" }
];

const BENCHMARKS = [
	{ symbol: "SPY", label: "SPY", description: "S&P 500 ETF proxy" },
	{ symbol: "QQQ", label: "QQQ", description: "Nasdaq-style ETF proxy" }
];

validateCandidateUniverse(CANDIDATES);

if (require.main === module) {
	main().catch((error) => {
		console.error(`update-throne failed: ${error.message}`);
		process.exitCode = 1;
	});
}

async function main() {
	const apiKey = process.env.FMP_API_KEY;
	if (!apiKey) {
		throw new Error("Missing FMP_API_KEY environment variable.");
	}

	const args = process.argv.slice(2);
	const now = new Date();
	const existingData = await readExistingData();
	const [marketData, benchmarkData] = await Promise.all([
		fetchMarketData(apiKey, now, existingData),
		fetchBenchmarkData(apiKey, now)
	]);
	const needsRebuild = args.includes("--rebuild") || !isMigratedData(existingData);
	let nextData;

	if (needsRebuild) {
		const priceMaps = await fetchAllPriceMaps(apiKey, STRATEGY_START_DATE, toDateString(now));
		nextData = rebuildStrategy(existingData, marketData, benchmarkData, priceMaps, now);
	} else {
		const dueMonthEnds = completedMonthEnds(existingData.lastSuccessionCheck, now);
		const shouldForce = args.includes("--monthly") || args.includes("--force-monthly");
		if (shouldForce && !dueMonthEnds.length) {
			console.log("No completed month-end succession check is currently due.");
		}
		nextData = await updateStrategy(existingData, marketData, benchmarkData, dueMonthEnds, apiKey, now);
	}

	validateOutput(nextData);
	await writeJsonIfChanged(nextData);
	console.log(`Updated throne data. King: ${nextData.currentKing.symbol}. Month-end checks recorded: ${nextData.successionChecks.length}.`);
}

async function fetchMarketData(apiKey, now, existingData) {
	const symbols = CANDIDATES.map((candidate) => candidate.fmpSymbol).join(",");
	const [latestPrices, caps] = await Promise.all([
		fetchLatestPrices(CANDIDATES.map((candidate) => candidate.fmpSymbol), apiKey, now),
		fetchFmpJson("/stable/market-capitalization-batch", { symbols }, apiKey)
	]);
	const capBySymbol = indexBySymbol(Array.isArray(caps) ? caps : []);
	const existingPriceBySymbol = existingValues(existingData, "price");
	const profileSymbols = CANDIDATES
		.filter((candidate) => {
			const capRecord = capBySymbol.get(candidate.fmpSymbol);
			const priceRecord = latestPrices.get(candidate.fmpSymbol);
			return !positiveNumber(capRecord && capRecord.marketCap) || !positiveNumber(priceRecord && priceRecord.price);
		})
		.map((candidate) => candidate.fmpSymbol);
	const profileBySymbol = await fetchProfiles(profileSymbols, apiKey);

	return CANDIDATES.map((candidate) => {
		const priceRecord = latestPrices.get(candidate.fmpSymbol);
		const capRecord = capBySymbol.get(candidate.fmpSymbol);
		const profileRecord = profileBySymbol.get(candidate.fmpSymbol);
		return resolveCandidateMarketData({
			candidate,
			priceRecord,
			capRecord,
			profileRecord,
			existingPrice: existingPriceBySymbol.get(candidate.symbol),
			fetchedDate: toDateString(now)
		});
	});
}

async function fetchProfiles(symbols, apiKey) {
	const entries = await Promise.all(symbols.map(async (symbol) => {
		const records = await fetchFmpJson("/stable/profile", { symbol }, apiKey);
		const profile = Array.isArray(records) ? records[0] : records;
		return [symbol, profile || null];
	}));
	return new Map(entries);
}

function resolveCandidateMarketData({ candidate, priceRecord, capRecord, profileRecord, existingPrice, fetchedDate }) {
	const historicalPrice = positiveNumber(priceRecord && priceRecord.price);
	const profilePrice = positiveNumber(profileRecord && profileRecord.price);
	const batchMarketCap = positiveNumber(capRecord && capRecord.marketCap);
	const profileMarketCap = positiveNumber(profileRecord && profileRecord.marketCap);
	const marketCap = batchMarketCap || profileMarketCap;
	const marketCapSource = batchMarketCap ? "batch-market-cap" : profileMarketCap ? "company-profile" : null;
	const price = historicalPrice || profilePrice || positiveNumber(existingPrice);
	const marketCapReferencePrice = batchMarketCap
		? historicalPrice || profilePrice
		: profilePrice;

	if (!price || !marketCap || !marketCapReferencePrice || !marketCapSource) {
		throw new Error(`Incomplete fresh market data for ${candidate.symbol}.`);
	}
	if (profileRecord && profileRecord.cik && profileRecord.cik !== candidate.issuerId) {
		throw new Error(`Issuer mismatch for ${candidate.symbol}: expected ${candidate.issuerId}, received ${profileRecord.cik}.`);
	}

	return {
		name: candidate.name,
		symbol: candidate.symbol,
		fmpSymbol: candidate.fmpSymbol,
		issuerId: candidate.issuerId,
		alternateTickers: candidate.alternateTickers || [],
		price,
		priceDate: priceRecord && priceRecord.date ? priceRecord.date : fetchedDate,
		priceIsFresh: Boolean(historicalPrice || profilePrice),
		marketCap,
		marketCapDate: capRecord && capRecord.date ? capRecord.date : fetchedDate,
		marketCapIsFresh: true,
		marketCapSource,
		marketCapReferencePrice
	};
}

async function fetchBenchmarkData(apiKey, now) {
	const fromDate = toDateString(daysBefore(now, 7));
	const toDate = toDateString(now);
	return Promise.all(BENCHMARKS.map(async (benchmark) => {
		const prices = await fetchHistoricalPrices(benchmark.symbol, apiKey, fromDate, toDate);
		const latest = latestPrice(prices);
		if (!latest) {
			throw new Error(`Missing latest benchmark price for ${benchmark.symbol}.`);
		}
		return { ...benchmark, price: latest.price, priceDate: latest.date };
	}));
}

async function fetchLatestPrices(symbols, apiKey, now) {
	const fromDate = toDateString(daysBefore(now, 7));
	const toDate = toDateString(now);
	const entries = await Promise.all(symbols.map(async (symbol) => {
		const prices = await fetchHistoricalPrices(symbol, apiKey, fromDate, toDate);
		return [symbol, latestPrice(prices)];
	}));
	return new Map(entries);
}

async function fetchAllPriceMaps(apiKey, fromDate, toDate) {
	const symbols = [...CANDIDATES.map((candidate) => candidate.fmpSymbol), ...BENCHMARKS.map((benchmark) => benchmark.symbol)];
	const entries = await Promise.all(symbols.map(async (symbol) => {
		const prices = await fetchHistoricalPrices(symbol, apiKey, fromDate, toDate);
		return [displaySymbol(symbol), prices];
	}));
	return new Map(entries);
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

async function fetchHistoricalPrices(symbol, apiKey, fromDate, toDate) {
	try {
		const records = await fetchFmpJson("/stable/historical-price-eod/full", { symbol, from: fromDate, to: toDate }, apiKey);
		if (!Array.isArray(records)) {
			throw new Error(`FMP returned invalid historical data for ${symbol}.`);
		}
		return priceMapFromRecords(records);
	} catch (error) {
		console.warn(`FMP historical price unavailable for ${symbol}; trying public chart fallback.`);
		return fetchYahooHistoricalPrices(symbol, fromDate, toDate, error);
	}
}

async function fetchYahooHistoricalPrices(symbol, fromDate, toDate, originalError) {
	const period1 = Math.floor(new Date(`${fromDate}T00:00:00.000Z`).getTime() / 1000);
	const period2Date = new Date(`${toDate}T00:00:00.000Z`);
	period2Date.setUTCDate(period2Date.getUTCDate() + 1);
	const url = new URL(`/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}`, "https://query1.finance.yahoo.com");
	url.searchParams.set("period1", String(period1));
	url.searchParams.set("period2", String(Math.floor(period2Date.getTime() / 1000)));
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
		throw new Error(`Yahoo fallback returned no closes for ${symbol}.`);
	}
	const prices = new Map();
	timestamps.forEach((timestamp, index) => {
		const price = positiveNumber(closes[index]);
		if (price) {
			prices.set(new Date(timestamp * 1000).toISOString().slice(0, 10), price);
		}
	});
	return prices;
}

async function fetchUrl(url) {
	if (typeof fetch === "function") {
		const response = await fetch(url);
		return { ok: response.ok, status: response.status, body: await response.text() };
	}
	return new Promise((resolve, reject) => {
		https.get(url, (response) => {
			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => { body += chunk; });
			response.on("end", () => resolve({
				ok: response.statusCode >= 200 && response.statusCode < 300,
				status: response.statusCode,
				body
			}));
		}).on("error", reject);
	});
}

function rebuildStrategy(existingData, marketData, benchmarkData, priceMaps, now) {
	const scheduledMonthEnds = [STRATEGY_START_DATE, ...completedMonthEnds(STRATEGY_START_DATE, now)];
	const reconstruction = reconstructChecks(marketData, priceMaps, scheduledMonthEnds);
	const dates = commonHistoryDates(priceMaps, reconstruction.initialSymbol, reconstruction.rotations, STRATEGY_START_DATE);
	const simulation = simulatePortfolioHistory({
		dates,
		priceMaps,
		startDate: STRATEGY_START_DATE,
		initialSymbol: reconstruction.initialSymbol,
		rotations: reconstruction.rotations
	});
	const currentMarket = requireCurrentMarket(marketData, simulation.currentSymbol);
	const currentValue = roundMoney(simulation.shares * currentMarket.price);
	const latestSnapshot = simulation.snapshots[simulation.snapshots.length - 1];
	if (latestSnapshot && latestSnapshot.date !== currentMarket.priceDate) {
		simulation.snapshots.push(snapshotFromCurrent(
			currentMarket.priceDate,
			simulation.currentSymbol,
			currentValue,
			currentMarket.price,
			benchmarkData,
			reconstruction.baselinePrices
		));
	}

	return composeData({
		existingData,
		marketData,
		now,
		currentSymbol: simulation.currentSymbol,
		shares: simulation.shares,
		heldSince: reconstruction.heldSince,
		portfolioValue: currentValue,
		successionChecks: reconstruction.checks,
		chronicle: reconstruction.chronicle,
		history: makeHistory(simulation.snapshots, reconstruction.baselinePrices)
	});
}

async function updateStrategy(existingData, marketData, benchmarkData, dueMonthEnds, apiKey, now) {
	let holder = existingData.currentKing.symbol;
	let shares = positiveNumber(existingData.currentKing.fakeSharesHeld);
	let heldSince = existingData.currentKing.heldSince;
	const checks = normalizeChecks(existingData.successionChecks);
	const chronicle = normalizeChronicle(existingData.chronicle);
	let priceMaps = null;
	let rotations = [];

	if (dueMonthEnds.length) {
		priceMaps = await fetchAllPriceMaps(apiKey, STRATEGY_START_DATE, toDateString(now));
		for (const scheduledMonthEnd of dueMonthEnds) {
			const effectiveDate = effectiveMarketDate(candidatePriceMaps(priceMaps), scheduledMonthEnd);
			if (!effectiveDate) {
				throw new Error(`No common market date available for ${scheduledMonthEnd}.`);
			}
			const estimates = estimateMarketCaps(marketData, candidatePriceMaps(priceMaps), effectiveDate);
			const decision = evaluateSuccession(holder, estimates, SUCCESSION_MARGIN);
			const holderPrice = requireMapPrice(priceMaps, holder, effectiveDate);
			const portfolioValue = roundMoney(shares * holderPrice);
			const from = holder;
			if (decision.rotates) {
				const nextPrice = requireMapPrice(priceMaps, decision.leader.symbol, effectiveDate);
				shares = rotatePortfolio(portfolioValue, nextPrice).shares;
				holder = decision.leader.symbol;
				heldSince = effectiveDate;
				rotations.push({ date: effectiveDate, to: holder });
			}
			const check = makeSuccessionCheck({
				scheduledMonthEnd,
				effectiveDate,
				from,
				holder,
				portfolioValue,
				decision,
				estimates,
				marketData
			});
			checks.push(check);
			chronicle.unshift(makeChronicleEntry(check));
		}
	}

	const currentMarket = requireCurrentMarket(marketData, holder);
	const currentValue = roundMoney(shares * currentMarket.price);
	let history;
	if (rotations.length) {
		const allPriceMaps = priceMaps || await fetchAllPriceMaps(apiKey, STRATEGY_START_DATE, toDateString(now));
		const dates = commonHistoryDates(allPriceMaps, existingData.history.initialSymbol, rotationsFromChecks(checks), STRATEGY_START_DATE);
		const simulation = simulatePortfolioHistory({
			dates,
			priceMaps: allPriceMaps,
			startDate: STRATEGY_START_DATE,
			initialSymbol: existingData.history.initialSymbol,
			rotations: rotationsFromChecks(checks)
		});
		history = makeHistory(simulation.snapshots, existingData.history.baselinePrices);
		shares = simulation.shares;
	} else {
		history = normalizeHistory(existingData.history);
		history.snapshots = mergeSnapshotsByDate(history.snapshots, [
			snapshotFromCurrent(
				currentMarket.priceDate,
				holder,
				currentValue,
				currentMarket.price,
				benchmarkData,
				history.baselinePrices
			)
		]);
		history.endDate = history.snapshots[history.snapshots.length - 1].date;
	}

	return composeData({
		existingData,
		marketData,
		now,
		currentSymbol: holder,
		shares,
		heldSince,
		portfolioValue: currentValue,
		successionChecks: checks,
		chronicle,
		history
	});
}

function reconstructChecks(marketData, priceMaps, scheduledMonthEnds) {
	let holder = "CASH";
	let heldSince = STRATEGY_START_DATE;
	let shares = 0;
	let portfolioValue = STARTING_CASH;
	let initialSymbol = null;
	const checks = [];
	const chronicle = [];
	const rotations = [];
	const candidateMaps = candidatePriceMaps(priceMaps);

	for (const scheduledMonthEnd of scheduledMonthEnds) {
		const effectiveDate = effectiveMarketDate(candidateMaps, scheduledMonthEnd);
		if (!effectiveDate) {
			throw new Error(`No common historical market date for ${scheduledMonthEnd}.`);
		}
		const estimates = estimateMarketCaps(marketData, candidateMaps, effectiveDate);
		const decision = evaluateSuccession(holder, estimates, SUCCESSION_MARGIN);
		const from = holder;
		if (holder === "CASH") {
			initialSymbol = decision.leader.symbol;
			holder = initialSymbol;
			const initialPrice = requireMapPrice(priceMaps, holder, effectiveDate);
			shares = STARTING_CASH / initialPrice;
			portfolioValue = STARTING_CASH;
			heldSince = effectiveDate;
		} else {
			const holderPrice = requireMapPrice(priceMaps, holder, effectiveDate);
			portfolioValue = roundMoney(shares * holderPrice);
			if (decision.rotates) {
				holder = decision.leader.symbol;
				const nextPrice = requireMapPrice(priceMaps, holder, effectiveDate);
				shares = rotatePortfolio(portfolioValue, nextPrice).shares;
				heldSince = effectiveDate;
				rotations.push({ date: effectiveDate, to: holder });
			}
		}
		const check = makeSuccessionCheck({
			scheduledMonthEnd,
			effectiveDate,
			from,
			holder,
			portfolioValue,
			decision,
			estimates,
			marketData
		});
		checks.push(check);
		chronicle.unshift(makeChronicleEntry(check));
	}

	return {
		initialSymbol,
		heldSince,
		checks,
		chronicle,
		rotations,
		baselinePrices: {
			strategySymbol: initialSymbol,
			strategyPrice: roundMoney(requireMapPrice(priceMaps, initialSymbol, STRATEGY_START_DATE)),
			SPY: roundMoney(requireMapPrice(priceMaps, "SPY", STRATEGY_START_DATE)),
			QQQ: roundMoney(requireMapPrice(priceMaps, "QQQ", STRATEGY_START_DATE))
		}
	};
}

function makeSuccessionCheck({ scheduledMonthEnd, effectiveDate, from, holder, portfolioValue, decision, estimates, marketData }) {
	return {
		scheduledMonthEnd,
		effectiveMarketDate: effectiveDate,
		holderBefore: from,
		leader: decision.leader.symbol,
		holderAfter: holder,
		action: decision.action,
		requiredMargin: SUCCESSION_MARGIN,
		holderEstimatedMarketCap: decision.holder ? decision.holder.estimatedMarketCap : null,
		leaderEstimatedMarketCap: decision.leader.estimatedMarketCap,
		thresholdMarketCap: decision.thresholdMarketCap,
		portfolioValue: roundMoney(portfolioValue),
		estimates,
		reconstruction: {
			method: "current-implied-shares-times-historical-close",
			marketCapReferenceDate: latestReferenceDate(marketData),
			priceSource: "Financial Modeling Prep historical EOD with public Yahoo chart fallback",
			note: "Historical market caps are estimates because exact historical market-cap queries require a premium subscription."
		}
	};
}

function makeChronicleEntry(check) {
	if (check.action === "assignment") {
		return {
			eventType: "assignment",
			date: check.effectiveMarketDate,
			scheduledMonthEnd: check.scheduledMonthEnd,
			from: "CASH",
			to: check.holderAfter,
			note: `Initial throne assignment on the March 31 birthday start.`,
			portfolioValue: check.portfolioValue
		};
	}
	if (check.action === "rotated") {
		return {
			eventType: "rotation",
			date: check.effectiveMarketDate,
			scheduledMonthEnd: check.scheduledMonthEnd,
			from: check.holderBefore,
			to: check.holderAfter,
			note: `${check.holderAfter} exceeded ${check.holderBefore} by the required 0.5% market-cap margin.`,
			portfolioValue: check.portfolioValue
		};
	}
	return {
		eventType: "review",
		date: check.effectiveMarketDate,
		scheduledMonthEnd: check.scheduledMonthEnd,
		from: check.holderBefore,
		to: check.holderAfter,
		note: `${check.holderAfter} retained the throne at the month-end review.`,
		portfolioValue: check.portfolioValue
	};
}

function composeData({ existingData, marketData, now, currentSymbol, shares, heldSince, portfolioValue, successionChecks, chronicle, history }) {
	const ranked = marketData.slice().sort((a, b) => b.marketCap - a.marketCap).map((company, index) => ({
		name: company.name,
		symbol: company.symbol,
		issuerId: company.issuerId,
		alternateTickers: company.alternateTickers,
		marketCap: company.marketCap,
		price: company.price,
		priceIsFresh: company.priceIsFresh,
		marketCapIsFresh: company.marketCapIsFresh,
		marketCapSource: company.marketCapSource,
		rank: index + 1
	}));
	const currentMarket = requireCurrentMarket(marketData, currentSymbol);
	const currentValue = roundMoney(portfolioValue);
	return {
		schemaVersion: 2,
		title: "Who Owns the Throne?",
		startingCash: STARTING_CASH,
		strategyStartDate: STRATEGY_START_DATE,
		lastUpdated: now.toISOString(),
		lastSuccessionCheck: successionChecks.length ? successionChecks[successionChecks.length - 1].effectiveMarketDate : null,
		successionMargin: SUCCESSION_MARGIN,
		candidateUniverse: CANDIDATES.map((candidate) => candidate.symbol),
		candidatePolicy: "One canonical ticker per corporate issuer. Alternate share classes are not ranked separately.",
		dataSource: {
			provider: "Financial Modeling Prep",
			endpoints: ["/stable/market-capitalization-batch", "/stable/profile", "/stable/historical-price-eod/full"],
			marketCapFallback: "Fresh FMP company-profile market caps fill symbols omitted by the batch market-cap endpoint.",
			priceFallback: "Public Yahoo Finance chart data is used for historical prices unavailable under the configured FMP subscription.",
			historicalMarketCapMethod: "current-implied-shares-times-historical-close"
		},
		currentKing: {
			name: currentMarket.name,
			symbol: currentSymbol,
			marketCap: currentMarket.marketCap,
			price: currentMarket.price,
			fakeSharesHeld: roundShares(shares),
			portfolioValue: currentValue,
			heldSince
		},
		crown: {
			startingCash: STARTING_CASH,
			currentValue,
			returnSinceStart: roundMoney(currentValue - STARTING_CASH),
			returnPercent: roundRatio((currentValue - STARTING_CASH) / STARTING_CASH)
		},
		challengers: ranked,
		successionChecks,
		chronicle: chronicle.slice(0, 25),
		history,
		disclaimer: existingData && existingData.disclaimer
			? existingData.disclaimer
			: "This is fake money and real market data. It is not a recommendation, signal, or investing strategy. It is a public experiment in concentration, momentum, and market mythology."
	};
}

function makeHistory(snapshots, baselinePrices) {
	const sorted = mergeSnapshotsByDate([], snapshots);
	return {
		schemaVersion: 2,
		startDate: STRATEGY_START_DATE,
		endDate: sorted.length ? sorted[sorted.length - 1].date : STRATEGY_START_DATE,
		startingCash: STARTING_CASH,
		initialSymbol: baselinePrices.strategySymbol,
		baselinePrices,
		benchmarks: BENCHMARKS,
		note: "Official throne-method history reconstructed from the March 31, 2026 birthday start.",
		snapshots: sorted
	};
}

function normalizeHistory(history) {
	return {
		schemaVersion: 2,
		startDate: history.startDate,
		endDate: history.endDate,
		startingCash: history.startingCash || STARTING_CASH,
		initialSymbol: history.initialSymbol,
		baselinePrices: history.baselinePrices,
		benchmarks: Array.isArray(history.benchmarks) ? history.benchmarks : BENCHMARKS,
		note: history.note,
		snapshots: mergeSnapshotsByDate([], history.snapshots || [])
	};
}

function snapshotFromCurrent(date, symbol, strategyValue, strategyPrice, benchmarkData, baselinePrices) {
	const spy = benchmarkData.find((benchmark) => benchmark.symbol === "SPY");
	const qqq = benchmarkData.find((benchmark) => benchmark.symbol === "QQQ");
	const spyValue = roundMoney(STARTING_CASH * spy.price / baselinePrices.SPY);
	const qqqValue = roundMoney(STARTING_CASH * qqq.price / baselinePrices.QQQ);
	return {
		date,
		strategySymbol: symbol,
		strategyValue: roundMoney(strategyValue),
		spyValue,
		qqqValue,
		excessVsSpy: roundMoney(strategyValue - spyValue),
		excessVsQqq: roundMoney(strategyValue - qqqValue),
		strategyPrice: roundMoney(strategyPrice),
		spyPrice: roundMoney(spy.price),
		qqqPrice: roundMoney(qqq.price)
	};
}

function commonHistoryDates(priceMaps, initialSymbol, rotations, startDate) {
	const heldSymbols = new Set([initialSymbol, ...rotations.map((rotation) => rotation.to)]);
	const required = ["SPY", "QQQ", ...heldSymbols];
	const firstMap = priceMaps.get("SPY");
	return Array.from(firstMap.keys())
		.filter((date) => date >= startDate && required.every((symbol) => priceMaps.get(symbol) && priceMaps.get(symbol).has(date)))
		.sort();
}

function candidatePriceMaps(priceMaps) {
	return new Map(CANDIDATES.map((candidate) => [candidate.symbol, priceMaps.get(candidate.symbol)]));
}

function rotationsFromChecks(checks) {
	return checks
		.filter((check) => check.action === "rotated")
		.map((check) => ({ date: check.effectiveMarketDate, to: check.holderAfter }));
}

function mergeSnapshotsByDate(existing, incoming) {
	const byDate = new Map();
	existing.forEach((snapshot) => byDate.set(snapshot.date, normalizeSnapshot(snapshot)));
	incoming.forEach((snapshot) => byDate.set(snapshot.date, normalizeSnapshot(snapshot)));
	return Array.from(byDate.values()).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeSnapshot(snapshot) {
	if (!snapshot || !snapshot.date) {
		return null;
	}
	const strategyValue = positiveNumber(snapshot.strategyValue);
	const spyValue = positiveNumber(snapshot.spyValue);
	const qqqValue = positiveNumber(snapshot.qqqValue);
	if (!strategyValue || !spyValue || !qqqValue) {
		return null;
	}
	return {
		date: snapshot.date,
		strategySymbol: snapshot.strategySymbol,
		strategyValue: roundMoney(strategyValue),
		spyValue: roundMoney(spyValue),
		qqqValue: roundMoney(qqqValue),
		excessVsSpy: roundMoney(strategyValue - spyValue),
		excessVsQqq: roundMoney(strategyValue - qqqValue),
		strategyPrice: roundMoney(snapshot.strategyPrice),
		spyPrice: roundMoney(snapshot.spyPrice),
		qqqPrice: roundMoney(snapshot.qqqPrice)
	};
}

function normalizeChecks(checks) {
	return Array.isArray(checks) ? checks.slice() : [];
}

function normalizeChronicle(entries) {
	return Array.isArray(entries) ? entries.slice() : [];
}

function isMigratedData(data) {
	return Boolean(
		data
		&& data.schemaVersion >= 2
		&& data.strategyStartDate === STRATEGY_START_DATE
		&& data.history
		&& data.history.schemaVersion >= 2
		&& Array.isArray(data.successionChecks)
	);
}

function validateOutput(data) {
	if (!data.currentKing || !data.currentKing.symbol || !positiveNumber(data.currentKing.price)) {
		throw new Error("Refusing to write invalid throne data: current king is incomplete.");
	}
	if (!Array.isArray(data.challengers) || data.challengers.length !== CANDIDATES.length) {
		throw new Error("Refusing to write invalid throne data: challenger list is incomplete.");
	}
	if (data.challengers.some((candidate) => !candidate.marketCapIsFresh)) {
		throw new Error("Refusing to write invalid throne data: a challenger market cap is stale.");
	}
	if (new Set(data.challengers.map((candidate) => candidate.issuerId)).size !== data.challengers.length) {
		throw new Error("Refusing to write invalid throne data: duplicate corporate issuers are ranked.");
	}
	if (!data.history || !Array.isArray(data.history.snapshots) || data.history.snapshots.length < 2) {
		throw new Error("Refusing to write invalid throne data: history is incomplete.");
	}
	if (data.history.snapshots[0].date !== STRATEGY_START_DATE) {
		throw new Error("Refusing to write invalid throne data: history does not begin on March 31.");
	}
	if (!Array.isArray(data.successionChecks) || data.successionChecks.length < 3) {
		throw new Error("Refusing to write invalid throne data: reconstructed succession checks are missing.");
	}
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

function requireCurrentMarket(marketData, symbol) {
	const market = marketData.find((candidate) => candidate.symbol === symbol);
	if (!market || !market.priceIsFresh) {
		throw new Error(`Fresh current price is required for ${symbol}.`);
	}
	return market;
}

function requireMapPrice(priceMaps, symbol, date) {
	const price = positiveNumber(priceMaps.get(symbol) && priceMaps.get(symbol).get(date));
	if (!price) {
		throw new Error(`Missing ${symbol} price for ${date}.`);
	}
	return price;
}

function priceMapFromRecords(records) {
	const prices = new Map();
	records.forEach((record) => {
		const price = positiveNumber(record && (record.close || record.adjClose || record.price));
		if (record && record.date && price) {
			prices.set(record.date, price);
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
	return { date, price: prices.get(date) };
}

function latestReferenceDate(marketData) {
	const dates = marketData.map((candidate) => candidate.marketCapDate || candidate.priceDate).filter(Boolean).sort();
	return dates.length ? dates[dates.length - 1] : null;
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

function existingValues(existingData, field) {
	const values = new Map();
	if (existingData && existingData.currentKing && existingData.currentKing.symbol) {
		values.set(existingData.currentKing.symbol, existingData.currentKing[field]);
	}
	if (existingData && Array.isArray(existingData.challengers)) {
		existingData.challengers.forEach((company) => values.set(company.symbol, company[field]));
	}
	return values;
}

function validateCandidateUniverse(candidates) {
	const symbols = candidates.map((candidate) => candidate.symbol);
	const issuerIds = candidates.map((candidate) => candidate.issuerId);
	if (new Set(symbols).size !== symbols.length) {
		throw new Error("Candidate universe contains duplicate ticker symbols.");
	}
	if (issuerIds.some((issuerId) => !issuerId) || new Set(issuerIds).size !== issuerIds.length) {
		throw new Error("Candidate universe must contain one canonical ticker per corporate issuer.");
	}
}

function displaySymbol(fmpSymbol) {
	const candidate = CANDIDATES.find((item) => item.fmpSymbol === fmpSymbol);
	return candidate ? candidate.symbol : fmpSymbol;
}

function toYahooSymbol(symbol) {
	return symbol.replace(".", "-");
}

function daysBefore(date, days) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() - days);
	return next;
}

function positiveNumber(value) {
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

module.exports = {
	CANDIDATES,
	rebuildStrategy,
	reconstructChecks,
	resolveCandidateMarketData,
	updateStrategy,
	validateCandidateUniverse,
	validateOutput
};
