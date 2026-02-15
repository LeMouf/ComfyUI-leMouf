"""Built-in deterministic song2daw pipeline step handlers."""

from song2daw.core.steps.event import make_event_extraction_handler, run_event_extraction_step
from song2daw.core.steps.effect import make_effect_estimation_handler, run_effect_estimation_step
from song2daw.core.steps.ingest import make_ingest_handler, run_ingest_step
from song2daw.core.steps.projection import make_projection_reaper_handler, run_projection_reaper_step
from song2daw.core.steps.source import make_source_separation_handler, run_source_separation_step
from song2daw.core.steps.structure import make_structure_handler, run_structure_segmentation_step
from song2daw.core.steps.tempo import make_tempo_handler, run_tempo_analysis_step

__all__ = [
    "make_event_extraction_handler",
    "make_effect_estimation_handler",
    "make_ingest_handler",
    "make_projection_reaper_handler",
    "make_source_separation_handler",
    "run_effect_estimation_step",
    "run_ingest_step",
    "run_event_extraction_step",
    "run_projection_reaper_step",
    "run_source_separation_step",
    "make_structure_handler",
    "run_structure_segmentation_step",
    "make_tempo_handler",
    "run_tempo_analysis_step",
]
