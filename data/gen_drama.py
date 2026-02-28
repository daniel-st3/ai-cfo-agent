"""
gen_drama.py — Generates a dramatic "SaaS Crisis & Recovery" demo dataset.

Story arc:
  Act 1 (Wks 01-12): Healthy growth, 0-0.5% churn, burn ~$18K/wk net
  Act 2 (Wks 13-26): CRISIS — 3 enterprise churns, marketing panic, burn spikes to $45K/wk
  Act 3 (Wks 27-38): Near-death — new mid-market wins trickle in, burn optimization
  Act 4 (Wks 39-55): Recovery — 2 enterprise re-signs, MRR climbs back
  Act 5 (Wks 56-78): Hypergrowth — 3 more enterprise wins, MRR hits ~$42K/wk

Run: python data/gen_drama.py
Outputs: data/sample_financials.csv
"""

import csv
import random
from datetime import date, timedelta

random.seed(42)

# ---------------------------------------------------------------------------
# Customer pool
# ---------------------------------------------------------------------------

ENTERPRISE = [
    ("acme_corp",         1200),
    ("ibm_venture",       1580),   # churns wk 15
    ("megasuite_llc",     1150),   # churns wk 18
    ("globaltech_corp",    980),   # churns wk 22
    ("microsoft_co",      1320),
    ("salesforce_co",     1100),   # churns wk 20
    ("oracle_startup",     900),   # joins wk 40 (recovery)
    ("sap_partner",       1050),   # joins wk 45
    ("ibm_rebuy",         1250),   # joins wk 57 (hypergrowth)
    ("enterprise_alpha",  1400),   # joins wk 62
]

MIDMARKET = [
    ("techco_llc",        420),
    ("bigcorp_inc",       380),
    ("hubspot_startup",   310),
    ("datadog_startup",   350),
    ("amplitude_inc",     330),
    ("mixpanel_startup",  290),
    ("posthog_llc",       370),
    ("fullstory_llc",     300),    # churns wk 17
    ("contentsquare",     340),
    ("hotjar_llc",        310),
    ("quantum_metric",    360),    # churns wk 24
    ("pendo_io",          320),
    ("heap_analytics",    330),
    ("logrocket_llc",     350),    # churns wk 25
    ("mouseflow_co",      290),
    ("segment_co",        370),
    ("notion_inc",        320),
    ("linear_co",         310),
    ("supabase_llc",      350),
    ("planetscale_inc",   340),
    ("vercel_co",         380),
    ("replicate_ai",      310),    # joins wk 35
    ("modal_labs",        330),    # joins wk 37
    ("clerk_dev",         300),    # joins wk 42
    ("resend_io",         320),    # joins wk 44
    ("drifting_co",       350),    # joins wk 48
]

SMB_BASE = [
    "company_c", "venture_d", "techstart_e", "founders_f", "builders_g",
    "makers_h", "doers_j", "innovate_k", "scale_l", "grow_m",
    "build_o", "pivot_p", "iterate_q", "release_t", "test_u",
    "demo_v", "trial_w", "prod_z", "alpha_y", "beta_x",
    "creators_i", "stage_aa", "dev_bb", "qa_cc", "ops_dd",
    "finance_ee", "hr_ff", "sales_gg", "mktg_hh", "eng_ii",
    "design_jj", "product_kk", "cs_ll", "data_mm", "infra_nn",
    "sec_oo", "legal_pp", "acctg_qq",
]

# ---------------------------------------------------------------------------
# Build active-customer schedule per week
# ---------------------------------------------------------------------------

START_DATE = date(2023, 1, 2)  # Monday
NUM_WEEKS = 78

rows: list[dict] = []

def week_date(wk: int) -> date:
    return START_DATE + timedelta(weeks=wk - 1)

def add(week: int, category: str, amount: float, customer_id: str = ""):
    rows.append({
        "date": week_date(week).isoformat(),
        "category": category,
        "amount": round(amount, 2),
        "customer_id": customer_id,
    })

# ---------------------------------------------------------------------------
# Build revenue schedule: who is active on which weeks
# ---------------------------------------------------------------------------

# Enterprise customers: (name, base_weekly_rate, join_week, churn_week)
enterprise_schedule = [
    ("acme_corp",        1200, 1,  None),
    ("ibm_venture",      1580, 2,  15),
    ("megasuite_llc",    1150, 3,  18),
    ("globaltech_corp",   980, 4,  22),
    ("microsoft_co",     1320, 5,  None),
    ("salesforce_co",    1100, 6,  20),
    ("oracle_startup",    900, 40, None),
    ("sap_partner",      1050, 45, None),
    ("ibm_rebuy",        1250, 57, None),
    ("enterprise_alpha", 1400, 62, None),
]

