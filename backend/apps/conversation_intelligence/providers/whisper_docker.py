import io
import logging
from django.conf import settings
from openai import OpenAI
from .base import BaseSpeechProvider

logger = logging.getLogger(__name__)


class WhisperDockerProvider(BaseSpeechProvider):
    def __init__(self, base_url: str = None):
        # Default to container service 'local-whisper' within compose network,
        # fallback to localhost if running outside container context
        self.base_url = base_url or getattr(settings, "WHISPER_URL", "http://local-whisper:8000/v1")

    def transcribe(self, audio_file_bytes: bytes, language: str = "en") -> str:
        # Check fallback url dynamically if needed
        import urllib.request
        resolved_url = self.base_url
        
        # If running locally on host machine, check if localhost ports are open
        if "local-whisper" in self.base_url:
            try:
                urllib.request.urlopen(self.base_url, timeout=0.5)
            except Exception:
                try:
                    # check localhost on 9000
                    alt_url = "http://localhost:9000/v1"
                    urllib.request.urlopen(alt_url, timeout=0.5)
                    resolved_url = alt_url
                except Exception:
                    pass

        client = OpenAI(base_url=resolved_url, api_key="local-dummy-key")
        audio_file = io.BytesIO(audio_file_bytes)
        audio_file.name = "audio.webm"  # default webm container from MediaRecorder

        try:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=language
            )
            return response.text
        except Exception as e:
            logger.error("Failed transcription call to Whisper Docker endpoint %s: %s", resolved_url, str(e))
            raise e
