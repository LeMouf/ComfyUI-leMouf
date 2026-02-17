from __future__ import annotations

import re
from typing import Any, Dict, List, Mapping, Optional

WORKFLOW_PROFILE_NODE_TYPE = "LeMoufWorkflowProfile"
WORKFLOW_PROFILE_DEFAULT = {
    "profile_id": "generic_loop",
    "profile_version": "0.1.0",
    "ui_contract_version": "1.0.0",
    "workflow_kind": "master",
}


def normalize_profile_id(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def normalize_semver(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if re.match(r"^\d+\.\d+\.\d+$", text):
        return text
    return fallback


def normalize_workflow_kind(value: Any, fallback: str = "master") -> str:
    text = str(value or "").strip().lower()
    if text in {"master", "branch"}:
        return text
    return fallback


def coalesce_profile_id(profile_id_raw: Any, profile_id_custom_raw: Any) -> str:
    profile_id = normalize_profile_id(profile_id_raw)
    custom = normalize_profile_id(profile_id_custom_raw)
    if profile_id in {"custom", "other"}:
        return custom or ""
    return profile_id or custom or ""


def finalize_workflow_profile(raw: Optional[Mapping[str, Any]], source: str) -> Dict[str, Any]:
    value = raw or {}
    profile_id = coalesce_profile_id(
        value.get("profile_id"),
        value.get("profile_id_custom"),
    )
    if not profile_id:
        profile_id = WORKFLOW_PROFILE_DEFAULT["profile_id"]
    return {
        "profile_id": profile_id,
        "profile_version": normalize_semver(
            value.get("profile_version"),
            WORKFLOW_PROFILE_DEFAULT["profile_version"],
        ),
        "ui_contract_version": normalize_semver(
            value.get("ui_contract_version"),
            WORKFLOW_PROFILE_DEFAULT["ui_contract_version"],
        ),
        "workflow_kind": normalize_workflow_kind(
            value.get("workflow_kind"),
            WORKFLOW_PROFILE_DEFAULT["workflow_kind"],
        ),
        "source": str(value.get("source") or source or "fallback"),
    }


def extract_workflow_profile_from_prompt(prompt: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(prompt, Mapping):
        return None
    for node in prompt.values():
        if not isinstance(node, Mapping):
            continue
        class_type = str(node.get("class_type") or node.get("type") or "").strip()
        if class_type != WORKFLOW_PROFILE_NODE_TYPE:
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, Mapping):
            inputs = {}
        return finalize_workflow_profile(
            {
                "profile_id": inputs.get("profile_id"),
                "profile_id_custom": inputs.get("profile_id_custom"),
                "profile_version": inputs.get("profile_version"),
                "ui_contract_version": inputs.get("ui_contract_version"),
                "workflow_kind": inputs.get("workflow_kind"),
                "source": "prompt_node",
            },
            "prompt_node",
        )
    return None


def extract_workflow_profile_from_workflow(workflow: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(workflow, Mapping):
        return None
    nodes = workflow.get("nodes")
    if not isinstance(nodes, list):
        return None
    for node in nodes:
        if not isinstance(node, Mapping):
            continue
        class_type = str(node.get("type") or node.get("class_type") or "").strip()
        if class_type != WORKFLOW_PROFILE_NODE_TYPE:
            continue
        direct_inputs = node.get("inputs")
        if not isinstance(direct_inputs, Mapping):
            direct_inputs = {}
        widget_values = node.get("widgets_values")
        if not isinstance(widget_values, list):
            widget_values = []
        has_custom_field = len(widget_values) >= 4
        has_kind_field = len(widget_values) >= 5
        profile_id = direct_inputs.get("profile_id")
        if profile_id is None and len(widget_values) >= 1:
            profile_id = widget_values[0]
        profile_id_custom = direct_inputs.get("profile_id_custom")
        if profile_id_custom is None and has_custom_field:
            profile_id_custom = widget_values[1]
        profile_version = direct_inputs.get("profile_version")
        if profile_version is None:
            if has_custom_field and len(widget_values) >= 3:
                profile_version = widget_values[2]
            elif len(widget_values) >= 2:
                profile_version = widget_values[1]
        ui_contract_version = direct_inputs.get("ui_contract_version")
        if ui_contract_version is None:
            if has_custom_field and len(widget_values) >= 4:
                ui_contract_version = widget_values[3]
            elif len(widget_values) >= 3:
                ui_contract_version = widget_values[2]
        workflow_kind = direct_inputs.get("workflow_kind")
        if workflow_kind is None and has_kind_field:
            workflow_kind = widget_values[4]
        return finalize_workflow_profile(
            {
                "profile_id": profile_id,
                "profile_id_custom": profile_id_custom,
                "profile_version": profile_version,
                "ui_contract_version": ui_contract_version,
                "workflow_kind": workflow_kind,
                "source": "workflow_node",
            },
            "workflow_node",
        )
    return None


def resolve_workflow_profile(
    workflow: Optional[Mapping[str, Any]] = None,
    prompt: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    if isinstance(prompt, Mapping):
        from_prompt = extract_workflow_profile_from_prompt(prompt)
        if from_prompt:
            return from_prompt
    if isinstance(workflow, Mapping):
        from_workflow = extract_workflow_profile_from_workflow(workflow)
        if from_workflow:
            return from_workflow

    types: List[str] = []
    if isinstance(prompt, Mapping):
        for node in prompt.values():
            if not isinstance(node, Mapping):
                continue
            types.append(str(node.get("class_type") or node.get("type") or "").strip())
    if not types and isinstance(workflow, Mapping):
        nodes = workflow.get("nodes")
        if isinstance(nodes, list):
            for node in nodes:
                if not isinstance(node, Mapping):
                    continue
                types.append(str(node.get("type") or node.get("class_type") or "").strip())
    lowered = [item.lower() for item in types if item]
    if "song2dawrun" in lowered or any("song2daw" in item for item in lowered):
        return finalize_workflow_profile(
            {
                "profile_id": "song2daw",
                "source": "heuristic_song2daw",
            },
            "heuristic_song2daw",
        )
    return finalize_workflow_profile(
        {
            "profile_id": "generic_loop",
            "source": "fallback_generic",
        },
        "fallback_generic",
    )

