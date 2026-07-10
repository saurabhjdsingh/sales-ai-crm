"""
Filters for the Tasks module.
"""

import django_filters

from apps.common.enums import TaskPriority, TaskStatus, TaskType
from apps.common.filters import BaseEntityFilter
from apps.tasks.models import Task


class TaskFilter(BaseEntityFilter):
    status = django_filters.ChoiceFilter(choices=TaskStatus.choices)
    priority = django_filters.ChoiceFilter(choices=TaskPriority.choices)
    task_type = django_filters.ChoiceFilter(choices=TaskType.choices)
    company = django_filters.UUIDFilter(field_name="company__id")
    contact = django_filters.UUIDFilter(field_name="contact__id")
    deal = django_filters.UUIDFilter(field_name="deal__id")
    due_before = django_filters.DateTimeFilter(field_name="due_date", lookup_expr="lte")
    due_after = django_filters.DateTimeFilter(field_name="due_date", lookup_expr="gte")

    class Meta:
        model = Task
        fields = ["status", "priority", "task_type", "owner", "company", "contact", "deal"]
