from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_backend_composition_export_manifest_store_wiring_present():
    module_text = (_repo_root() / "backend" / "composition" / "export_manifest.py").read_text(encoding="utf-8")
    profiles_text = (_repo_root() / "backend" / "composition" / "export_profiles.py").read_text(encoding="utf-8")
    execute_text = (_repo_root() / "backend" / "composition" / "render_execute.py").read_text(encoding="utf-8")
    nodes_text = (_repo_root() / "nodes.py").read_text(encoding="utf-8")
    assert "class CompositionRenderManifestStore" in module_text
    assert "_SCHEMA_PREFIX = \"lemouf.composition.render_manifest.\"" in module_text
    assert "def save(self, *, scope_key: str, manifest: Dict[str, Any]) -> Optional[Dict[str, Any]]:" in module_text
    assert "def resolve(self, *, scope_key: str, file_name: str) -> Optional[str]:" in module_text
    assert "EXPORT_PROFILES_SCHEMA_VERSION = \"0.1.0\"" in profiles_text
    assert "def list_export_profiles() -> List[Dict[str, Any]]:" in profiles_text
    assert "def build_export_plan(raw_output: Dict[str, Any]) -> Dict[str, Any]:" in profiles_text
    assert "class CompositionRenderExecutionService" in execute_text
    assert "RENDER_EXEC_SCHEMA_VERSION = \"0.1.0\"" in execute_text
    assert "def execute(" in execute_text
    assert "export_plan = composition_export_profiles.build_export_plan(output)" in nodes_text
    assert "add_route(\"GET\", \"/lemouf/composition/export_profiles\", composition_export_profiles_get)" in nodes_text
    assert "add_route(\"POST\", \"/lemouf/composition/export_manifest\", composition_export_manifest_post)" in nodes_text
    assert "add_route(\"GET\", \"/lemouf/composition/export_manifest/{scope_key}/{file_name}\", composition_export_manifest_get)" in nodes_text
    assert "add_route(\"POST\", \"/lemouf/composition/export_execute\", composition_export_execute_post)" in nodes_text
    assert "add_route(\"GET\", \"/lemouf/composition/render_file/{scope_key}/{file_name}\", composition_render_file_get)" in nodes_text
