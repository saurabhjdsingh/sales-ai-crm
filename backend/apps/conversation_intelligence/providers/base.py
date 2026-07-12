from abc import ABC, abstractmethod


class BaseSpeechProvider(ABC):
    @abstractmethod
    def transcribe(self, audio_file_bytes: bytes, language: str = "en") -> str:
        """
        Transcribe raw audio file bytes and return the recognized text string.
        """
        pass
