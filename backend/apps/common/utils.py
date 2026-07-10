"""
Shared utility functions for the CRM.
"""

import csv
import io
import logging
from typing import Any

logger = logging.getLogger(__name__)


def parse_csv_content(file_content: bytes, encoding: str = "utf-8") -> list[dict[str, Any]]:
    """
    Parse CSV file content into a list of dictionaries.
    Each dict represents one row with column headers as keys.
    """
    text = file_content.decode(encoding)
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        cleaned = {k.strip(): v.strip() if v else "" for k, v in row.items() if k}
        rows.append(cleaned)
    return rows


def truncate_text(text: str, max_length: int = 200) -> str:
    """Truncate text to max_length, adding ellipsis if truncated."""
    if not text or len(text) <= max_length:
        return text or ""
    return text[:max_length].rsplit(" ", 1)[0] + "..."


def build_full_name(first_name: str, last_name: str) -> str:
    """Build a full name from first and last name."""
    parts = [p for p in (first_name, last_name) if p]
    return " ".join(parts)
