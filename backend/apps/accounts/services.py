"""
Account services for user management.
"""

import logging

from django.contrib.auth import get_user_model

from apps.common.exceptions import EntityNotFoundException

User = get_user_model()

logger = logging.getLogger(__name__)


class AccountService:
    """Service layer for user-related operations."""

    @staticmethod
    def get_user_by_id(user_id):
        """Retrieve a user by ID."""
        try:
            return User.objects.get(id=user_id, is_active=True)
        except User.DoesNotExist:
            raise EntityNotFoundException(f"User with id {user_id} not found.")

    @staticmethod
    def get_active_users():
        """Retrieve all active users."""
        return User.objects.filter(is_active=True)

    @staticmethod
    def get_users_by_role(role):
        """Retrieve all active users with a specific role."""
        return User.objects.filter(is_active=True, role=role)

    @staticmethod
    def deactivate_user(user_id, performed_by):
        """Deactivate a user account."""
        user = AccountService.get_user_by_id(user_id)
        if user.id == performed_by.id:
            from apps.common.exceptions import ServiceException

            raise ServiceException("You cannot deactivate your own account.")
        user.is_active = False
        user.save(update_fields=["is_active"])
        logger.info("User %s deactivated by %s", user.email, performed_by.email)
        return user
