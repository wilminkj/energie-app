"""Configuratie voor de ETL pipeline.

Leest Supabase credentials uit environment variables.
Gebruik een .env bestand of exporteer de variabelen handmatig.
"""

import os
import logging
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SupabaseConfig:
    """Supabase verbindingsconfiguratie."""

    url: str
    key: str

    def validate(self) -> None:
        """Controleer of de vereiste waarden aanwezig zijn."""
        if not self.url:
            raise ValueError("SUPABASE_URL is niet ingesteld")
        if not self.key:
            raise ValueError("SUPABASE_KEY is niet ingesteld")


def get_supabase_config() -> SupabaseConfig:
    """Haal Supabase configuratie op uit environment variables."""
    config = SupabaseConfig(
        url=os.environ.get("SUPABASE_URL", ""),
        key=os.environ.get("SUPABASE_KEY", ""),
    )
    config.validate()
    return config
