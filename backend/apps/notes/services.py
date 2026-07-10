"""
Service layer for notes.
"""

import logging

from apps.common.enums import ActivityType
from apps.common.utils import truncate_text
from apps.notes.models import Note

logger = logging.getLogger(__name__)


class NoteService:
    """Business logic for note operations."""

    @staticmethod
    def create_note(data: dict, user) -> Note:
        note = Note.objects.create(**data, created_by=user, updated_by=user)

        # Log activity
        from apps.activities.models import Activity

        Activity.objects.create(
            activity_type=ActivityType.NOTE,
            title=f"Note added: {truncate_text(note.content, 60)}",
            company=note.company,
            contact=note.contact,
            deal=note.deal,
            performed_by=user,
            created_by=user,
        )
        return note
