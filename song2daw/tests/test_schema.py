from song2daw.core.graph import validate_songgraph

def test_schema_minimal_rejects_empty():
    assert validate_songgraph({}) is False
