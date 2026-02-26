export const RULER_HEIGHT = 30;
export const DEFAULT_SECTION_HEIGHT = 72;
export const MIN_SECTION_HEIGHT = 56;
export const MAX_SECTION_HEIGHT = 300;
export const SECTION_RESIZE_HANDLE_HEIGHT = 10;
export const SECTION_HEIGHT_STORAGE_KEY = "lemoufStudioSectionHeight";
export const ROW_HEIGHT = 44;
export const VIDEO_ROW_HEIGHT = 64;
export const LEFT_GUTTER = 138;
export const TRACK_GROUP_GAP = 14;
export const MIN_PX_PER_SEC_HARD = 0.5;
export const MIN_SONG_WIDTH_RATIO = 0.1;
export const MAX_PX_PER_SEC = 11000;
export const SCRUB_MIN_RATE = 0.2;
export const SCRUB_MAX_RATE = 4.8;
export const SCRUB_BASE_GRAIN_SEC = 0.085;
export const SCRUB_MIN_GRAIN_SEC = 0.028;
export const SCRUB_MIN_INTERVAL_SEC = 0.016;
export const SCRUB_FADE_SEC = 0.008;
export const SCRUB_GAIN = 0.8;
export const SECTION_WAVE_ALPHA = 0.78;
export const SECTION_WAVE_DETAIL = 32;
export const SECTION_VIZ_STORAGE_KEY = "lemoufStudioSectionVizMode";
export const SKELETON_MODE_STORAGE_KEY = "lemoufStudioTimelineSkeletonMode";
export const TIMELINE_SNAP_STORAGE_KEY = "lemoufStudioTimelineSnapEnabled";
export const TRACK_ROW_SCALE_STORAGE_KEY = "lemoufStudioTrackRowScale";
export const SECTION_VIZ_MODES = ["bands", "filled", "peaks", "line", "dots"];
export const RULER_TARGET_PX = 92;
export const RULER_STEP_OPTIONS_SEC = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
export const MIDI_MASTER_GAIN = 0.5;
export const CLIP_EDIT_MIN_DURATION_SEC = 0.1;
export const CLIP_EDIT_SNAP_PX = 10;
export const CLIP_EDIT_TIME_EPS_SEC = 1e-6;
export const CLIP_WINDOW_BAR_HEIGHT = 5;
export const CLIP_WINDOW_BAR_BOTTOM_MARGIN = 3;
export const TIMELINE_EDIT_MAX_DURATION_SEC = 21_600;
export const VIDEO_FILMSTRIP_MIN_FRAMES = 3;
export const VIDEO_FILMSTRIP_MAX_FRAMES = 10;
export const VIDEO_FILMSTRIP_TARGET_WIDTH = 128;
export const VIDEO_FILMSTRIP_TARGET_HEIGHT = 72;
export const VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT = 48;
export const VIDEO_FILMSTRIP_TILE_GAP = 3;
export const VIDEO_FILMSTRIP_MAX_CONCURRENCY = 2;
export const VIDEO_PREVIEW_MODE_STORAGE_KEY = "lemoufStudioVideoPreviewMode";
export const VIDEO_PREVIEW_MODES = ["auto", "light", "full"];
export const VIDEO_PREVIEW_QUALITY_HINTS = ["auto", "low", "medium", "high"];
export const VIDEO_FILMSTRIP_FRAME_BUCKETS = [2, 3, 4, 5, 6, 8, 10, 12];
export const TRACK_ROW_SCALE_MIN = 0.6;
export const TRACK_ROW_SCALE_MAX = 2.8;
export const SCISSORS_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ctext x='2' y='18' font-size='18'%3E%E2%9C%82%3C/text%3E%3C/svg%3E\") 4 16, crosshair";
export const JOIN_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ctext x='2' y='18' font-size='17'%3E%E2%87%94%3C/text%3E%3C/svg%3E\") 5 12, pointer";
export const CLIP_JOIN_TIME_EPS_SEC = 0.035;
export const TRACK_AUDIO_EVENT_EDGE_EPS_SEC = 1 / 90;
export const TRACK_AUDIO_BOUNDARY_RECOVERY_EPS_SEC = 1 / 45;
export const TRACK_AUDIO_SWITCH_HYSTERESIS_SEC = 0.022;
export const TRACK_AUDIO_RUNNING_DRIFT_SEC = 0.24;
export const TRACK_AUDIO_GAIN_RAMP_SEC = 0.018;
export const TRACK_AUDIO_SWITCH_CROSSFADE_SEC = 0.032;
export const TRACK_AUDIO_BOUNDARY_FADE_SEC = 0.012;
export const TRACK_AUDIO_SEEK_FADE_OUT_SEC = 0.005;
export const TRACK_AUDIO_SEEK_FADE_IN_SEC = 0.012;
export const TRACK_AUDIO_CLOCK_REBASE_DRIFT_SEC = 0.045;
export const TRACK_AUDIO_REBASE_STARTUP_GRACE_MS = 220;
export const TRACK_AUDIO_REBASE_SEEK_GRACE_MS = 140;
export const TRANSPORT_CLOCK_REBASE_DRIFT_SEC = 0.06;
export const FILMSTRIP_RENDER_CACHE_MAX = 420;
export const AUDIO_VIZ_DEFAULT_PALETTE = {
  strokeStyle: "rgba(62, 46, 32, 0.82)",
  fillStyle: "rgba(97, 73, 53, 0.34)",
  bandLowStyle: "rgba(94, 171, 132, 0.72)",
  bandMidStyle: "rgba(219, 174, 90, 0.76)",
  bandHighStyle: "rgba(198, 104, 147, 0.76)",
  centerLineStyle: "rgba(120, 100, 82, 0.16)",
};
