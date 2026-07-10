"""
RBAC permission classes for the CRM API.

Three roles:
- Admin: Full access to everything.
- Manager: Full CRUD on CRM entities, view-only on settings.
- Sales Rep: Full CRUD on own records, read-only on others.
"""

from rest_framework.permissions import BasePermission

from apps.common.enums import UserRole


class IsAdmin(BasePermission):
    """Only allow admin users."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (request.user.role == UserRole.ADMIN or request.user.is_superuser)


class IsManager(BasePermission):
    """Allow admin or manager users."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.role in (UserRole.ADMIN, UserRole.MANAGER) or request.user.is_superuser
        )


class IsOwnerOrReadOnly(BasePermission):
    """
    Sales reps can only edit records they own.
    Admins and managers have full access.
    Read access is granted to all authenticated users.
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser or request.user.role in (UserRole.ADMIN, UserRole.MANAGER):
            return True

        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True

        # Sales reps can only modify their own records
        owner = getattr(obj, "owner", None)
        created_by = getattr(obj, "created_by", None)
        return owner == request.user or created_by == request.user


class IsSalesTeam(BasePermission):
    """Allow any authenticated user with a valid role."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.role in (UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP) or request.user.is_superuser
        )


class CanManageTeam(BasePermission):
    """Only admin can manage team members."""

    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return request.user.is_authenticated and (
                request.user.role in (UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP) or request.user.is_superuser
            )
        return request.user.is_authenticated and (request.user.role == UserRole.ADMIN or request.user.is_superuser)
