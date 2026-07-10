import json
import logging
import time
from typing import Any, Dict, List, Optional

from django.conf import settings
from apps.agent.browser.playwright_provider import PlaywrightProvider
from apps.agent.models import UserLinkedInConfig
from apps.common.encryption import decrypt_api_key

logger = logging.getLogger(__name__)


class LinkedInBrowserProvider:
    """
    LinkedIn-specific browser automation interface.
    Handles login state, navigation, profile extraction, message drafting, and sending.
    """

    def __init__(self, user: Any = None):
        self.user = user
        self.browser: Optional[PlaywrightProvider] = None

    def _init_browser(self):
        """Lazy initialization of the browser with cookie injection."""
        if self.browser is not None:
            return

        cookies = self._get_linkedin_cookies()
        
        # Start Playwright
        self.browser = PlaywrightProvider()

        if cookies:
            try:
                self.browser.inject_cookies(cookies)
                # Navigate to home feed first to establish session cookies/CSRF/local storage
                logger.info("Pre-navigating to LinkedIn Home to establish session context")
                self.browser.navigate("https://www.linkedin.com/")
                time.sleep(3)
            except Exception as e:
                logger.warning("Failed to inject cookies or establish session: %s", str(e))

    def _get_linkedin_cookies(self) -> List[Dict[str, Any]]:
        """Retrieve and decrypt LinkedIn session cookies from DB or env."""
        # 1. Try user-level DB configuration
        if self.user:
            try:
                config = UserLinkedInConfig.objects.filter(user=self.user, is_active=True).first()
                if config and config.cookies_json_encrypted:
                    decrypted = decrypt_api_key(config.cookies_json_encrypted)
                    return json.loads(decrypted)
            except Exception as e:
                logger.warning("Failed to retrieve or decrypt LinkedIn config for user %s: %s", self.user, str(e))

        # 2. Fallback to system-level environment variable
        env_cookies = getattr(settings, "LINKEDIN_COOKIES", None) or getattr(settings, "AGENT_LINKEDIN_COOKIES", None)
        if env_cookies:
            try:
                # If encrypted
                try:
                    decrypted = decrypt_api_key(env_cookies)
                    return json.loads(decrypted)
                except Exception:
                    # Try parsing as raw JSON if not encrypted
                    return json.loads(env_cookies)
            except Exception as e:
                logger.warning("Failed to parse system-level LINKEDIN_COOKIES: %s", str(e))

        return []

    def close(self):
        if self.browser:
            self.browser.close()
            self.browser = None

    def get_profile_details(self, profile_url: str) -> Dict[str, Any]:
        """Navigate to a profile and extract visible details."""
        self._init_browser()
        try:
            self.browser.navigate(profile_url)
            # Wait for content to load
            time.sleep(3)  # Standard safety delay for dynamic page load

            page = self.browser._page
            
            # Extract name
            name = ""
            name_selectors = ["h1.text-heading-xlarge", "h1.v-align-middle", ".pv-top-card-layout__title"]
            for sel in name_selectors:
                try:
                    el = page.query_selector(sel)
                    if el:
                        name = el.inner_text().strip()
                        break
                except Exception:
                    pass

            # Extract headline
            headline = ""
            headline_selectors = [".text-body-medium.break-words", ".pv-text-details__left-panel div.text-body-medium", ".pv-top-card-layout__headline"]
            for sel in headline_selectors:
                try:
                    el = page.query_selector(sel)
                    if el:
                        headline = el.inner_text().strip()
                        break
                except Exception:
                    pass

            # Extract connection degree
            connection_status = "Not Connected"
            try:
                # 1. Try standard CSS selectors for connection badge
                badge_selectors = [
                    "span.dist-value", 
                    "span.degree-badge", 
                    ".pv-member-badge__degree", 
                    "span.pv-member-badge__degree", 
                    ".dist-value",
                    "span.distance-badge"
                ]
                for sel in badge_selectors:
                    el = page.query_selector(sel)
                    if el:
                        deg = el.inner_text().strip()
                        if "1st" in deg:
                            connection_status = "1st Degree"
                            break
                        elif "2nd" in deg:
                            connection_status = "2nd Degree"
                            break
                        elif "3rd" in deg:
                            connection_status = "3rd Degree"
                            break
                
                # 2. Fallback: Search top card text for connection degree indicators
                if connection_status == "Not Connected":
                    top_card = page.query_selector(".pv-top-card-layout") or page.query_selector("main")
                    if top_card:
                        card_text = top_card.inner_text()
                        # Clean up lines and search for standalone degree indicators
                        lines = [line.strip().lower() for line in card_text.split("\n") if line.strip()]
                        for line in lines:
                            if "1st" == line or "1st degree" in line or "1st degree connection" in line or "· 1st" in line:
                                connection_status = "1st Degree"
                                break
                            elif "2nd" == line or "2nd degree" in line or "2nd degree connection" in line or "· 2nd" in line:
                                connection_status = "2nd Degree"
                                break
                            elif "3rd" == line or "3rd degree" in line or "3rd degree connection" in line or "· 3rd" in line:
                                connection_status = "3rd Degree"
                                break
            except Exception as e:
                logger.warning("Error resolving connection degree: %s", str(e))

            # Extract summary/About
            about = ""
            try:
                about_el = page.query_selector("#about ~ div .display-flex span")
                if about_el:
                    about = about_el.inner_text().strip()
            except Exception:
                pass

            # Extract experience titles
            experiences = []
            try:
                exp_list = page.query_selector_all(".pvs-list__paged-list-item")
                for item in exp_list[:5]:
                    text = item.inner_text().strip()
                    if text:
                        # Clean up formatting
                        lines = [line.strip() for line in text.split("\n") if line.strip()]
                        experiences.append(" | ".join(lines[:3]))
            except Exception:
                pass

            return {
                "url": profile_url,
                "name": name,
                "headline": headline,
                "connection_status": connection_status,
                "about": about,
                "recent_experiences": experiences,
            }

        except Exception as e:
            logger.exception("Error extracting LinkedIn profile details")
            return {"url": profile_url, "error": str(e)}

    def check_connection_status(self, profile_url: str) -> str:
        """Determines connection degree: 1st, 2nd, 3rd, pending, etc."""
        details = self.get_profile_details(profile_url)
        return details.get("connection_status", "Unknown")

    def send_connection_request(self, profile_url: str, message: Optional[str] = None) -> bool:
        """
        Executes a connection request.
        Clicks connect, adds a note if provided, and clicks send.
        """
        self._init_browser()
        try:
            self.browser.navigate(profile_url)
            time.sleep(3)
            page = self.browser._page

            # Try to find Connect button
            connect_btn = None
            # Look for button containing Connect text
            buttons = page.query_selector_all("button")
            for btn in buttons:
                text = btn.inner_text().strip().lower()
                if "connect" in text and "pending" not in text:
                    connect_btn = btn
                    break

            # If not directly visible, click "More" dropdown
            if not connect_btn:
                more_btn = None
                for btn in buttons:
                    text = btn.inner_text().strip().lower()
                    if "more" in text or "actions" in text:
                        more_btn = btn
                        break
                
                if more_btn:
                    more_btn.click()
                    time.sleep(1)
                    # Look for Connect in dropdown items
                    dropdown_items = page.query_selector_all(".artdeco-dropdown__item")
                    for item in dropdown_items:
                        text = item.inner_text().strip().lower()
                        if "connect" in text:
                            connect_btn = item
                            break

            if not connect_btn:
                logger.warning("Connect button not found on profile %s", profile_url)
                return False

            connect_btn.click()
            time.sleep(2)

            # Check if modal opened
            if message:
                add_note_btn = page.query_selector("button[aria-label='Add a note']")
                if add_note_btn:
                    add_note_btn.click()
                    time.sleep(1)
                
                # Enter message
                textarea = page.query_selector("textarea#custom-message")
                if not textarea:
                    textarea = page.query_selector("textarea[name='message']")
                
                if textarea:
                    textarea.fill(message)
                    time.sleep(1)

            # Click send
            send_btn = page.query_selector("button[aria-label='Send now']")
            if not send_btn:
                send_btn = page.query_selector("button[aria-label='Send']")
            
            if not send_btn:
                # Find any send/connect confirmation button
                send_buttons = page.query_selector_all("button")
                for btn in send_buttons:
                    text = btn.inner_text().strip().lower()
                    if "send" in text or "submit" in text:
                        send_btn = btn
                        break

            if send_btn:
                send_btn.click()
                time.sleep(2)
                logger.info("Successfully sent LinkedIn connection request to %s", profile_url)
                return True
            else:
                logger.warning("Could not find Send button in Connect modal")
                return False

        except Exception as e:
            logger.exception("Failed to send LinkedIn connection request")
            return False

    def send_message(self, profile_url: str, message: str) -> bool:
        """
        Executes sending a direct message.
        Finds the message button, opens the chat thread, and sends the text.
        """
        self._init_browser()
        try:
            self.browser.navigate(profile_url)
            time.sleep(3)
            page = self.browser._page

            # Find Message button
            msg_btn = None
            buttons = page.query_selector_all("button")
            for btn in buttons:
                text = btn.inner_text().strip().lower()
                if text == "message":
                    msg_btn = btn
                    break

            if not msg_btn:
                # Check dropdown
                more_btn = None
                for btn in buttons:
                    text = btn.inner_text().strip().lower()
                    if "more" in text:
                        more_btn = btn
                        break
                if more_btn:
                    more_btn.click()
                    time.sleep(1)
                    dropdown_items = page.query_selector_all(".artdeco-dropdown__item")
                    for item in dropdown_items:
                        text = item.inner_text().strip().lower()
                        if text == "message":
                            msg_btn = item
                            break

            if not msg_btn:
                logger.warning("Direct message button not found on profile %s (might not be 1st degree)", profile_url)
                return False

            msg_btn.click()
            time.sleep(2)

            # Type message into active message box
            chat_input = page.query_selector(".msg-form__contenteditable")
            if not chat_input:
                chat_input = page.query_selector("div[role='textbox']")

            if chat_input:
                chat_input.fill(message)
                time.sleep(1)
                
                # Press Send
                send_btn = page.query_selector("button.msg-form__send-button")
                if not send_btn:
                    # Fallback to general send button in form
                    send_btn = page.query_selector("button[type='submit']")
                
                if send_btn:
                    send_btn.click()
                    time.sleep(2)
                    logger.info("Successfully sent direct message to %s", profile_url)
                    return True
            
            logger.warning("Could not locate message typing area or send button")
            return False

        except Exception as e:
            logger.exception("Failed to send LinkedIn message")
            return False

    def read_latest_conversation(self, profile_url: str) -> List[Dict[str, str]]:
        """Navigate to messaging page and extract messages in the current thread."""
        self._init_browser()
        try:
            self.browser.navigate(profile_url)
            time.sleep(3)
            page = self.browser._page

            # Open chat
            msg_btn = None
            buttons = page.query_selector_all("button")
            for btn in buttons:
                if btn.inner_text().strip().lower() == "message":
                    msg_btn = btn
                    break
            
            if not msg_btn:
                return []

            msg_btn.click()
            time.sleep(2)

            # Scrape active messages
            conversation_history = []
            message_bubbles = page.query_selector_all(".msg-s-event-listitem")
            for bubble in message_bubbles:
                try:
                    sender_el = bubble.query_selector(".msg-s-message-group__profile-link")
                    sender = sender_el.inner_text().strip() if sender_el else "Unknown"
                    
                    body_el = bubble.query_selector(".msg-s-event-listitem__body")
                    body = body_el.inner_text().strip() if body_el else ""
                    
                    if body:
                        conversation_history.append({
                            "sender": sender,
                            "text": body,
                        })
                except Exception:
                    pass

            return conversation_history

        except Exception as e:
            logger.exception("Failed to read latest LinkedIn conversation")
            return []
