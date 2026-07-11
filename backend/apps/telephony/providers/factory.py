from apps.telephony.models import TelephonyProvider
from apps.telephony.providers.base import BaseTelephonyProvider
from apps.telephony.providers.twilio import TwilioProvider


def get_provider_for_user(user, provider_type: str = "twilio") -> BaseTelephonyProvider:
    """
    Fetch active TelephonyProvider for user and load it with decrypted credentials.
    """
    try:
        provider = TelephonyProvider.objects.get(
            user=user,
            provider_type=provider_type,
            is_deleted=False
        )
    except TelephonyProvider.DoesNotExist:
        raise ValueError(f"No active {provider_type} config found for {user.email}")

    # Build config using decrypted properties
    config = {
        "account_sid": provider.account_sid,
        "api_key": provider.api_key,
        "api_secret": provider.api_secret,
        "application_sid": provider.application_sid,
        "phone_number": provider.phone_number,
        "transcription_provider": provider.transcription_provider,
        "transcription_key": provider.transcription_key,
        "provider_id": str(provider.id)
    }

    if provider_type == "twilio":
        return TwilioProvider(config)

    raise ValueError(f"Unsupported provider: {provider_type}")