midmarket_schedule = [
    ("techco_llc",       420, 7,  None),
    ("bigcorp_inc",      380, 8,  None),
    ("hubspot_startup",  310, 9,  None),
    ("datadog_startup",  350, 10, None),
    ("amplitude_inc",    330, 11, None),
    ("mixpanel_startup", 290, 12, None),
    ("posthog_llc",      370, 13, None),
    ("fullstory_llc",    300, 14, 17),
    ("contentsquare",    340, 15, None),
    ("hotjar_llc",       310, 16, None),
    ("quantum_metric",   360, 17, 24),
    ("pendo_io",         320, 18, None),
    ("heap_analytics",   330, 19, None),
    ("logrocket_llc",    350, 20, 25),
    ("mouseflow_co",     290, 21, None),
    ("segment_co",       370, 22, None),
    ("notion_inc",       320, 23, None),
    ("linear_co",        310, 24, None),
    ("supabase_llc",     350, 25, None),
    ("planetscale_inc",  340, 26, None),
    ("vercel_co",        380, 27, None),
    ("replicate_ai",     310, 35, None),
    ("modal_labs",       330, 37, None),
    ("clerk_dev",        300, 42, None),
    ("resend_io",        320, 44, None),
    ("drifting_co",      350, 48, None),
]

# SMB: one new per week from week 28 onward (fill in the gaps after crisis)
# Weeks 1-27 already covered by enterprise + midmarket joins above (27 customers)
# Remaining SMB customers: weeks 28-78 = 51 slots
smb_schedule = []
smb_names = SMB_BASE + [
    "startup_b", "figma_startup", "smallbiz_a", "launch_n", "test_zz",
    "pilot_rr", "alpha_ss", "beta_tt", "gamma_uu", "delta_vv",
    "epsilon_ww", "zeta_xx", "growth_rr",
]
# Some SMBs churn in recent weeks to make KPIs realistic
SMB_LATE_CHURNS = {
    0:  65,   # "company_c"   joins wk 28, churns wk 65
    8:  70,   # "scale_l"     joins wk 36, churns wk 70
    16: 74,   # SMB_BASE[16]  joins wk 44, churns wk 74
    23: 77,   # SMB_BASE[23]  joins wk 51, churns wk 77
    31: 78,   # SMB_BASE[31]  joins wk 59, churns wk 78 (latest — shows in KPI)
}

smb_idx = 0
for wk in range(28, NUM_WEEKS + 1):
    if smb_idx < len(smb_names):
        base_rate = random.uniform(105, 165)
        churn_wk = SMB_LATE_CHURNS.get(smb_idx, None)
        smb_schedule.append((smb_names[smb_idx], base_rate, wk, churn_wk))
        smb_idx += 1

all_customers = enterprise_schedule + midmarket_schedule + smb_schedule

# ---------------------------------------------------------------------------
# Noise helper
# ---------------------------------------------------------------------------
def jitter(base: float, pct: float = 0.03) -> float:
    return base * (1 + random.uniform(-pct, pct))

# ---------------------------------------------------------------------------
# Generate subscription revenue + churn refunds
# ---------------------------------------------------------------------------

churn_refunds: dict[int, list[tuple[str, float]]] = {}

for name, base_rate, join_wk, churn_wk in all_customers:
    if churn_wk:
        refund_amount = base_rate * 0.5  # ~50% refund on churn
        churn_refunds.setdefault(churn_wk, []).append((name, refund_amount))

for name, base_rate, join_wk, churn_wk in all_customers:
    end_wk = (churn_wk - 1) if churn_wk else NUM_WEEKS
    for wk in range(join_wk, end_wk + 1):
        # Slight growth in rate over time (+0.1% per week compound)
        weeks_since_join = wk - join_wk
        rate = base_rate * (1.001 ** weeks_since_join) * jitter(1.0, 0.02)
        add(wk, "subscription_revenue", rate, name)

for churn_wk, items in churn_refunds.items():
    for cust_name, refund in items:
        add(churn_wk, "churn_refund", -refund, cust_name)

# ---------------------------------------------------------------------------
# Expenses — story-driven
# ---------------------------------------------------------------------------

