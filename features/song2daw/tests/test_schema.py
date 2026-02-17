import features.song2daw.core.graph as graph_module
from features.song2daw.core.graph import validate_songgraph


def _minimal_graph():
    return {
        "schema_version": "1.0.0",
        "pipeline_version": "0.1.0",
        "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
        "nodes": [],
        "edges": [],
    }


def test_schema_minimal_rejects_empty():
    assert validate_songgraph({}) is False


def test_schema_minimal_accepts_valid_graph():
    assert validate_songgraph(_minimal_graph()) is True


def test_schema_rejects_invalid_timebase_values():
    graph = _minimal_graph()
    graph["timebase"]["audio"]["sr"] = 0
    assert validate_songgraph(graph) is False


def test_schema_rejects_invalid_node_shape():
    graph = _minimal_graph()
    graph["nodes"] = [{"type": "EventNode", "data": {}}]
    assert validate_songgraph(graph) is False


def test_schema_fallback_without_jsonschema(monkeypatch):
    graph = _minimal_graph()
    monkeypatch.setattr(graph_module, "Draft202012Validator", None)
    assert graph_module.validate_songgraph(graph) is True

    graph["edges"] = [{"from": "n1", "type": "contains"}]
    assert graph_module.validate_songgraph(graph) is False


def test_schema_uses_validator_when_available(monkeypatch):
    class _FakeValidator:
        def __init__(self, schema):
            self.schema = schema

        def iter_errors(self, _data):
            return iter(())

    monkeypatch.setattr(graph_module, "Draft202012Validator", _FakeValidator)
    assert graph_module.validate_songgraph(_minimal_graph()) is True
