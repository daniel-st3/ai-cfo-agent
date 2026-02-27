from __future__ import annotations

import csv
import io
import json
import re
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import RawFinancial
from api.schemas import RawFinancialRecord

_VALID_CATEGORIES = {
    "subscription_revenue",
    "churn_refund",
    "salary_expense",
    "software_expense",
    "marketing_expense",
    "cogs",
    "tax_payment",
}

_COL_ALIASES: dict[str, list[str]] = {
    "date": ["date", "transaction_date", "period", "week", "month"],
    "category": ["category", "type", "account", "label", "description"],
    "amount": ["amount", "value", "total", "sum", "revenue", "expense"],
    "customer_id": ["customer_id", "customer", "client_id", "client", "account_id"],
}


def _find_col(headers: list[str], field: str) -> str | None:
    """Return the first header that matches any alias for field."""
    for alias in _COL_ALIASES[field]:
        if alias in headers:
            return alias
    return None


def _parse_amount(raw: str | None) -> Decimal | None:
    if not raw:
        return None
    cleaned = raw.replace(",", "").replace("$", "").replace(" ", "").strip()
    # Strip trailing text like "(USD)" or parentheses
    cleaned = re.sub(r"\([^)]*\)", "", cleaned).strip()
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            from datetime import datetime
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


