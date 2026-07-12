from rest_framework import serializers
from apps.contacts.models import Contact
from apps.companies.models import Company
from apps.deals.models import Deal
from apps.conversation_intelligence.models import (
    Conversation,
    ConversationSession,
    Transcript,
    TranscriptSegment,
    ConversationInsight,
    ConversationSummary,
    ConversationMetadata
)


class ConversationInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConversationInsight
        fields = ["id", "insight_type", "content", "timestamp"]


class ConversationSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ConversationSummary
        fields = [
            "id",
            "executive_summary",
            "conversation_summary",
            "pain_points",
            "buying_signals",
            "competitors",
            "requirements",
            "timeline",
            "budget",
            "decision_makers",
            "sentiment",
            "objections",
            "tasks",
            "follow_up_email",
            "linkedin_message",
            "suggested_deal_stage",
            "suggested_crm_updates",
            "confirmed"
        ]


class ConversationMetadataSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConversationMetadata
        fields = ["id", "duration", "sample_rate", "language", "audio_channels"]


class TranscriptSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TranscriptSegment
        fields = ["id", "speaker", "start_time", "end_time", "text"]


class TranscriptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transcript
        fields = ["id", "data"]


class ConversationSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    deal_name = serializers.CharField(source="deal.name", read_only=True)
    
    class Meta:
        model = Conversation
        fields = [
            "id",
            "contact",
            "contact_name",
            "company",
            "company_name",
            "deal",
            "deal_name",
            "call_id",
            "status",
            "created_at",
            "updated_at"
        ]


class ConversationDetailSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    deal_name = serializers.CharField(source="deal.name", read_only=True)
    transcript = TranscriptSerializer(read_only=True)
    insights = ConversationInsightSerializer(many=True, read_only=True)
    summary = ConversationSummarySerializer(read_only=True)
    metadata = ConversationMetadataSerializer(read_only=True)

    class Meta:
        model = Conversation
        fields = [
            "id",
            "contact",
            "contact_name",
            "company",
            "company_name",
            "deal",
            "deal_name",
            "call_id",
            "status",
            "transcript",
            "insights",
            "summary",
            "metadata",
            "created_at",
            "updated_at"
        ]
