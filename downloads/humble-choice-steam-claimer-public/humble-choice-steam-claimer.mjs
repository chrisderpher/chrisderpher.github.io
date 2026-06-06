#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultProfile = path.join(scriptDir, "browser-profile");
const defaultUrl = "https://www.humblebundle.com/membership/home";
const keyPattern = /\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){2,5}\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function usage() {
  return `
Supervised Humble Choice -> Steam redeemer

Usage:
  node humble-choice-steam-claimer.mjs --url "https://www.humblebundle.com/..." [options]

Options:
  --url <url>             Humble Choice page to open. Defaults to membership home.
  --games <list>          Comma, semicolon, pipe, or newline separated game titles.
  --games-file <path>     Text file with one game title per line.
  --limit <n>             Max games to process when auto-detecting. Default: 20.
  --include-claimed       Also revisit cards marked CLAIMED.
  --continuous            Do not pause before each game. Ctrl+C still stops instantly.
  --dry-run               List detected/planned games without clicking anything.
  --grid-navigation       Reopen each game from the grid instead of using the modal right chevron.
  --keep-steam-open       Leave Steam tabs open after activation attempts.
  --profile <path>        Browser profile folder. Default: ./browser-profile.
  --slow <ms>             Extra Playwright delay between actions. Default: 250.
  --help                  Show this help.
`.trim();
}

