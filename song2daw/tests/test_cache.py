from song2daw.core.cache import build_step_cache_key


def test_build_step_cache_key_is_stable_with_mapping_order():
    first = build_step_cache_key(
        step_name="TempoAnalysis",
        step_version="0.1.0",
        inputs={"audio_path": "song.wav", "params": {"b": 2, "a": 1}},
        config={"threshold": 0.9, "window": 1024},
        model_versions={"tempo_model": "1.0.0"},
    )
    second = build_step_cache_key(
        step_name="TempoAnalysis",
        step_version="0.1.0",
        inputs={"params": {"a": 1, "b": 2}, "audio_path": "song.wav"},
        config={"window": 1024, "threshold": 0.9},
        model_versions={"tempo_model": "1.0.0"},
    )

    assert first == second


def test_build_step_cache_key_changes_when_config_changes():
    baseline = build_step_cache_key(
        step_name="TempoAnalysis",
        step_version="0.1.0",
        inputs={"audio_path": "song.wav"},
        config={"window": 1024},
        model_versions={"tempo_model": "1.0.0"},
    )
    changed = build_step_cache_key(
        step_name="TempoAnalysis",
        step_version="0.1.0",
        inputs={"audio_path": "song.wav"},
        config={"window": 2048},
        model_versions={"tempo_model": "1.0.0"},
    )

    assert baseline != changed


def test_build_step_cache_key_changes_when_model_version_changes():
    baseline = build_step_cache_key(
        step_name="TempoAnalysis",
        step_version="0.1.0",
        inputs={"audio_path": "song.wav"},
        config={},
        model_versions={"tempo_model": "1.0.0"},
    )
    changed = build_step_cache_key(
        step_name="TempoAnalysis",
        step_version="0.1.0",
        inputs={"audio_path": "song.wav"},
        config={},
        model_versions={"tempo_model": "1.1.0"},
    )

    assert baseline != changed
