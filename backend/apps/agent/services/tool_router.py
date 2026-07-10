import logging
import time
import traceback
from typing import Any, Dict

from django.utils import timezone

from apps.agent.enums import ApprovalStatus, ToolExecutionStatus
from apps.agent.models import PendingApproval, ToolExecution
from apps.agent.services.context import AgentContext
from apps.agent.tools.base import ToolResult
from apps.agent.tools.registry import tool_registry

logger = logging.getLogger(__name__)


class ToolRouter:
    """
    Handles routing and dispatching tool executions, logging executions,
    and gating actions that require human approval.
    """

    def route_tool_call(self, tool_name: str, params: Dict[str, Any], context: AgentContext) -> ToolResult:
        """
        Locates and executes a tool, managing duration tracking, logging,
        and approval logic.
        """
        start_time = time.time()
        execution = ToolExecution(
            tool_name=tool_name,
            parameters=params,
            conversation=context.conversation,
            created_by=context.user,
        )

        try:
            tool = tool_registry.get_tool(tool_name)
        except KeyError:
            error_msg = f"Tool '{tool_name}' not found in registry."
            execution.status = ToolExecutionStatus.FAILURE
            execution.error_message = error_msg
            execution.save()
            return ToolResult(success=False, error=error_msg)

        try:
            # Execute tool logic
            result = tool.execute(context, **params)

            duration = int((time.time() - start_time) * 1000)
            execution.duration_ms = duration

            if result.requires_approval:
                # Create a pending approval record
                pending = PendingApproval.objects.create(
                    tool_name=tool_name,
                    parameters=params,
                    status=ApprovalStatus.PENDING,
                    action_payload=result.approval_payload,
                    conversation=context.conversation,
                    created_by=context.user,
                )
                result.data["pending_approval_id"] = str(pending.id)
                execution.status = ToolExecutionStatus.PENDING_APPROVAL
                execution.result = {
                    "pending_approval_id": str(pending.id),
                    "summary": result.summary,
                }
            elif result.success:
                execution.status = ToolExecutionStatus.SUCCESS
                execution.result = result.data
            else:
                execution.status = ToolExecutionStatus.FAILURE
                execution.error_message = result.error

            execution.save()
            return result

        except Exception as e:
            duration = int((time.time() - start_time) * 1000)
            error_msg = f"Error executing tool '{tool_name}': {str(e)}"
            logger.exception(error_msg)

            execution.duration_ms = duration
            execution.status = ToolExecutionStatus.FAILURE
            execution.error_message = f"{error_msg}\n{traceback.format_exc()}"
            execution.save()

            return ToolResult(success=False, error=error_msg)
