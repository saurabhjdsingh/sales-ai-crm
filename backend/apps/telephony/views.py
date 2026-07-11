import logging
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets, generics, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError

from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import VoiceResponse

from apps.common.enums import ActivityType, DealStage, TaskType, TaskPriority
from apps.contacts.models import Contact
from apps.companies.models import Company
from apps.deals.models import Deal
from apps.tasks.models import Task
from apps.activities.models import Activity

from apps.telephony.models import (
    TelephonyProvider,
    Call,
    CallParticipant,
    CallTranscript,
    CallSummary,
    CallTask
)
from apps.telephony.serializers import (
    TelephonyProviderSerializer,
    CallSerializer,
    CallConfirmSerializer
)
from apps.telephony.providers.factory import get_provider_for_user
from apps.telephony.services import TelephonyService, TelephonyAIService
from apps.telephony.tasks import process_call_ai_summary

logger = logging.getLogger(__name__)


class TelephonyProviderViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for the user's active Telephony provider credentials.
    """
    serializer_class = TelephonyProviderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TelephonyProvider.objects.filter(user=self.request.user, is_deleted=False).order_by("-created_at")

    def perform_create(self, serializer):
        # Automatically set user on create
        serializer.save(user=self.request.user, created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        instance.soft_delete(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="test-connection")
    def test_connection(self, request, pk=None):
        """
        Verify connection status with Twilio API using decrypted keys.
        """
        provider = self.get_object()
        try:
            prov_client = get_provider_for_user(request.user, provider.provider_type)
            is_valid = prov_client.connect()
            
            provider.connection_status = "connected" if is_valid else "failed"
            provider.save(update_fields=["connection_status"])
            
            return Response({
                "connected": is_valid,
                "status": provider.connection_status
            })
        except Exception as e:
            logger.exception("Provider connection check failed: %s", str(e))
            provider.connection_status = "failed"
            provider.save(update_fields=["connection_status"])
            return Response({
                "connected": False,
                "status": "failed",
                "error": str(e)
            }, status=status.HTTP_400_BAD_REQUEST)


class TokenGenerationView(APIView):
    """
    GET /api/v1/telephony/token/
    Generates dynamic capability token for Twilio WebRTC client softphone registration.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            # Load active provider logic
            provider = TelephonyProvider.objects.get(
                user=request.user,
                is_deleted=False
            )
            prov_client = get_provider_for_user(request.user, provider.provider_type)
            
            # Identity format: agent_UUID
            client_identity = f"agent_{str(request.user.id).replace('-', '_')}"
            token = prov_client.generate_access_token(client_identity=client_identity)
            
            return Response({
                "token": token,
                "identity": client_identity,
                "provider_type": provider.provider_type,
                "transcription_provider": provider.transcription_provider
            })
        except TelephonyProvider.DoesNotExist:
            return Response(
                {"error": "No active telephony configuration found."},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.exception("Failed to generate voice token: %s", str(e))
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CRMLookupView(APIView):
    """
    GET /api/v1/telephony/lookup/?phone=...
    Looks up contact card data by phone number. Used on Incoming Call popup and Outgoing dialer.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        phone = request.query_params.get("phone", "").strip()
        if not phone:
            return Response({"error": "Phone number is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Standard cleanups for phone matching (removing common chars like +, -, space)
        clean_phone = phone.replace("+", "").replace("-", "").replace(" ", "").strip()
        
        # Simple lookup: starts with or contains
        contacts = Contact.objects.filter(is_deleted=False).select_related("company")
        
        # Match using django models
        matched_contact = None
        for contact in contacts:
            c_phone = contact.phone.replace("+", "").replace("-", "").replace(" ", "").strip()
            if clean_phone in c_phone or c_phone in clean_phone:
                matched_contact = contact
                break

        if not matched_contact:
            return Response({"matched": False})

        # Assemble CRM cards context
        company = matched_contact.company
        deals = Deal.objects.filter(company=company, is_deleted=False)[:5]
        tasks = Task.objects.filter(contact=matched_contact, is_deleted=False)[:5]
        notes = matched_contact.notes.filter(is_deleted=False)[:5]
        activities = matched_contact.activities.filter(is_deleted=False)[:5]

        return Response({
            "matched": True,
            "contact": {
                "id": matched_contact.id,
                "first_name": matched_contact.first_name,
                "last_name": matched_contact.last_name,
                "full_name": matched_contact.full_name,
                "phone": matched_contact.phone,
                "job_title": matched_contact.job_title,
            },
            "company": {
                "id": company.id,
                "name": company.name,
                "industry": company.industry,
            } if company else None,
            "deals": [
                {
                    "id": d.id,
                    "name": d.name,
                    "stage": d.stage,
                    "expected_revenue": d.expected_revenue,
                }
                for d in deals
            ],
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "due_date": t.due_date,
                    "status": t.status,
                }
                for t in tasks
            ],
            "notes": [
                {
                    "id": n.id,
                    "content": n.content,
                    "created_at": n.created_at,
                }
                for n in notes
            ],
            "activities": [
                {
                    "id": a.id,
                    "activity_type": a.activity_type,
                    "title": a.title,
                    "created_at": a.created_at,
                }
                for a in activities
            ]
        })


class CallViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lists logged calls history. Analyzes, triggers summaries, and confirms post-call reviews.
    """
    serializer_class = CallSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Call.objects.filter(user=self.request.user, is_deleted=False).order_by("-created_at")

    @action(detail=False, methods=["post"], url_path="initiate", url_name="initiate")
    def initiate_call(self, request):
        """
        POST /api/v1/telephony/calls/initiate/
        Initializes an outbound call record before dialing on the client.
        """
        phone = request.data.get("phone", "")
        contact_id = request.data.get("contact_id")
        deal_id = request.data.get("deal_id")
        ai_assist = request.data.get("ai_assist_enabled", False)

        if not phone:
            raise ValidationError("Phone number is required.")

        contact = None
        company = None
        deal = None

        if contact_id:
            contact = get_object_or_404(Contact, id=contact_id, is_deleted=False)
            company = contact.company
        elif phone:
            # Fallback contact lookup by phone number
            clean_phone = phone.replace("+", "").replace("-", "").replace(" ", "").strip()
            contacts = Contact.objects.filter(is_deleted=False).select_related("company")
            for c in contacts:
                c_phone = c.phone.replace("+", "").replace("-", "").replace(" ", "").strip()
                if clean_phone in c_phone or c_phone in clean_phone:
                    contact = c
                    company = c.company
                    break

        if deal_id:
            deal = get_object_or_404(Deal, id=deal_id, is_deleted=False)
        
        # Auto-link deal if not explicitly provided
        if not deal and contact:
            # Check if there is an active deal linked to this contact directly
            deal = Deal.objects.filter(contacts=contact, is_deleted=False).first()
            # If not, check if there is an active deal linked to the contact's company
            if not deal and company:
                deal = Deal.objects.filter(company=company, is_deleted=False).first()

        if deal and not company:
            company = deal.company

        # Try to resolve active provider
        provider = TelephonyProvider.objects.filter(
            user=request.user, is_deleted=False
        ).first()

        call = Call.objects.create(
            user=request.user,
            provider=provider,
            contact=contact,
            company=company,
            deal=deal,
            direction="outbound",
            status="queued",
            ai_assist_enabled=ai_assist
        )

        # Create participants
        CallParticipant.objects.create(
            call=call,
            participant_type="agent",
            phone_number=provider.phone_number if provider else "",
            name=request.user.get_full_name()
        )
        CallParticipant.objects.create(
            call=call,
            participant_type="contact",
            phone_number=phone,
            name=contact.full_name if contact else ""
        )

        # Create blank transcript
        CallTranscript.objects.create(call=call)

        return Response(CallSerializer(call).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="append-transcript")
    def append_transcript(self, request, pk=None):
        """
        POST /api/v1/telephony/calls/<id>/append-transcript/
        Receives transcription segments and appends them to CallTranscript model.
        """
        call = get_object_or_404(Call, id=pk, user=request.user)
        speaker = request.data.get("speaker") # 'agent' or 'contact'
        text = request.data.get("text", "").strip()

        if not speaker or not text:
            raise ValidationError("Speaker and text are required.")

        transcript, _ = CallTranscript.objects.get_or_create(call=call)
        
        timestamp = timezone.now().timestamp()
        
        # Build segment
        speaker_label = "Agent" if speaker == "agent" else "Customer"
        segment = f"{speaker_label}: {text}"
        
        # Append to full_text
        if transcript.full_text:
            transcript.full_text += f"\n{segment}"
        else:
            transcript.full_text = segment
            
        transcript.transcript_data.append({
            "speaker": speaker,
            "text": text,
            "timestamp": timestamp
        })
        transcript.save()

        # Incremental analysis if AI assist is enabled
        analysis = {}
        if call.ai_assist_enabled:
            analysis = TelephonyAIService.analyze_call_incrementally(call)

        return Response({
            "transcript_length": len(transcript.full_text),
            "analysis": analysis
        })

    @action(detail=True, methods=["post"], url_path="transcribe-chunk")
    def transcribe_chunk(self, request, pk=None):
        """
        POST /api/v1/telephony/calls/<id>/transcribe-chunk/
        Accepts recorded dual-channel audio blob, sends it to Deepgram or Whisper,
        appends results, and runs AI Assist.
        """
        call = get_object_or_404(Call, id=pk, user=request.user)
        audio_file = request.FILES.get("audio")

        if not audio_file:
            raise ValidationError("Audio file chunk is required.")

        # Find provider setup
        provider = call.provider
        if not provider or provider.transcription_provider == "none":
            # Simulator or local WebSpeech handles transcription
            return Response({"message": "Local speech or simulator transcription expected. Chunk skipped."})

        # Decrypt transcription key
        transcription_key = provider.transcription_key
        transcription_type = provider.transcription_provider

        transcribed_text = ""
        try:
            import httpx
            if transcription_type == "deepgram":
                # Call Deepgram REST API
                headers = {"Authorization": f"Token {transcription_key}", "Content-Type": "audio/webm"}
                url = "https://api.deepgram.com/v1/listen?smart_format=true"
                response = httpx.post(url, headers=headers, content=audio_file.read(), timeout=15.0)
                if response.status_code == 200:
                    dg_data = response.json()
                    transcribed_text = dg_data.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")
            elif transcription_type == "whisper":
                # Call OpenAI Whisper API
                headers = {"Authorization": f"Bearer {transcription_key}"}
                files = {"file": ("chunk.webm", audio_file.read(), "audio/webm"), "model": (None, "whisper-1")}
                url = "https://api.openai.com/v1/audio/transcriptions"
                response = httpx.post(url, headers=headers, files=files, timeout=15.0)
                if response.status_code == 200:
                    transcribed_text = response.json().get("text", "")
        except Exception as e:
            logger.exception("External transcription chunk call failed: %s", str(e))
            return Response({"error": "Transcription engine failed."}, status=status.HTTP_502_BAD_GATEWAY)

        if not transcribed_text.strip():
            return Response({"transcribed": ""})

        # For mixed audio chunk, speaker labeling (diarization) is harder.
        # We default to appending as raw segment, or run a tiny prompt on it.
        # For simplicity, append as combined dialogue chunk
        transcript, _ = CallTranscript.objects.get_or_create(call=call)
        segment = f"Dialogue: {transcribed_text}"
        if transcript.full_text:
            transcript.full_text += f"\n{segment}"
        else:
            transcript.full_text = segment

        transcript.transcript_data.append({
            "speaker": "dialogue",
            "text": transcribed_text,
            "timestamp": timezone.now().timestamp()
        })
        transcript.save()

        # Trigger incremental analysis
        analysis = {}
        if call.ai_assist_enabled:
            analysis = TelephonyAIService.analyze_call_incrementally(call)

        return Response({
            "transcribed": transcribed_text,
            "analysis": analysis
        })

    @action(detail=True, methods=["post"], url_path="summarize")
    def summarize_call(self, request, pk=None):
        """
        POST /api/v1/telephony/calls/<id>/summarize/
        Triggers final call summarization asynchronously (via Celery) or synchronously.
        """
        call = get_object_or_404(Call, id=pk, user=request.user)
        
        # Set end time if not set
        if not call.end_time:
            call.end_time = timezone.now()
            if call.start_time:
                call.duration = int((call.end_time - call.start_time).total_seconds())
            call.status = "completed"
            call.save()

        # Trigger background Celery task
        process_call_ai_summary.delay(str(call.id))

        return Response({
            "status": "summarizing",
            "message": "AI summarization triggered in the background."
        })

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm_review(self, request, pk=None):
        """
        POST /api/v1/telephony/calls/<id>/confirm/
        Accepts the validated user-confirmed post-call parameters, logs Activity and approved tasks.
        """
        call = get_object_or_404(Call, id=pk, user=request.user)
        
        serializer = CallConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Confirm and log call
        activity = TelephonyService.confirm_post_call_review(call, serializer.validated_data)

        return Response({
            "status": "confirmed",
            "activity_id": str(activity.id),
            "message": "Call successfully confirmed and logged in CRM."
        })


class WebhookBypassCSRFMixin:
    """Disables CSRF and session auth checks on webhook handlers."""
    authentication_classes = []
    permission_classes = [AllowAny]


def validate_twilio_signature(request, provider: TelephonyProvider):
    """
    Validate Twilio Webhook X-Twilio-Signature.
    Bypassed in settings.DEBUG = True mode to ease local setups.
    """
    if settings.DEBUG:
        return
        
    validator = RequestValidator(provider.api_secret)
    url = request.build_absolute_uri()
    
    # Sort post params
    post_data = request.POST.dict()
    signature = request.META.get("HTTP_X_TWILIO_SIGNATURE", "")
    
    if not validator.validate(url, post_data, signature):
        logger.warning("Twilio webhook signature verification failed for URL: %s", url)
        raise PermissionDenied("Invalid signature.")


class TwilioIncomingCallWebhookView(WebhookBypassCSRFMixin, APIView):
    """
    POST /api/v1/telephony/webhooks/incoming/<provider_id>/
    Twilio Incoming Call webhook endpoint.
    Routes calls to the corresponding agent softphone.
    """
    def post(self, request, provider_id):
        provider = get_object_or_404(TelephonyProvider, id=provider_id, is_deleted=False)
        validate_twilio_signature(request, provider)

        caller = request.POST.get("From", "")
        call_sid = request.POST.get("CallSid", "")

        # Lookup matching contact
        contact = None
        company = None
        if caller:
            clean_caller = caller.replace("+", "").replace("-", "").replace(" ", "").strip()
            contacts = Contact.objects.filter(is_deleted=False)
            for c in contacts:
                c_phone = c.phone.replace("+", "").replace("-", "").replace(" ", "").strip()
                if clean_caller in c_phone or c_phone in clean_caller:
                    contact = c
                    company = c.company
                    break

        # Create inbound Call record
        call = Call.objects.create(
            sid=call_sid,
            user=provider.user,
            provider=provider,
            contact=contact,
            company=company,
            direction="inbound",
            status="ringing",
            ai_assist_enabled=True # Default enabled or setting-controlled
        )

        CallParticipant.objects.create(
            call=call,
            participant_type="contact",
            phone_number=caller,
            name=contact.full_name if contact else ""
        )
        CallParticipant.objects.create(
            call=call,
            participant_type="agent",
            phone_number=provider.phone_number,
            name=provider.user.get_full_name()
        )

        CallTranscript.objects.create(call=call)

        # Audit event
        TelephonyService.record_call_event(call, "ringing", request.POST)

        # Build TwiML routing to browser client
        # Identity: agent_UUID
        client_name = f"agent_{str(provider.user.id).replace('-', '_')}"
        
        response = VoiceResponse()
        dial = response.dial(
            caller_id=caller,
            action=f"/api/v1/telephony/webhooks/status/{provider.id}/",
            method="POST"
        )
        dial.client(client_name)

        return HttpResponse(str(response), content_type="application/xml")


class TwilioVoiceWebhookView(WebhookBypassCSRFMixin, APIView):
    """
    POST /api/v1/telephony/webhooks/voice/<provider_id>/
    Twilio Outgoing Call router endpoint.
    Executed when the softphone triggers Device.connect().
    """
    def post(self, request, provider_id):
        provider = get_object_or_404(TelephonyProvider, id=provider_id, is_deleted=False)
        validate_twilio_signature(request, provider)

        # Extract destination number from standard or custom WebRTC parameters
        to_number = (
            request.POST.get("params[To]") or 
            request.POST.get("params[to]") or 
            request.POST.get("To") or 
            request.POST.get("to") or 
            ""
        )
        
        # Clean up Twilio client diagnostic identities
        if to_number.startswith("client:"):
            to_number = ""

        call_sid = request.POST.get("CallSid", "")
        
        # Create TwiML response
        response = VoiceResponse()
        
        if not to_number:
            response.say("Welcome to the Sales CRM outbound voice gateway. Your connection is successful.")
            return HttpResponse(str(response), content_type="application/xml")
            
        # Set callerId to the BYOC configured number
        dial = response.dial(
            caller_id=provider.phone_number,
            record="record-from-answer", # Enable twilio recording
        )
        dial.number(to_number)

        # Try to find active Call record pre-initialized via CallViewSet.initiate_call
        call = Call.objects.filter(
            user=provider.user,
            direction="outbound",
            status="queued"
        ).first()

        if call:
            call.sid = call_sid
            call.status = "ringing"
            call.save()
            TelephonyService.record_call_event(call, "ringing", request.POST)

        return HttpResponse(str(response), content_type="application/xml")


class TwilioStatusWebhookView(WebhookBypassCSRFMixin, APIView):
    """
    POST /api/v1/telephony/webhooks/status/<provider_id>/
    Receives call status updates (answered, busy, completed) from Twilio.
    """
    def post(self, request, provider_id):
        provider = get_object_or_404(TelephonyProvider, id=provider_id, is_deleted=False)
        validate_twilio_signature(request, provider)

        call_sid = request.POST.get("CallSid")
        call_status = request.POST.get("CallStatus") # ringing, in-progress, completed, failed, busy, no-answer, canceled

        try:
            call = Call.objects.get(sid=call_sid)
        except Call.DoesNotExist:
            logger.warning("Call SID %s not found for status update.", call_sid)
            return HttpResponse("Call not found.", status=200)

        # Record event
        TelephonyService.record_call_event(call, call_status, request.POST)

        # Trigger Celery summarization automatically if call is completed
        if call_status == "completed":
            process_call_ai_summary.delay(str(call.id))

        return HttpResponse("Status updated.")