for wk in range(1, NUM_WEEKS + 1):
    # --- Salary: grows, spikes during crisis hiring, then right-sizes ---
    if wk <= 12:
        salary = jitter(28000 + (wk - 1) * 200, 0.02)
    elif wk <= 20:
        # panic hiring during crisis
        salary = jitter(32000 + (wk - 12) * 2000, 0.03)
    elif wk <= 30:
        # peak headcount, unsustainable
        salary = jitter(48000, 0.02)
    elif wk <= 38:
        # layoffs / right-sizing
        salary = jitter(48000 - (wk - 30) * 1200, 0.02)
    else:
        # stabilized at lean team
        salary = jitter(38000 + (wk - 38) * 80, 0.02)
    add(wk, "salary_expense", -salary)

    # --- Software: relatively stable ---
    add(wk, "software_expense", -jitter(2600 + wk * 15, 0.03))

    # --- Office rent: fixed ---
    add(wk, "office_rent", -5200)

    # --- Marketing: normal → panic spike in crisis → optimized ---
    if wk <= 12:
        marketing = jitter(5000 + wk * 100, 0.08)
    elif wk == 15:
        marketing = 28000  # panic spike — 3× normal, ANOMALY
    elif 13 <= wk <= 18:
        marketing = jitter(16000, 0.1)
    elif 19 <= wk <= 26:
        # trying to recover but pulling back
        marketing = jitter(12000 - (wk - 19) * 600, 0.08)
    elif 27 <= wk <= 40:
        # lean mode
        marketing = jitter(6000, 0.07)
    else:
        # growth mode — efficient spend
        marketing = jitter(7000 + (wk - 40) * 50, 0.07)
    add(wk, "marketing_expense", -marketing)

# COGS: ~26-28% of subscription revenue — compute after revenue rows exist
# We'll compute it below after collecting total rev per week

# --- Travel: sporadic ---
travel_weeks = sorted(random.sample(range(1, NUM_WEEKS + 1), 48))
for wk in travel_weeks:
    add(wk, "travel_expense", -round(random.uniform(80, 900), 2))

# --- Contractor: sporadic + spike at wk 50 ---
contractor_weeks = sorted(random.sample([w for w in range(1, NUM_WEEKS + 1) if w != 50], 14))
for wk in contractor_weeks:
    add(wk, "contractor_expense", -round(random.uniform(400, 2500), 2))
add(50, "contractor_expense", -7800)  # ANOMALY spike

# --- Professional services: quarterly-ish ---
for wk in [10, 22, 35, 48, 62, 74]:
    if wk <= NUM_WEEKS:
        add(wk, "professional_services", -round(random.uniform(800, 2200), 2))

# --- Tax payments: quarterly ---
for wk in [13, 26, 39, 52, 65, 78]:
    if wk <= NUM_WEEKS:
        add(wk, "tax_payment", -6000)

# ---------------------------------------------------------------------------
# COGS: ~26-28% of that week's subscription revenue
# ---------------------------------------------------------------------------

# Collect subscription revenue per week
rev_by_week: dict[int, float] = {}
for r in rows:
    if r["category"] == "subscription_revenue":
        wk_num = (date.fromisoformat(r["date"]) - START_DATE).days // 7 + 1
        rev_by_week[wk_num] = rev_by_week.get(wk_num, 0) + abs(r["amount"])

for wk in range(1, NUM_WEEKS + 1):
    rev = rev_by_week.get(wk, 0)
    cogs_pct = random.uniform(0.25, 0.28)
    add(wk, "cogs", -round(rev * cogs_pct, 2))

# ---------------------------------------------------------------------------
# Sort and write CSV
# ---------------------------------------------------------------------------

rows.sort(key=lambda r: (r["date"], r["category"], r["customer_id"] or ""))

output_path = "data/sample_financials.csv"
with open(output_path, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["date", "category", "amount", "customer_id"])
    writer.writeheader()
    writer.writerows(rows)

# ---------------------------------------------------------------------------
# Summary stats
# ---------------------------------------------------------------------------
total = len(rows)
unique_dates = len(set(r["date"] for r in rows))
churn_count = sum(1 for r in rows if r["category"] == "churn_refund")
cust_set = set(r["customer_id"] for r in rows if r["customer_id"])

print(f"✓ Generated {output_path}")
print(f"  {total:,} rows · {unique_dates} weeks · {len(cust_set)} unique customers")
print(f"  {churn_count} churn_refund events")
print(f"  Dates: {rows[0]['date']} → {rows[-1]['date']}")
