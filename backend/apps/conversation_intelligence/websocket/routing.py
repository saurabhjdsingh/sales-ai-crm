from django.urls import path
from .consumers import ConversationStreamConsumer

websocket_urlpatterns = [
    path("ws/conversation/stream/<uuid:conversation_id>/<str:speaker>/", ConversationStreamConsumer.as_asgi()),
]
