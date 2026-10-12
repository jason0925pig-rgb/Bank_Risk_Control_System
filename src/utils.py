"""
utils.py — Environment & LLM client setup (live mode).

Live mode calls LLMs through OpenRouter with every request traced by
Langfuse — the same observability stack used in the original Reply AI
Agent Challenge build this project grew out of.
"""
from __future__ import annotations

import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # pragma: no cover
    pass


def live_env_ready() -> bool:
    required = ["OPENROUTER_API_KEY", "OPENROUTER_BASE_URL"]
    return all(os.environ.get(k) for k in required)


def get_client():
    """Return a Langfuse-wrapped OpenAI-compatible client aimed at OpenRouter.

    Requires OPENROUTER_API_KEY / OPENROUTER_BASE_URL (see .env.example).
    Langfuse keys are optional; without them calls run untracked.
    """
    if not live_env_ready():
        raise SystemExit(
            "Live mode needs OPENROUTER_API_KEY and OPENROUTER_BASE_URL. "
            "Copy .env.example to .env and fill them in, or drop --live to use "
            "the deterministic engine."
        )
    secret = os.environ.get("LANGFUSE_SECRET_KEY")
    public = os.environ.get("LANGFUSE_PUBLIC_KEY")
    host = os.environ.get("LANGFUSE_HOST")
    if secret and public and host:
        from langfuse import Langfuse
        from langfuse.openai import OpenAI as LangfuseOpenAI
        Langfuse(secret_key=secret, public_key=public, host=host)
        return LangfuseOpenAI(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url=os.environ["OPENROUTER_BASE_URL"],
        )
    from openai import OpenAI
    return OpenAI(
        api_key=os.environ["OPENROUTER_API_KEY"],
        base_url=os.environ["OPENROUTER_BASE_URL"],
    )


def get_model(tier: str) -> str:
    """Model per agent tier: TRIAGE_MODEL / ANALYSIS_MODEL / JUDGE_MODEL."""
    key = f"{tier.upper()}_MODEL"
    return os.environ.get(key, "google/gemini-2.0-flash-lite-001")
