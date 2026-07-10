from abc import ABC, abstractmethod
from typing import Any, List, Optional


class BaseBrowserProvider(ABC):
    """
    Abstract interface for browser automation.
    Isolates core scraper services from underlying technology (Playwright, Selenium, etc.).
    """

    @abstractmethod
    def navigate(self, url: str) -> None:
        """Navigate the browser to a specific URL."""
        pass

    @abstractmethod
    def get_page_content(self) -> str:
        """Return the visible HTML/text content of the active page."""
        pass

    @abstractmethod
    def click(self, selector: str) -> None:
        """Click an element matching the CSS selector."""
        pass

    @abstractmethod
    def type_text(self, selector: str, text: str) -> None:
        """Type text into an element matching the CSS selector."""
        pass

    @abstractmethod
    def screenshot(self) -> bytes:
        """Capture a screenshot of the current page and return raw bytes."""
        pass

    @abstractmethod
    def close(self) -> None:
        """Close the browser instance and clean up resources."""
        pass
