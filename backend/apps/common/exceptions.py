"""
Custom exception handler for the CRM API.
Provides consistent error response format across all endpoints.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Custom exception handler that normalizes all error responses to:
    {
        "error": {
            "code": "error_code",
            "message": "Human readable message",
            "details": { ... }  // optional
        }
    }
    """
    # Convert Django ValidationError to DRF ValidationError
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(detail=exc.message_dict if hasattr(exc, "message_dict") else exc.messages)

    response = exception_handler(exc, context)

    if response is None:
        logger.exception("Unhandled exception", exc_info=exc)
        return Response(
            {
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred. Please try again.",
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    error_code = _get_error_code(exc, response)
    error_message = _get_error_message(exc, response)
    error_details = _get_error_details(exc, response)

    response.data = {
        "error": {
            "code": error_code,
            "message": error_message,
            **({"details": error_details} if error_details else {}),
        }
    }

    return response


def _get_error_code(exc, response):
    """Extract a machine-readable error code."""
    if isinstance(exc, ValidationError):
        return "validation_error"
    if isinstance(exc, Http404):
        return "not_found"
    if hasattr(exc, "default_code"):
        return exc.default_code
    return f"error_{response.status_code}"


def _get_error_message(exc, response):
    """Extract a human-readable error message."""
    if isinstance(exc, ValidationError):
        return "Validation failed. Check the details for more information."
    if isinstance(exc, Http404):
        return "The requested resource was not found."
    if hasattr(exc, "detail"):
        detail = exc.detail
        if isinstance(detail, str):
            return detail
        if isinstance(detail, list) and detail:
            return str(detail[0])
    return "An error occurred."


def _get_error_details(exc, response):
    """Extract structured error details for validation errors."""
    if isinstance(exc, ValidationError):
        return exc.detail
    return None


class ServiceException(APIException):
    """
    Base exception for service-layer errors.
    Use this in services to raise errors that map cleanly to HTTP responses.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "A service error occurred."
    default_code = "service_error"


class EntityNotFoundException(APIException):
    """Raised when an entity is not found in the database."""

    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "The requested entity was not found."
    default_code = "not_found"


class DuplicateEntityException(APIException):
    """Raised when attempting to create a duplicate entity."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "An entity with the same identifier already exists."
    default_code = "duplicate_entity"


class AIServiceException(APIException):
    """Raised when an AI provider call fails."""

    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "The AI service is temporarily unavailable."
    default_code = "ai_service_error"
