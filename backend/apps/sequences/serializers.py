from rest_framework import serializers
from apps.common.serializers import AuditFieldsMixin
from apps.sequences.models import (
    Sequence,
    SequenceStep,
    SequenceEnrollment,
    SequenceStepExecution,
    SequenceEmailDraft,
    SequenceLinkClick,
)
from apps.contacts.serializers import ContactListSerializer


class SequenceStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = SequenceStep
        fields = [
            "id",
            "step_number",
            "action_type",
            "delay",
            "delay_unit",
            "configuration",
        ]


class SequenceListSerializer(AuditFieldsMixin, serializers.ModelSerializer):
    steps_count = serializers.IntegerField(source="steps.count", read_only=True)
    active_enrollments_count = serializers.SerializerMethodField()

    class Meta:
        model = Sequence
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "track_opens",
            "track_clicks",
            "steps_count",
            "active_enrollments_count",
            "created_at",
            "updated_at",
        ]

    def get_active_enrollments_count(self, obj):
        return obj.enrollments.filter(status__in=["running", "waiting", "waiting_approval"]).count()


class SequenceDetailSerializer(AuditFieldsMixin, serializers.ModelSerializer):
    steps = SequenceStepSerializer(many=True, read_only=True)
    active_enrollments_count = serializers.SerializerMethodField()
    total_enrolled_count = serializers.SerializerMethodField()

    class Meta:
        model = Sequence
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "track_opens",
            "track_clicks",
            "steps",
            "active_enrollments_count",
            "total_enrolled_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_active_enrollments_count(self, obj):
        return obj.enrollments.filter(status__in=["running", "waiting", "waiting_approval"]).count()

    def get_total_enrolled_count(self, obj):
        return obj.enrollments.count()


class SequenceCreateUpdateSerializer(serializers.ModelSerializer):
    steps = SequenceStepSerializer(many=True, required=False)

    class Meta:
        model = Sequence
        fields = [
            "name",
            "description",
            "is_active",
            "track_opens",
            "track_clicks",
            "steps",
        ]

    def create(self, validated_data):
        steps_data = validated_data.pop("steps", [])
        sequence = Sequence.objects.create(**validated_data)
        for idx, step_data in enumerate(steps_data, start=1):
            step_num = step_data.pop("step_number", idx)
            SequenceStep.objects.create(sequence=sequence, step_number=step_num, **step_data)
        return sequence

    def update(self, instance, validated_data):
        steps_data = validated_data.pop("steps", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if steps_data is not None:
            instance.steps.all().delete()
            for idx, step_data in enumerate(steps_data, start=1):
                step_num = step_data.pop("step_number", idx)
                SequenceStep.objects.create(sequence=instance, step_number=step_num, **step_data)
        return instance


class SequenceEnrollmentSerializer(AuditFieldsMixin, serializers.ModelSerializer):
    sequence_name = serializers.CharField(source="sequence.name", read_only=True)
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    contact_email = serializers.CharField(source="contact.email", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, default=None)

    class Meta:
        model = SequenceEnrollment
        fields = [
            "id",
            "sequence",
            "sequence_name",
            "contact",
            "contact_name",
            "contact_email",
            "company",
            "company_name",
            "deal",
            "status",
            "current_step_number",
            "next_execution_at",
            "stop_reason",
            "stopped_at",
            "open_count",
            "click_count",
            "has_replied",
            "last_opened_at",
            "last_clicked_at",
            "created_at",
            "updated_at",
        ]


class SequenceEmailDraftSerializer(AuditFieldsMixin, serializers.ModelSerializer):
    sequence_name = serializers.CharField(source="enrollment.sequence.name", read_only=True)
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    contact_email = serializers.CharField(source="contact.email", read_only=True)

    class Meta:
        model = SequenceEmailDraft
        fields = [
            "id",
            "execution",
            "enrollment",
            "sequence_name",
            "contact",
            "contact_name",
            "contact_email",
            "sender",
            "subject",
            "reply_to",
            "body_html",
            "body_text",
            "context_summary",
            "status",
            "open_count",
            "first_opened_at",
            "last_opened_at",
            "click_count",
            "first_clicked_at",
            "last_clicked_at",
            "approved_at",
            "sent_at",
            "created_at",
        ]


class SequenceStepExecutionSerializer(serializers.ModelSerializer):
    action_type = serializers.CharField(source="step.action_type", read_only=True)
    step_number = serializers.IntegerField(source="step.step_number", read_only=True)

    class Meta:
        model = SequenceStepExecution
        fields = [
            "id",
            "step_number",
            "action_type",
            "status",
            "scheduled_at",
            "executed_at",
            "completed_at",
            "task_outcome",
            "error_message",
        ]