function parseArgs(argv) {
  const out = {
    url: defaultUrl,
    games: [],
    gamesFile: "",
    limit: 20,
    includeClaimed: false,
    continuous: false,
    dryRun: false,
    useChevron: true,
    keepSteamOpen: false,
    profile: defaultProfile,
    slow: 250,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value after ${arg}`);
      i += 1;
      return argv[i];
    };

    switch (arg) {
      case "--url":
        out.url = next();
        break;
      case "--games":
        out.games = splitTitles(next());
        break;
      case "--games-file":
        out.gamesFile = next();
        break;
      case "--limit":
        out.limit = Number.parseInt(next(), 10);
        break;
      case "--include-claimed":
        out.includeClaimed = true;
        break;
      case "--continuous":
        out.continuous = true;
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--grid-navigation":
        out.useChevron = false;
        break;
      case "--keep-steam-open":
        out.keepSteamOpen = true;
        break;
      case "--profile":
        out.profile = path.resolve(next());
        break;
      case "--slow":
        out.slow = Number.parseInt(next(), 10);
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(out.limit) || out.limit < 1) out.limit = 20;
  if (!Number.isFinite(out.slow) || out.slow < 0) out.slow = 250;
  return out;
}

function splitTitles(value) {
  return value
    .split(/[\n,;|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function loadGamesFile(filePath) {
  if (!filePath) return [];
  const content = await fs.readFile(path.resolve(filePath), "utf8");
  return content
    .split(/\r?\n/g)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

function maskKey(key) {
  const clean = String(key || "").trim();
  if (!clean) return "";
  const parts = clean.split("-");
  if (parts.length < 3) return `${clean.slice(0, 3)}...`;
  return `${parts[0]}-...-${parts.at(-1)}`;
}

function normalizeTitle(title) {
  return String(title || "").replace(/\s+/g, " ").trim();
}

function resultLine(text) {
  const oneLine = String(text || "").replace(/\s+/g, " ").trim();
  return oneLine.length > 180 ? `${oneLine.slice(0, 180)}...` : oneLine;
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    console.error("Playwright is not installed yet.");
    console.error('Run: npm install');
    throw error;
  }
}

async function launchBrowser(chromium, options) {
  await fs.mkdir(options.profile, { recursive: true });

  const launchOptions = {
    headless: false,
    slowMo: options.slow,
    viewport: { width: 1440, height: 1000 },
  };

  try {
    return await chromium.launchPersistentContext(options.profile, {
      ...launchOptions,
      channel: "chrome",
    });
  } catch (chromeError) {
    console.warn("Could not launch system Chrome through Playwright; trying bundled Chromium.");
    try {
      return await chromium.launchPersistentContext(options.profile, launchOptions);
    } catch (chromiumError) {
      console.error("Could not launch a browser.");
      console.error("If this is the first run, try: npx playwright install chromium");
      console.error(`Chrome launch error: ${chromeError.message}`);
      throw chromiumError;
    }
  }
}

async function ask(rl, message) {
  await rl.question(`${message}\nPress Enter to continue, or Ctrl+C to stop. `);
}

async function waitVisible(locator, timeout = 2000) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function clickAny(page, choices, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastError = null;

  while (Date.now() < deadline) {
    for (const choice of choices) {
      const locator =
        typeof choice === "string"
          ? page.locator(choice)
          : choice.kind === "role"
            ? page.getByRole(choice.role, { name: choice.name })
            : choice.hasText
              ? page.locator(choice.selector).filter({ hasText: choice.hasText })
              : page.locator(choice.selector);

      const count = Math.min(await locator.count().catch(() => 0), 20);
      for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i);
        if (!(await item.isVisible().catch(() => false))) continue;
        try {
          await item.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
          await item.click({ timeout: 5000 });
          return true;
        } catch (error) {
          lastError = error;
        }
      }
    }
    await sleep(400);
  }

  throw new Error(`Could not find/click ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

async function findKey(page, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    const match = body.match(keyPattern);
    if (match) return match[0].toUpperCase();
    await sleep(500);
  }
  return "";
}

async function extractHumbleCards(page, includeClaimed) {
  return page.evaluate(({ includeClaimed: includeClaimedInPage }) => {
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const hasGameishClass = (element) => {
      const cls = String(element.className || "").toLowerCase();
      return ["card", "choice", "game", "tile", "content"].some((needle) => cls.includes(needle));
    };
    const isActuallyVisible = (element) => {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const hasImageishContent = (element) => {
      if (element.querySelector("img, picture, source, svg")) return true;
      if (window.getComputedStyle(element).backgroundImage !== "none") return true;
      return Array.from(element.querySelectorAll("*")).some(
        (child) => window.getComputedStyle(child).backgroundImage !== "none",
      );
    };

    const badText = [
      /get game on steam/i,
      /gift to friend/i,
      /here'?s your key/i,
      /^\s*redeem\s*$/i,
      /must be redeemed/i,
      /return to your membership/i,
      /select games/i,
      /march 20\d{2} games/i,
      /march 20\d{2} extras/i,
    ];

    const raw = [];
    const elements = Array.from(document.querySelectorAll("a, button, [role='button'], li, article, div"));

    for (const element of elements) {
      if (!isActuallyVisible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 130 || rect.height < 100 || rect.width > 540 || rect.height > 430) continue;
      if (!hasImageishContent(element) && !hasGameishClass(element)) continue;

      const text = normalize(element.innerText || element.textContent || "");
      if (!text || text.length > 200) continue;
      if (badText.some((pattern) => pattern.test(text))) continue;

      const claimed = /\bclaimed\b/i.test(text);
      if (!includeClaimedInPage && claimed) continue;

      const rawLines = String(element.innerText || element.textContent || "")
        .split(/\n+/g)
        .map(normalize)
        .filter(Boolean);
      const lines = rawLines.filter((line) => !/^(claimed|steam|key)$/i.test(line));
      let title = lines.find((line) => /[A-Za-z0-9]/.test(line) && line.length >= 2 && line.length <= 90);
      if (!title) continue;
      title = title.replace(/^[\u2713\-\s]+/, "").trim();
      if (!title || /ign\s*\+?\s*plus/i.test(title)) continue;

      raw.push({
        title,
        claimed,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        top: Math.round(rect.top + window.scrollY),
        left: Math.round(rect.left + window.scrollX),
        area: Math.round(rect.width * rect.height),
      });
    }

    raw.sort((a, b) => a.area - b.area);
    const byTitle = new Map();
    for (const card of raw) {
      const key = card.title.toLowerCase();
      if (!byTitle.has(key)) byTitle.set(key, card);
    }

    return Array.from(byTitle.values()).sort((a, b) => a.top - b.top || a.left - b.left);
  }, { includeClaimed });
}

async function clickGameCard(page, title) {
  const clicked = await page.evaluate((wanted) => {
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const wantedNorm = normalize(wanted).toLowerCase();
    const elements = Array.from(document.querySelectorAll("body *")).filter((element) => {
      const text = normalize(element.innerText || element.textContent || "");
      return text && (text.toLowerCase() === wantedNorm || text.toLowerCase().includes(wantedNorm));
    });

    elements.sort((a, b) => {
      const aExact = normalize(a.innerText || a.textContent || "").toLowerCase() === wantedNorm ? 0 : 1;
      const bExact = normalize(b.innerText || b.textContent || "").toLowerCase() === wantedNorm ? 0 : 1;
      const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
      const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
      return aExact - bExact || aArea - bArea;
    });

    const target = elements[0];
    if (!target) return false;

    const classLooksLikeCard = (element) => {
      const cls = String(element.className || "").toLowerCase();
      return ["card", "choice", "game", "tile", "content"].some((needle) => cls.includes(needle));
    };

    let clickTarget = target.closest("a, button, [role='button']");
    if (!clickTarget) {
      for (let current = target; current && current !== document.body; current = current.parentElement) {
        const rect = current.getBoundingClientRect();
        if (rect.width >= 120 && rect.width <= 540 && rect.height >= 80 && rect.height <= 430 && classLooksLikeCard(current)) {
          clickTarget = current;
          break;
        }
      }
    }
    clickTarget ||= target;
    clickTarget.scrollIntoView({ block: "center", inline: "center" });
    clickTarget.click();
    return true;
  }, title);

  if (!clicked) {
    throw new Error(`Could not find the game card/title "${title}"`);
  }

  await page.waitForTimeout(1200);
}

async function clickHumbleGetGame(page) {
  return clickAny(
    page,
    [
      { kind: "role", role: "button", name: /get\s+game\s+on\s+steam/i },
      { kind: "role", role: "link", name: /get\s+game\s+on\s+steam/i },
      { selector: ".js-keyfield.keyfield.enabled, [title='Get game on Steam']", hasText: /get\s+game\s+on\s+steam/i },
      { selector: "button, a, [role='button']", hasText: /get\s+game\s+on\s+steam/i },
      { selector: "div", hasText: /^get\s+game\s+on\s+steam$/i },
    ],
    "Humble 'Get game on Steam'",
    10000,
  );
}

async function clickHumbleRedeemAndGetSteamPage(humblePage) {
  const context = humblePage.context();
  const popupPromise = context.waitForEvent("page", { timeout: 15000 }).catch(() => null);

  await clickAny(
    humblePage,
    [
      { kind: "role", role: "button", name: /^redeem$/i },
      { kind: "role", role: "link", name: /^redeem$/i },
      { selector: ".js-redeem-button, .redeem-button, .steam-redeem-button", hasText: /^redeem$/i },
      { selector: "button, a, [role='button']", hasText: /^redeem$/i },
      { selector: "div", hasText: /^redeem$/i },
    ],
    "Humble 'Redeem'",
    15000,
  );

  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    return popup;
  }

  await humblePage.waitForTimeout(3000);
  if (/steam/i.test(humblePage.url())) return humblePage;

  const steamPage = context.pages().find((page) => page !== humblePage && /steam/i.test(page.url()));
  if (steamPage) return steamPage;

  throw new Error("The Redeem click did not open a Steam page that I could detect.");
}

async function ensureSteamLoggedIn(steamPage, rl) {
  await steamPage.bringToFront();
  await steamPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});

  const needsLogin =
    /login|signin/i.test(steamPage.url()) ||
    (await steamPage.locator("input[type='password']").first().isVisible().catch(() => false));

  if (needsLogin) {
    await ask(rl, "Steam is asking for a login in the automation browser. Finish signing in there.");
    await steamPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  }
}

