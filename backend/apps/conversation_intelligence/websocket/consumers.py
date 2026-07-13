import json
import asyncio
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from apps.conversation_intelligence.models import (
    Conversation,
    ConversationSession,
    Transcript,
    TranscriptSegment
)
from apps.conversation_intelligence.providers.factory import get_speech_provider

logger = logging.getLogger(__name__)


class ConversationStreamConsumer(AsyncWebsocketConsumer):
    def _safe_cache_incr(self, key):
        from django.core.cache import cache
        try:
            if cache.get(key) is None:
                cache.set(key, 1, timeout=3600)
            else:
                cache.incr(key)
        except Exception:
            pass
    async def connect(self):
        self.conversation_id = str(self.scope['url_route']['kwargs']['conversation_id'])
        self.speaker = self.scope['url_route']['kwargs']['speaker']  # 'sales_rep' or 'customer'
        self.user = self.scope.get('user')
        self.group_name = f"conversation_{self.conversation_id}"

        # 1. Authenticate user
        if not self.user or self.user.is_anonymous:
            logger.warning("Rejecting anonymous WebSocket connection for conversation %s", self.conversation_id)
            await self.close(code=4001)  # Policy Violation / Unauthorized
            return

        # 2. Check database permission (org-boundary safety)
        has_access = await self.verify_conversation_access()
        if not has_access:
            logger.warning("User %s rejected access to conversation %s", self.user.email, self.conversation_id)
            await self.close(code=4003)  # Forbidden
            return

        # 3. Add connection to group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        # 4. Initialize session state
        await self.activate_session()

        await self.accept()
        self.segment_index = 0
        self.processed_segments_count = 0
        logger.info("WebSocket connected for conversation %s, speaker: %s", self.conversation_id, self.speaker)

    async def disconnect(self, close_code):
        # Set disconnected flag in Redis cache
        from django.core.cache import cache
        try:
            cache.set(f"ci:{self.conversation_id}:{self.speaker}:disconnected", True, timeout=3600)
        except Exception:
            pass

        # Await completion of all received chunks in the background thread executor
        attempts = 0
        while self.processed_segments_count < self.segment_index and attempts < 1200:
            await asyncio.sleep(0.5)
            attempts += 1

        # Leave channel group
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )
        # Mark session as inactive
        await self.deactivate_session()
        logger.info("WebSocket disconnected for conversation %s, speaker: %s, code: %s, processed: %s/%s", self.conversation_id, self.speaker, close_code, self.processed_segments_count, self.segment_index)

    async def receive(self, text_data=None, bytes_data=None):
        if not bytes_data:
            return

        # Increment segment counter
        current_segment = self.segment_index
        self.segment_index += 1

        # Increment Redis received counter
        self._safe_cache_incr(f"ci:{self.conversation_id}:{self.speaker}:received")

        # We assume 4 seconds per chunk
        start_time = current_segment * 4.0
        end_time = start_time + 4.0

        # Offload transcription to background thread pool to prevent blocking event loop
        asyncio.create_task(self.process_audio_chunk(bytes_data, start_time, end_time, current_segment))

    async def process_audio_chunk(self, audio_bytes, start_time, end_time, segment_index):
        text = ""
        try:
            # Load provider dynamically
            provider = get_speech_provider()
            
            # Execute synchronous transcribe call in thread pool
            text = await asyncio.to_thread(provider.transcribe, audio_bytes)
            text = text.strip()
            
            # Increment Redis processed counter
            self._safe_cache_incr(f"ci:{self.conversation_id}:{self.speaker}:processed")
            
        except Exception as e:
            logger.exception("Error processing segment %s for conversation %s: %s", segment_index, self.conversation_id, str(e))
            # Increment Redis failed counter
            self._safe_cache_incr(f"ci:{self.conversation_id}:{self.speaker}:failed")
        
        finally:
            self.processed_segments_count += 1
            # Always notify the client that this chunk is done, preventing in-flight counts from stalling
            try:
                await self.send(text_data=json.dumps({
                    "event": "chunk_processed",
                    "segment_index": segment_index,
                    "speaker": self.speaker,
                    "text": text
                }))
            except Exception:
                logger.warning("Failed to send chunk_processed confirmation over WebSocket")

        # Skip empty or silent segment transcripts
        if not text:
            return

        try:
            logger.info("[%s %s-%ss] Transcribed: %s", self.speaker, start_time, end_time, text)

            # Save in database
            await self.save_transcript_segment(self.speaker, start_time, end_time, text)

            # Broadcast new segment to the group
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "broadcast_transcript_segment",
                    "speaker": self.speaker,
                    "start_time": start_time,
                    "end_time": end_time,
                    "text": text
                }
            )
        except Exception as e:
            logger.exception("Failed to save or broadcast transcribed segment: %s", str(e))

    async def broadcast_transcript_segment(self, event):
        # Send raw segment over WebSocket to client UI
        await self.send(text_data=json.dumps({
            "event": "segment_transcribed",
            "speaker": event["speaker"],
            "start_time": event["start_time"],
            "end_time": event["end_time"],
            "text": event["text"]
        }))

    # DATABASE SYNCS
    @database_sync_to_async
    def verify_conversation_access(self) -> bool:
        try:
            conversation = Conversation.objects.get(id=self.conversation_id)
            return conversation.user == self.user
        except Conversation.DoesNotExist:
            return False

    @database_sync_to_async
    def activate_session(self):
        try:
            import uuid
            self.session_key = f"ws_{self.conversation_id}_{uuid.uuid4().hex}"
            conversation = Conversation.objects.get(id=self.conversation_id)
            session, _ = ConversationSession.objects.get_or_create(
                conversation=conversation,
                session_key=self.session_key,
            )
            session.is_active = True
            session.save(update_fields=["is_active", "updated_at"])
        except Exception:
            logger.exception("Failed to activate session for conversation %s", self.conversation_id)

    @database_sync_to_async
    def deactivate_session(self):
        try:
            from django.utils import timezone
            if not hasattr(self, "session_key"):
                return
            session = ConversationSession.objects.filter(
                conversation_id=self.conversation_id,
                session_key=self.session_key
            ).first()
            if session:
                session.is_active = False
                session.ended_at = timezone.now()
                session.save(update_fields=["is_active", "ended_at", "updated_at"])
                
                # Compute and save duration in metadata
                conversation = session.conversation
                metadata = getattr(conversation, "metadata", None)
                if metadata and session.started_at:
                    duration_sec = int((session.ended_at - session.started_at).total_seconds())
                    metadata.duration = max(duration_sec, 0)
                    metadata.save(update_fields=["duration", "updated_at"])
        except Exception:
            logger.exception("Failed to deactivate session for conversation %s", self.conversation_id)

    @database_sync_to_async
    def save_transcript_segment(self, speaker, start_time, end_time, text):
        try:
            conversation = Conversation.objects.get(id=self.conversation_id)
            transcript, _ = Transcript.objects.get_or_create(conversation=conversation)
            
            # 1. Create TranscriptSegment record
            TranscriptSegment.objects.create(
                transcript=transcript,
                speaker=speaker,
                start_time=start_time,
                end_time=end_time,
                text=text,
                created_by=self.user,
                updated_by=self.user
            )

            # 2. Append segment to primary JSON field
            segment_data = {
                "speaker": speaker,
                "start_time": start_time,
                "end_time": end_time,
                "text": text,
                "created_at": timezone.now().isoformat()
            }
            if not isinstance(transcript.data, list):
                transcript.data = []
            transcript.data.append(segment_data)
            transcript.save(update_fields=["data", "updated_at"])
        except Exception:
            logger.exception("Failed to save transcript segment for conversation %s", self.conversation_id)
            raise
