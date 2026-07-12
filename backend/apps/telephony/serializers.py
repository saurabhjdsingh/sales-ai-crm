from rest_framework import serializers
from apps.telephony.models import (
    TelephonyProvider,
    Call,
    CallParticipant,
    CallTranscript,
    CallSummary,
    CallTask,
    CallEvent
)
from apps.contacts.models import Contact
from apps.companies.models import Company
from apps.deals.models import Deal


class TelephonyProviderSerializer(serializers.ModelSerializer):
    """Serializer for TelephonyProvider. Masking secrets so they are write-only."""
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    transcription_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    webhook_url = serializers.SerializerMethodField()

    class Meta:
        model = TelephonyProvider
        fields = [
            "id",
            "provider_type",
            "name",
            "account_sid",
            "application_sid",
            "phone_number",
            "connection_status",
            "transcription_provider",
            "api_key",
            "api_secret",
            "transcription_key",
            "webhook_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "connection_status", "webhook_url", "created_at", "updated_at"]

    def get_webhook_url(self, obj) -> str:
        # Generate complete absolute URL on request context
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(f"/api/v1/telephony/webhooks/incoming/{obj.id}/")
        return f"/api/v1/telephony/webhooks/incoming/{obj.id}/"

    def create(self, validated_data):
        api_key = validated_data.pop("api_key", None)
        api_secret = validated_data.pop("api_secret", None)
        transcription_key = validated_data.pop("transcription_key", None)
        
        provider = TelephonyProvider.objects.create(**validated_data)
        
        if api_key:
            provider.api_key = api_key
        if api_secret:
            provider.api_secret = api_secret
        if transcription_key:
            provider.transcription_key = transcription_key
            
        provider.save()
        return provider

    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", None)
        api_secret = validated_data.pop("api_secret", None)
        transcription_key = validated_data.pop("transcription_key", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if api_key:
            instance.api_key = api_key
        if api_secret:
            instance.api_secret = api_secret
        if transcription_key:
            instance.transcription_key = transcription_key

        instance.save()
        return instance


class CallParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallParticipant
        fields = ["participant_type", "phone_number", "name"]


class CallTranscriptSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallTranscript
        fields = ["full_text", "transcript_data"]


class CallSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = CallSummary
        fields = [
            "summary",
            "pain_points",
            "buying_signals",
            "objections",
            "suggested_questions",
            "next_steps",
            "suggested_email",
            "suggested_linkedin",
            "suggested_deal_stage",
            "confirmed"
        ]


class CallTaskSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = CallTask
        fields = ["id", "title", "description", "due_date", "priority", "status", "task_type"]


class CallSerializer(serializers.ModelSerializer):
    """
    Serializer to list call histories. Displays nested contact, company, deal contexts.
    """
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    deal_name = serializers.CharField(source="deal.name", read_only=True)
    participants = CallParticipantSerializer(many=True, read_only=True)
    transcript = CallTranscriptSerializer(read_only=True)
    summary = CallSummarySerializer(read_only=True)
    suggested_tasks = CallTaskSerializer(many=True, read_only=True)

    class Meta:
        model = Call
        fields = [
            "id",
            "sid",
            "direction",
            "status",
            "start_time",
            "end_time",
            "duration",
            "recording_enabled",
            "ai_assist_enabled",
            "ai_analysis_enabled",
            "transcript_status",
            "summary_status",
            "notes",
            "contact",
            "contact_name",
            "company",
            "company_name",
            "deal",
            "deal_name",
            "participants",
            "transcript",
            "summary",
            "suggested_tasks",
            "created_at",
        ]
        read_only_fields = ["id", "sid", "status", "start_time", "end_time", "duration", "transcript_status", "summary_status", "created_at"]


class CallConfirmSerializer(serializers.Serializer):
    """Serializer validating the user's post-call review confirmation payload."""
    summary = serializers.CharField(required=True, allow_blank=True)
    pain_points = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    next_steps = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    suggested_deal_stage = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    
    # Task schema
    tasks = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list
    )
