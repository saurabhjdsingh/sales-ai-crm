import logging
from typing import List, Dict, Any, Optional

from django.conf import settings
from apps.agent.browser.base import BaseBrowserProvider

logger = logging.getLogger(__name__)


class PlaywrightProvider(BaseBrowserProvider):
    """
    Playwright-backed browser automation implementation.
    Lazily imports playwright to avoid boot-time failures on systems without it installed.
    """

    def __init__(self, headless: Optional[bool] = None, user_data_dir: Optional[str] = None):
        try:
            from playwright.sync_api import sync_playwright
            self.sync_playwright = sync_playwright
        except ImportError:
            logger.error("Playwright package is not installed. Please install playwright to enable browser automation.")
            raise ImportError("Playwright is not installed. Run 'pip install playwright' and 'playwright install'.")

        self.headless = headless if headless is not None else getattr(settings, "AGENT_BROWSER_HEADLESS", True)
        self.user_data_dir = user_data_dir or getattr(settings, "AGENT_BROWSER_PROFILE_PATH", "")

        self._playwright_manager = None
        self._browser = None
        self._context = None
        self._page = None

        self._start_session()

    def _start_session(self):
        try:
            self._playwright_manager = self.sync_playwright().start()

            launch_args = {
                "headless": self.headless,
            }

            context_args = {
                "viewport": {"width": 1280, "height": 800},
                "locale": "en-US",
                "timezone_id": "Asia/Kolkata",
            }

            if self.user_data_dir:
                logger.info("Starting browser with persistent profile at %s", self.user_data_dir)
                persistent_args = {**launch_args, **context_args}
                self._context = self._playwright_manager.chromium.launch_persistent_context(
                    self.user_data_dir,
                    **persistent_args
                )
                self._page = self._context.pages[0] if self._context.pages else self._context.new_page()
            else:
                logger.info("Starting clean browser session")
                self._browser = self._playwright_manager.chromium.launch(**launch_args)
                self._context = self._browser.new_context(**context_args)
                self._page = self._context.new_page()

            # Hide webdriver flag and mimic real browser attributes
            self._page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

            # Set standard headers to avoid basic bot triggers
            self._page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            })
            self._page.set_default_timeout(30000)  # 30 seconds

        except Exception as e:
            logger.exception("Failed to start Playwright session")
            self.close()
            raise

    def inject_cookies(self, cookies: List[Dict[str, Any]]) -> None:
        """
        Inject session cookies into the browser context.
        """
        if not self._context:
            raise RuntimeError("Browser session is not active.")
        
        # Playwright cookies list needs name, value, domain, path, etc.
        formatted_cookies = []
        for cookie in cookies:
            formatted = {
                "name": cookie.get("name"),
                "value": cookie.get("value"),
                "domain": cookie.get("domain", ".linkedin.com"),
                "path": cookie.get("path", "/"),
            }
            if "expires" in cookie:
                formatted["expires"] = cookie["expires"]
            if "httpOnly" in cookie:
                formatted["httpOnly"] = cookie["httpOnly"]
            if "secure" in cookie:
                formatted["secure"] = cookie["secure"]
            if "sameSite" in cookie:
                formatted["sameSite"] = cookie["sameSite"]
            formatted_cookies.append(formatted)

        self._context.add_cookies(formatted_cookies)
        logger.debug("Successfully injected %d cookies into context", len(formatted_cookies))

    def navigate(self, url: str) -> None:
        if not self._page:
            raise RuntimeError("Browser page is not active.")
        logger.info("Navigating browser to %s", url)
        self._page.goto(url, wait_until="domcontentloaded")

    def get_page_content(self) -> str:
        if not self._page:
            raise RuntimeError("Browser page is not active.")
        return self._page.content()

    def get_text_content(self) -> str:
        """Returns visible clean text of the page."""
        if not self._page:
            raise RuntimeError("Browser page is not active.")
        return self._page.evaluate("document.body.innerText")

    def click(self, selector: str) -> None:
        if not self._page:
            raise RuntimeError("Browser page is not active.")
        self._page.click(selector)

    def type_text(self, selector: str, text: str) -> None:
        if not self._page:
            raise RuntimeError("Browser page is not active.")
        self._page.fill(selector, text)

    def screenshot(self) -> bytes:
        if not self._page:
            raise RuntimeError("Browser page is not active.")
        return self._page.screenshot()

    def close(self) -> None:
        logger.info("Closing Playwright browser session")
        try:
            if self._browser:
                self._browser.close()
            if self._context and not self.user_data_dir:
                self._context.close()
            if self._playwright_manager:
                self._playwright_manager.stop()
        except Exception:
            logger.exception("Error closing browser session")
        finally:
            self._browser = None
            self._context = None
            self._page = None
            self._playwright_manager = None