async function activateOnSteam(steamPage, rl, options) {
  await ensureSteamLoggedIn(steamPage, rl);

  if (!options.continuous) {
    await ask(rl, "Steam activation page is up.");
  }

  if (options.dryRun) return "dry run";

  const checkbox = steamPage.locator("#accept_ssa, input[type='checkbox']").first();
  if (await waitVisible(checkbox, 8000)) {
    await checkbox.check({ force: true }).catch(async () => {
      await checkbox.click({ force: true });
    });
  } else {
    await clickAny(
      steamPage,
      [
        { selector: "label, span, div", hasText: /subscriber agreement|user agreement|i agree/i },
      ],
      "Steam agreement checkbox/label",
      6000,
    );
  }

  await clickAny(
    steamPage,
    [
      "#register_btn",
      { kind: "role", role: "button", name: /continue|redeem|activate/i },
      { kind: "role", role: "link", name: /continue|redeem|activate/i },
      { selector: "button, a, input[type='button'], input[type='submit']", hasText: /continue|redeem|activate/i },
    ],
    "Steam continue/redeem button",
    12000,
  );

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const text = await steamPage.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const match = text.match(/activation successful|successfully activated|already own|already.*activated|already been registered|duplicate|invalid|problem registering|too many activation attempts/i);
    if (match) return resultLine(text.slice(Math.max(0, match.index - 40), match.index + 180));
    await sleep(700);
  }

  return "Steam did not show a known success/error message within 30 seconds. Leaving the visible page state as the source of truth.";
}

