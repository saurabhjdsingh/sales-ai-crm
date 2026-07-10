"""
ASGI config for Radar 36 Sales CRM.
Future-ready for WebSocket support.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

application = get_asgi_application()
