"""
Middleware for the CRM.
"""

import threading

_thread_local = threading.local()


def get_current_user():
    """Get the current user from thread-local storage."""
    return getattr(_thread_local, "user", None)


class AuditMiddleware:
    """
    Middleware that stores the current authenticated user in thread-local storage.
    This allows models and services to access the current user without
    passing it through every function call.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_local.user = request.user if request.user.is_authenticated else None
        response = self.get_response(request)
        _thread_local.user = None
        return response