async function resetHumbleFocus(humblePage) {
  await humblePage.bringToFront().catch(() => {});
  await humblePage.keyboard.press("Escape").catch(() => {});
  await humblePage.mouse.click(18, 18).catch(() => {});
  await humblePage.waitForTimeout(800).catch(() => {});
}

async function getHumbleModalTitle(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const modal = document.querySelector(".choice-modal, .humblemodal-modal, #site-modal, .modal") || document.body;
    const candidates = Array.from(modal.querySelectorAll("h1, h2, h3, [class*='title']"));
    for (const candidate of candidates) {
      if (!visible(candidate)) continue;
      const text = normalize(candidate.innerText || candidate.textContent || "");
      if (text && text.length <= 90 && !/humble bundle presents/i.test(text)) return text;
    }
    return "";
  }).catch(() => "");
}

async function clickNextHumbleModal(page, previousTitle) {
  await page.bringToFront().catch(() => {});
  const before = previousTitle || (await getHumbleModalTitle(page));

  await clickAny(
    page,
    [
      "a.js-right-arrow.right-arrow",
      ".choice-modal a.js-right-arrow",
      ".humblemodal-modal a.js-right-arrow",
      "a.right-arrow",
      ".js-right-arrow",
      ".hb-chevron-right",
    ],
    "Humble modal right chevron",
    10000,
  );

  if (before) {
    await page
      .waitForFunction(
        (oldTitle) => {
          const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
          const visible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const modal = document.querySelector(".choice-modal, .humblemodal-modal, #site-modal, .modal") || document.body;
          const candidates = Array.from(modal.querySelectorAll("h1, h2, h3, [class*='title']"));
          for (const candidate of candidates) {
            if (!visible(candidate)) continue;
            const text = normalize(candidate.innerText || candidate.textContent || "");
            if (text && text.length <= 90 && !/humble bundle presents/i.test(text) && text !== oldTitle) return true;
          }
          return false;
        },
        before,
        { timeout: 8000 },
      )
      .catch(() => {});
  }

  await page.waitForTimeout(1000).catch(() => {});
  const after = await getHumbleModalTitle(page);
  if (after) console.log(`Advanced Humble carousel to: ${after}`);
}

