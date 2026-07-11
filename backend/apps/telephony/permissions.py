from rest_framework.permissions import BasePermission
from apps.common.enums import UserRole


class IsTelephonyOwner(BasePermission):
    """
    Ensures that sales reps can only view and manage their own telephony provider
    settings and call records. Admins retain full visibility.
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser or request.user.role == UserRole.ADMIN:
            return True
        return obj.user == request.user
