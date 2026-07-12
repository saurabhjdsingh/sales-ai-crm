"""
URL configuration for Radar 36 Sales CRM.
All API endpoints are versioned under /api/v1/.
"""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1_patterns = [
    path("auth/", include("apps.accounts.urls")),
    path("companies/", include("apps.companies.urls")),
    path("contacts/", include("apps.contacts.urls")),
    path("deals/", include("apps.deals.urls")),
    path("tasks/", include("apps.tasks.urls")),
    path("activities/", include("apps.activities.urls")),
    path("notes/", include("apps.notes.urls")),
    path("imports/", include("apps.imports.urls")),
    path("ai/", include("apps.ai_engine.urls")),
    path("agent/", include("apps.agent.urls")),
    path("search/", include("apps.search.urls")),
    path("reports/", include("apps.reports.urls")),
    path("dashboard/", include("apps.dashboard.urls")),
    path("telephony/", include("apps.telephony.urls")),
    path("conversation-intelligence/", include("apps.conversation_intelligence.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1_patterns)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]

if settings.DEBUG:
    import debug_toolbar
    from django.conf.urls.static import static

    urlpatterns = [
        path("__debug__/", include(debug_toolbar.urls)),
    ] + urlpatterns
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