async function processGame(humblePage, rl, options, title, index, hasNext) {
  console.log(`\n[${index}] ${title}`);
  if (!options.continuous) {
    await ask(rl, `Ready to process "${title}" on Humble.`);
  }

  await humblePage.bringToFront();
  if (!options.useChevron || index === 1) {
    await clickGameCard(humblePage, title);
  } else {
    const currentTitle = await getHumbleModalTitle(humblePage);
    if (currentTitle) console.log(`Humble modal currently shows: ${currentTitle}`);
  }

  let gotKeyWithoutGetButton = false;
  try {
    await clickHumbleGetGame(humblePage);
  } catch (error) {
    const existingKey = await findKey(humblePage, 1500);
    if (!existingKey) throw error;
    gotKeyWithoutGetButton = true;
  }

  const key = await findKey(humblePage, gotKeyWithoutGetButton ? 3000 : 30000);
  console.log(key ? `Humble key shown: ${maskKey(key)}` : "Humble key was not detected, but I will look for the Redeem button.");

  const steamPage = await clickHumbleRedeemAndGetSteamPage(humblePage);
  const steamResult = await activateOnSteam(steamPage, rl, options);
  console.log(`Steam result: ${steamResult}`);

  if (!options.keepSteamOpen && steamPage !== humblePage) {
    await steamPage.close({ runBeforeUnload: true }).catch(() => {});
  } else if (steamPage === humblePage && !options.keepSteamOpen) {
    await humblePage.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  }

  if (options.useChevron && hasNext) {
    await clickNextHumbleModal(humblePage, title);
  } else if (!options.useChevron) {
    await resetHumbleFocus(humblePage);
  } else {
    await humblePage.bringToFront().catch(() => {});
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const fileGames = await loadGamesFile(options.gamesFile);
  options.games = [...options.games, ...fileGames].map(normalizeTitle).filter(Boolean);

  const { chromium } = await importPlaywright();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const context = await launchBrowser(chromium, options);
  context.setDefaultTimeout(15000);

  try {
    const humblePage = context.pages()[0] || (await context.newPage());
    await humblePage.goto(options.url, { waitUntil: "domcontentloaded", timeout: 45000 });

    console.log("\nAutomation browser opened.");
    console.log("Use this browser window to sign into Humble and Steam if prompted.");
    console.log("Navigate to the Humble Choice grid if the current page is not already there.");
    await ask(rl, "When the Humble Choice game grid is visible");

    let titles = options.games;
    if (!titles.length) {
      const cards = await extractHumbleCards(humblePage, options.includeClaimed);
      titles = cards.map((card) => card.title).slice(0, options.limit);
      console.log("\nDetected Humble cards:");
      if (!titles.length) {
        console.log("  No eligible cards detected. Try --include-claimed or pass --games.");
      } else {
        titles.forEach((title, idx) => console.log(`  ${idx + 1}. ${title}`));
      }
    } else {
      console.log("\nUsing explicit game list:");
      titles.forEach((title, idx) => console.log(`  ${idx + 1}. ${title}`));
    }

    if (options.dryRun) {
      console.log("\nDry run complete. No clicks were made.");
      return;
    }

    if (!titles.length) return;
    await ask(rl, "Ready to start. Keep the browser visible so you can supervise.");

    let index = 1;
    const uniqueTitles = [];
    const uniqueKeys = new Set();
    for (const title of titles) {
      const key = normalizeTitle(title).toLowerCase();
      if (uniqueKeys.has(key)) continue;
      uniqueKeys.add(key);
      uniqueTitles.push(title);
    }

    for (let titleIndex = 0; titleIndex < uniqueTitles.length; titleIndex += 1) {
      const title = uniqueTitles[titleIndex];
      const hasNext = titleIndex < uniqueTitles.length - 1;
      try {
        await processGame(humblePage, rl, options, title, index, hasNext);
      } catch (error) {
        console.error(`Stopped on "${title}": ${error.message}`);
        console.error("The browser has been left open so you can inspect the page.");
        throw error;
      }

      index += 1;
    }

    console.log("\nDone. Review Humble/Steam visually before closing the automation browser.");
  } finally {
    rl.close();
    if (!options.keepSteamOpen) {
      // Keep the main browser window open for review; the user can close it when satisfied.
    }
  }
}

main().catch((error) => {
  console.error(`\nFatal: ${error.message}`);
  process.exitCode = 1;
});
