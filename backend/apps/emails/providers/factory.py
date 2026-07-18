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
        else:
            raise NotImplementedError(
                f"Provider '{provider_type}' is not supported yet."
            )