class IngestionAgent:
    """Parses CSV/PDF financial files, validates with Pydantic, and persists to DB.

    The LLM self-correction loop is triggered only when >10% of rows fail Pydantic
    validation — in practice this handles dirty exports from accounting tools.
    """

    async def ingest(
        self,
        *,
        filename: str,
        file_bytes: bytes,
        run_id: uuid.UUID,
        corrected_rows: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        if corrected_rows is not None:
            raw_rows = corrected_rows
        else:
            raw_rows = self._parse_file(filename, file_bytes, run_id)

        validated_rows: list[RawFinancialRecord] = []
        validation_errors: list[str] = []

        for row in raw_rows:
            try:
                # Coerce types before Pydantic to get cleaner error messages
                coerced = self._coerce_row(row, run_id)
                record = RawFinancialRecord(**coerced)
                validated_rows.append(record)
            except (ValidationError, Exception) as e:
                validation_errors.append(f"Row {row}: {e}")

        total = len(raw_rows)
        valid = len(validated_rows)
        needs_correction = bool(validation_errors) and valid < total * 0.9

        return {
            "raw_rows": raw_rows,
            "validated_rows": validated_rows,
            "validation_errors": validation_errors,
            "needs_correction": needs_correction,
            "ingestion_metadata": {
                "filename": filename,
                "total_rows": total,
                "valid_rows": valid,
                "error_count": len(validation_errors),
            },
        }

    def _coerce_row(self, row: dict[str, Any], run_id: uuid.UUID) -> dict[str, Any]:
        raw_date = row.get("date")
        raw_amount = row.get("amount")
        raw_cat = row.get("category", "")
        raw_cid = row.get("customer_id") or None
        raw_src = row.get("source_file") or None

        parsed_date = raw_date if isinstance(raw_date, date) else _parse_date(str(raw_date) if raw_date else None)
        parsed_amount = raw_amount if isinstance(raw_amount, Decimal) else _parse_amount(str(raw_amount) if raw_amount is not None else None)

        return {
            "date": parsed_date,
            "category": str(raw_cat).strip() if raw_cat else "",
            "amount": parsed_amount,
            "customer_id": str(raw_cid).strip() if raw_cid else None,
            "source_file": str(raw_src)[:255] if raw_src else None,
            "run_id": run_id,
        }

    def _parse_file(self, filename: str, file_bytes: bytes, run_id: uuid.UUID) -> list[dict[str, Any]]:
        if filename.lower().endswith(".pdf"):
            return self._parse_pdf(file_bytes)
        return self._parse_csv(file_bytes, filename)

    def _parse_csv(self, file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
        for encoding in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = file_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            text = file_bytes.decode("latin-1", errors="replace")

        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            return []

        headers = [h.strip().lower() for h in reader.fieldnames]

        date_col = _find_col(headers, "date")
        cat_col = _find_col(headers, "category")
        amount_col = _find_col(headers, "amount")
        cid_col = _find_col(headers, "customer_id")

        rows: list[dict[str, Any]] = []
        for raw_row in reader:
            normalized = {k.strip().lower(): v for k, v in raw_row.items() if k}
            rows.append({
                "date": normalized.get(date_col) if date_col else None,
                "category": normalized.get(cat_col) if cat_col else None,
                "amount": normalized.get(amount_col) if amount_col else None,
                "customer_id": normalized.get(cid_col) if cid_col else None,
                "source_file": filename,
            })
        return rows

    def _parse_pdf(self, file_bytes: bytes) -> list[dict[str, Any]]:
        try:
            import pdfplumber

            rows: list[dict[str, Any]] = []
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    for table in (page.extract_tables() or []):
                        if not table or len(table) < 2:
                            continue
                        raw_headers = [str(h).strip().lower() if h else "" for h in table[0]]
                        date_col = _find_col(raw_headers, "date")
                        cat_col = _find_col(raw_headers, "category")
                        amount_col = _find_col(raw_headers, "amount")
                        cid_col = _find_col(raw_headers, "customer_id")

                        for data_row in table[1:]:
                            row_dict = dict(zip(raw_headers, data_row))
                            rows.append({
                                "date": row_dict.get(date_col) if date_col else None,
                                "category": row_dict.get(cat_col) if cat_col else None,
                                "amount": row_dict.get(amount_col) if amount_col else None,
                                "customer_id": row_dict.get(cid_col) if cid_col else None,
                                "source_file": "pdf_upload",
                            })
            return rows
        except Exception:
            return []

    async def correct_rows_with_llm(
        self,
        bad_rows: list[dict[str, Any]],
        validation_errors: list[str],
    ) -> list[dict[str, Any]]:
        """Ask Claude Haiku to reformat malformed rows and return corrected dicts."""
        from agents.insight_writer import GPT_MINI_MODEL, litellm_completion_with_retry

        system_prompt = (
            "You are a financial data normalizer. Fix the provided rows so they conform to the schema. "
            "Return ONLY a valid JSON array — no commentary, no markdown fences."
        )
        user_prompt = (
            f"Schema: {{ date: YYYY-MM-DD, category: one of {sorted(_VALID_CATEGORIES)}, "
            f"amount: decimal number (positive), customer_id: string or null }}\n\n"
            f"Validation errors (first 10):\n{chr(10).join(validation_errors[:10])}\n\n"
            f"Rows to fix (first 20):\n{json.dumps(bad_rows[:20], default=str)}\n\n"
            "Return corrected JSON array."
        )

        try:
            raw = await litellm_completion_with_retry(
                model=GPT_MINI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=2000,
            )
            match = re.search(r"\[.*\]", raw, flags=re.S)
            if match:
                corrected = json.loads(match.group(0))
                if isinstance(corrected, list):
                    return corrected
        except Exception:
            pass

        return bad_rows  # Fall back to original rows if correction fails

    async def persist(self, session: AsyncSession, validated_rows: list) -> int:
        """Write validated RawFinancialRecord Pydantic models to the database."""
        if not validated_rows:
            return 0

        entities = []
        for record in validated_rows:
            if isinstance(record, RawFinancialRecord):
                entities.append(
                    RawFinancial(
                        run_id=record.run_id,
                        date=record.date,
                        category=record.category,
                        amount=record.amount,
                        source_file=record.source_file,
                        customer_id=record.customer_id,
                    )
                )
            elif isinstance(record, dict):
                entities.append(
                    RawFinancial(
                        run_id=record.get("run_id"),
                        date=record.get("date"),
                        category=record.get("category"),
                        amount=record.get("amount"),
                        source_file=record.get("source_file"),
                        customer_id=record.get("customer_id"),
                    )
                )

        session.add_all(entities)
        await session.commit()
        return len(entities)


__all__ = ["IngestionAgent"]
