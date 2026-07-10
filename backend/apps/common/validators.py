"""
Shared validators for the CRM API.
"""

from django.core.validators import MaxValueValidator, MinValueValidator, URLValidator


def validate_icp_score(value):
    """Validate ICP score is between 0 and 100."""
    MinValueValidator(0)(value)
    MaxValueValidator(100)(value)


def validate_probability(value):
    """Validate deal probability is between 0 and 100."""
    MinValueValidator(0)(value)
    MaxValueValidator(100)(value)


def validate_url(value):
    """Validate a URL field."""
    if value:
        URLValidator()(value)
