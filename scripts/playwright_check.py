#!/usr/bin/env python3
"""
playwright_check.py — Visual QA for the AI CFO Agent dashboard.

Requirements:
  pip install playwright
  playwright install chromium

Usage (services must be running):
  python3 scripts/playwright_check.py

Saves screenshots to /tmp/cfo_shots/
"""

import asyncio
import os
import time
from pathlib import Path

FRONTEND_URL = "http://localhost:3000"
SHOTS_DIR    = Path("/tmp/cfo_shots")


async def run() -> None:
    from playwright.async_api import async_playwright

    SHOTS_DIR.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page    = await browser.new_page(viewport={"width": 1440, "height": 900})

        # ── 1. Landing page ────────────────────────────────────────────────
        print("→ Loading landing page…")
        await page.goto(FRONTEND_URL, wait_until="networkidle")
        await page.screenshot(path=str(SHOTS_DIR / "01_landing.png"), full_page=True)
        print("  ✓ 01_landing.png")

        # ── 2. Click Run Demo ──────────────────────────────────────────────
        print("→ Clicking Run Demo…")
        # Try several selectors — button text may vary
        for selector in [
            "button:has-text('Run Live Demo')",
            "button:has-text('Run Demo')",
            "button:has-text('Demo')",
        ]:
            run_demo_btn = page.locator(selector).first
            if await run_demo_btn.is_visible(timeout=2000):
                break
        await run_demo_btn.click(timeout=10000)

        # Wait for pipeline animation to start
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(SHOTS_DIR / "02_pipeline_start.png"), full_page=True)
        print("  ✓ 02_pipeline_start.png")

        # ── 3. Wait for dashboard to load ──────────────────────────────────
        print("→ Waiting for dashboard…")
        max_wait = 120  # seconds
        start    = time.time()
        while time.time() - start < max_wait:
            if "/run/" in page.url:
                break
            await page.wait_for_timeout(1000)

        if "/run/" not in page.url:
            print("  ✗ Timed out waiting for dashboard redirect")
            await browser.close()
            return

        # Give charts time to render
        await page.wait_for_timeout(5000)

        # ── 4. Full page screenshot ────────────────────────────────────────
        await page.screenshot(path=str(SHOTS_DIR / "03_dashboard_full.png"), full_page=True)
        print("  ✓ 03_dashboard_full.png")

        # ── 5. Per-section screenshots ─────────────────────────────────────
        sections = [
            ("KPI Command Center",       "04_kpi_cards.png"),
            ("Runway Explorer",          "05_runway_explorer.png"),
            ("13-Week Cash Position",    "06_cash_forecast.png"),
            ("Revenue & Survival",       "07_revenue_survival.png"),
            ("Competitive Intelligence", "08_competitor_intel.png"),
            ("Scenario Stress Test",     "09_scenarios.png"),
            ("Financial Deep Dive",      "10_deep_dive.png"),
            ("Customer Profitability",   "11_customer_matrix.png"),
            ("Fraud Monitor",            "12_fraud_monitor.png"),
            ("Anomaly Detection",        "13_anomalies.png"),
            ("Fundraising Readiness",    "14_fundraising.png"),
            ("Morning CFO Briefing",     "15_morning_briefing.png"),
            ("AI Intelligence Center",   "16_ai_center.png"),
        ]

        for heading_text, filename in sections:
            try:
                # Try h2 first, then any element containing the text
                heading = page.locator(f"h2:has-text('{heading_text}')").first
                if not await heading.is_visible(timeout=2000):
                    heading = page.locator(f"*:has-text('{heading_text}')").first
                if await heading.is_visible(timeout=2000):
                    await heading.scroll_into_view_if_needed()
                    await page.wait_for_timeout(600)
                    bbox = await heading.bounding_box()   # await bounding_box separately
                    top_y = max(0, bbox["y"] - 20) if bbox else 0
                    await page.screenshot(
                        path=str(SHOTS_DIR / filename),
                        clip={"x": 0, "y": top_y, "width": 1440, "height": 700},
                    )
                    print(f"  ✓ {filename}")
                else:
                    print(f"  ⚠ Not found: {heading_text}")
            except Exception as e:
                print(f"  ✗ Error capturing {filename}: {e}")

        # ── 6. Click a KPI card to test deep-dive ─────────────────────────
        try:
            mrr_card = page.locator("div:has-text('MRR')").first
            await mrr_card.click()
            await page.wait_for_timeout(1000)
            await page.screenshot(path=str(SHOTS_DIR / "15_kpi_deep_dive.png"), full_page=False)
            print("  ✓ 15_kpi_deep_dive.png")
        except Exception as e:
            print(f"  ⚠ KPI deep-dive click failed: {e}")

        # ── 7. Click Benchmarker tab in AI Intelligence Center ─────────────
        try:
            bench_tab = page.locator("button:has-text('Benchmarker')").first
            if await bench_tab.is_visible():
                await bench_tab.scroll_into_view_if_needed()
                await bench_tab.click()
                await page.wait_for_timeout(500)
                await page.screenshot(path=str(SHOTS_DIR / "16_benchmarker_tab.png"), full_page=False)
                print("  ✓ 16_benchmarker_tab.png")
        except Exception as e:
            print(f"  ⚠ Benchmarker tab failed: {e}")

        await browser.close()

    print(f"\n✅ Done — {len(list(SHOTS_DIR.glob('*.png')))} screenshots saved to {SHOTS_DIR}/")


if __name__ == "__main__":
    asyncio.run(run())
