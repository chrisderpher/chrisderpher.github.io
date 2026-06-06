# Humble Choice Steam Claimer

A supervised Playwright script for redeeming your own Humble Choice Steam keys without clicking through the same modal workflow over and over.

It opens a visible browser, lets you sign into Humble and Steam yourself, clicks Humble's **Get game on Steam** and **Redeem** controls, accepts Steam's subscriber agreement checkbox, clicks the Steam activation button, closes the Steam tab, and advances to the next Humble game with the right chevron.

## Important

Use this only with your own Humble and Steam accounts, for games you own or are entitled to redeem. This script does not bypass purchases, logins, Steam Guard, captchas, payment, region restrictions, or account limits. Keep the browser visible and supervise it. Humble or Steam can change their page layouts at any time, so stop the script if anything looks wrong.

## Requirements

- Windows 10/11
- Node.js 20 or newer from <https://nodejs.org/>
- A Humble Choice month URL, such as `https://www.humblebundle.com/membership/july-2026`

## Install

Download/extract this folder, then open PowerShell in the folder and run:

```powershell
.\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL" -DryRun
```

The first run installs Playwright locally in this folder, then installs Playwright's Chromium browser as a fallback. The browser profile is stored in `browser-profile`, so you may need to sign into Humble and Steam once inside the browser that opens.

If PowerShell blocks local scripts, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL" -DryRun
```

## Use

Start with a dry run so you can verify the detected games:

```powershell
.\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL" -DryRun
```

Run with pauses before each game and Steam activation page:

```powershell
.\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL"
```

Run continuously while you supervise:

```powershell
.\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL" -Continuous
```

Example:

```powershell
.\run-humble-claimer.ps1 -Url "https://www.humblebundle.com/membership/july-2026" -Continuous
```

## Options

```powershell
# Revisit cards already marked CLAIMED.
.\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL" -IncludeClaimed

# Use a specific game order.
.\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL" -Games "Game One; Game Two; Game Three"

# Keep Steam tabs open after activation attempts.
.\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL" -KeepSteamOpen

# Reopen each game from the grid instead of advancing with the modal right chevron.
.\run-humble-claimer.ps1 -Url "HUMBLE_MONTH_URL" -GridNavigation
```

## How It Works

The script uses Playwright as a browser automation library. Playwright can launch and control Chromium/Chrome, find elements on the page, click them, wait for page changes, detect pop-up tabs, and close tabs after a task is complete.

This script uses a visible, persistent browser profile rather than a hidden browser. That means you can watch it work, stop it with `Ctrl+C`, and sign in normally if Humble or Steam asks.

## Troubleshooting

- If game detection looks wrong, stop and run with `-Games "Exact Title; Another Exact Title"`.
- If advancing to the next game fails, try `-GridNavigation`.
- If Steam asks for Steam Guard, complete it manually in the browser, then press Enter in PowerShell.
- If the script cannot find buttons, Humble or Steam may have changed their page HTML.
