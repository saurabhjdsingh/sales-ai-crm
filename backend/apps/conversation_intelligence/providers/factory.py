from django.conf import settings
from .whisper_docker import WhisperDockerProvider
from .base import BaseSpeechProvider


def get_speech_provider() -> BaseSpeechProvider:
    """
    Factory function resolving configured Speech transcription provider.
    Currently defaults to local Docker-based Whisper container.
    """
    provider_type = getattr(settings, "CONVERSATION_INTELLIGENCE_SPEECH_PROVIDER", "whisper_docker")
    
    if provider_type == "whisper_docker":
        return WhisperDockerProvider()
        
    raise ValueError(f"Unknown speech provider configuration: {provider_type}")
