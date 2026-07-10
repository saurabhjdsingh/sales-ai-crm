"""
Serializers for authentication and user management.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom JWT serializer that includes user data in the token response.
    The frontend receives user info immediately on login without a second request.
    """

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class UserSerializer(serializers.ModelSerializer):
    """Read serializer for user data."""

    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "phone",
            "avatar_url",
            "timezone",
            "job_title",
            "is_active",
            "is_superuser",
            "date_joined",
            "last_login",
        ]
        read_only_fields = ["id", "date_joined", "last_login"]

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users (admin only)."""

    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "email",
            "username",
            "first_name",
            "last_name",
            "role",
            "phone",
            "timezone",
            "job_title",
            "password",
            "password_confirm",
        ]

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating user profile."""

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "phone",
            "avatar_url",
            "timezone",
            "job_title",
        ]


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for changing password."""

    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(required=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


class UserListSerializer(serializers.ModelSerializer):
    """Serializer for team lists and administration."""

    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "status",
            "is_active",
            "job_title",
            "avatar_url",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()


class TeamMemberUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating team members by admins."""

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "email",
            "role",
            "job_title",
        ]

    def validate_email(self, value):
        user = self.instance
        if User.objects.exclude(pk=user.pk).filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def update(self, instance, validated_data):
        email = validated_data.get("email")
        if email:
            validated_data["username"] = email
        return super().update(instance, validated_data)


class OrganizationBrandingSerializer(serializers.Serializer):
    organization_name = serializers.CharField()
    logo_url = serializers.URLField(allow_null=True)
    has_logo = serializers.BooleanField()
    smtp_host = serializers.CharField(allow_blank=True, required=False)
    smtp_port = serializers.IntegerField(required=False)
    smtp_username = serializers.CharField(allow_blank=True, required=False)
    smtp_use_tls = serializers.BooleanField(required=False)
    smtp_use_ssl = serializers.BooleanField(required=False)
    smtp_from_email = serializers.CharField(allow_blank=True, required=False)
    smtp_has_password = serializers.BooleanField(required=False)


class OrganizationBrandingUpdateSerializer(serializers.Serializer):
    organization_name = serializers.CharField(max_length=100, required=False)
    logo = serializers.ImageField(required=False, allow_null=True)
    remove_logo = serializers.BooleanField(required=False, default=False)
    smtp_host = serializers.CharField(max_length=255, required=False, allow_blank=True)
    smtp_port = serializers.IntegerField(required=False)
    smtp_username = serializers.CharField(max_length=255, required=False, allow_blank=True)
    smtp_password = serializers.CharField(max_length=255, required=False, allow_blank=True)
    smtp_use_tls = serializers.BooleanField(required=False)
    smtp_use_ssl = serializers.BooleanField(required=False)
    smtp_from_email = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_organization_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Organization name cannot be empty.")
        return value

