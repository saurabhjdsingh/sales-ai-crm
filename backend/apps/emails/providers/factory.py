from apps.emails.providers.base import BaseEmailProvider


class ProviderFactory:
    """
    Factory to retrieve email integration providers.
    Supports dynamic scaling for future providers (like Outlook or IMAP).
    """

    @staticmethod
    def get_provider(provider_type: str = "gmail") -> BaseEmailProvider:
        if provider_type == "gmail":
            from apps.emails.providers.gmail import GmailProvider
            return GmailProvider()
        elif provider_type == "smtp":
            from apps.emails.providers.smtp import SmtpProvider
            return SmtpProvider()
        else:
            raise NotImplementedError(
                f"Provider '{provider_type}' is not supported yet."
            )
