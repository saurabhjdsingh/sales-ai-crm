def calculate_cost(model_name: str, input_tokens: int, output_tokens: int) -> float:
    """
    Calculate API cost in USD.

    Pricing is per 1,000,000 tokens.
    """

    model = model_name.lower()

    # Default (GPT-4o)
    input_rate = 2.50
    output_rate = 10.00

    # -----------------------------
    # Anthropic
    # -----------------------------

    # Claude Opus 4.7 / 4.6
    if (
        "claude-opus-4.7" in model
        or "claude-opus-4.6" in model
        or "claude-4.7" in model
        or "claude-4.6" in model
        or "claude-opus" in model
    ):
        input_rate = 5.00
        output_rate = 25.00

    # Claude Sonnet 4.6 / 4.5
    elif (
        "claude-sonnet-4.6" in model
        or "claude-sonnet-4.5" in model
        or "claude-3.5-sonnet" in model
        or "claude-sonnet" in model
    ):
        input_rate = 3.00
        output_rate = 15.00

    # Claude Haiku
    elif (
        "claude-haiku" in model
        or "claude-3-haiku" in model
        or "haiku" in model
    ):
        input_rate = 1.00
        output_rate = 5.00

    # -----------------------------
    # OpenAI GPT-5 Family
    # -----------------------------

    elif "gpt-5-mini" in model:
        input_rate = 0.25
        output_rate = 2.00

    elif "gpt-5-nano" in model:
        input_rate = 0.05
        output_rate = 0.40

    elif "gpt-5" in model:
        input_rate = 1.25
        output_rate = 10.00

    # -----------------------------
    # GPT-4o Family
    # -----------------------------

    elif "gpt-4o-mini" in model:
        input_rate = 0.15
        output_rate = 0.60

    elif "gpt-4o" in model:
        input_rate = 2.50
        output_rate = 10.00

    # -----------------------------
    # GPT-4
    # -----------------------------

    elif "gpt-4" in model:
        input_rate = 30.00
        output_rate = 60.00

    # -----------------------------
    # GPT-3.5
    # -----------------------------

    elif "gpt-3.5" in model:
        input_rate = 0.50
        output_rate = 1.50

    total_cost = (
        input_tokens * input_rate +
        output_tokens * output_rate
    ) / 1_000_000

    return round(total_cost, 6)