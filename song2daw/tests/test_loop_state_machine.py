import nodes


def _entry(cycle_index, retry_index, status="returned", decision=None):
    return nodes.LoopManifestEntry(
        cycle_index=cycle_index,
        retry_index=retry_index,
        status=status,
        decision=decision,
        outputs={},
    )


def test_loop_decision_keeps_single_approved_per_cycle():
    state = nodes.LoopState(
        loop_id="loop-single-approve",
        total_cycles=3,
        manifest=[
            _entry(0, 0, status="returned", decision="approve"),
            _entry(0, 1, status="returned", decision="replay"),
            _entry(1, 0, status="returned", decision=None),
        ],
    )

    progression = nodes._apply_loop_decision_state(state, 0, 1, "approve")

    assert progression is not None
    cycle0 = [entry for entry in state.manifest if entry.cycle_index == 0]
    approved = [entry for entry in cycle0 if str(entry.decision) == "approve"]
    discarded = [entry for entry in cycle0 if str(entry.decision) == "discard"]
    assert len(approved) == 1
    assert approved[0].retry_index == 1
    assert len(discarded) == 1
    assert discarded[0].retry_index == 0
    assert progression["next_cycle_index"] == 1
    assert progression["needs_generation"] is False
    assert state.current_cycle == 1


def test_loop_decision_does_not_request_generation_if_next_cycle_has_candidate():
    state = nodes.LoopState(
        loop_id="loop-next-has-candidate",
        total_cycles=2,
        manifest=[
            _entry(0, 0, status="returned", decision="approve"),
            _entry(1, 0, status="returned", decision=None),
        ],
    )

    progression = nodes._apply_loop_decision_state(state, 0, 0, "approve")

    assert progression is not None
    assert progression["next_cycle_index"] == 1
    assert progression["next_retry_index"] == 0
    assert progression["needs_generation"] is False
    assert state.status == "idle"


def test_loop_decision_requests_generation_for_next_incomplete_cycle_when_needed():
    state = nodes.LoopState(
        loop_id="loop-needs-generation",
        total_cycles=2,
        manifest=[
            _entry(0, 0, status="returned", decision="approve"),
            _entry(1, 0, status="returned", decision="reject"),
        ],
    )

    progression = nodes._apply_loop_decision_state(state, 0, 0, "approve")

    assert progression is not None
    assert progression["next_cycle_index"] == 1
    assert progression["next_retry_index"] == 1
    assert progression["needs_generation"] is True
    assert state.current_cycle == 1
    assert state.current_retry == 1


def test_loop_decision_marks_complete_when_all_cycles_approved():
    state = nodes.LoopState(
        loop_id="loop-complete",
        total_cycles=2,
        manifest=[
            _entry(0, 0, status="returned", decision="approve"),
            _entry(1, 0, status="returned", decision="approve"),
        ],
    )

    progression = nodes._apply_loop_decision_state(state, 1, 0, "approve")

    assert progression is not None
    assert progression["next_cycle_index"] is None
    assert progression["next_retry_index"] is None
    assert progression["needs_generation"] is False
    assert state.current_cycle == 2
    assert state.current_retry == 0
    assert state.status == "complete"


def test_loop_decision_reports_running_when_queue_exists_for_next_cycle():
    state = nodes.LoopState(
        loop_id="loop-running",
        total_cycles=3,
        manifest=[
            _entry(0, 0, status="returned", decision="approve"),
            _entry(1, 2, status="queued", decision=None),
        ],
    )

    progression = nodes._apply_loop_decision_state(state, 0, 0, "approve")

    assert progression is not None
    assert progression["next_cycle_index"] == 1
    assert progression["next_retry_index"] == 2
    assert progression["needs_generation"] is False
    assert progression["status"] == "running"
    assert state.status == "running"


def test_loop_decision_reject_handles_duplicate_entries_same_retry():
    duplicated = _entry(0, 0, status="returned", decision=None)
    duplicated.updated_at = duplicated.updated_at + 0.5
    state = nodes.LoopState(
        loop_id="loop-dup-reject",
        total_cycles=2,
        manifest=[
            _entry(0, 0, status="returned", decision=None),
            duplicated,
        ],
    )

    progression = nodes._apply_loop_decision_state(state, 0, 0, "reject")

    assert progression is not None
    assert all(str(entry.decision) == "reject" for entry in state.manifest if entry.cycle_index == 0)
    assert progression["next_cycle_index"] == 0
    assert progression["next_retry_index"] == 1
    assert progression["needs_generation"] is True


def test_sync_runtime_from_manifest_sets_idle_when_no_pending_entries():
    state = nodes.LoopState(
        loop_id="loop-sync-idle",
        total_cycles=2,
        status="running",
        current_cycle=1,
        current_retry=0,
        manifest=[
            _entry(0, 0, status="returned", decision="approve"),
            _entry(1, 0, status="returned", decision=None),
        ],
    )

    progression = nodes._sync_loop_runtime_from_manifest(state)

    assert progression["status"] == "idle"
    assert state.status == "idle"
    assert state.current_cycle == 1
    assert state.current_retry == 0


def test_sync_runtime_from_manifest_keeps_running_when_pending_entries_exist():
    state = nodes.LoopState(
        loop_id="loop-sync-running",
        total_cycles=2,
        status="running",
        current_cycle=1,
        current_retry=1,
        manifest=[
            _entry(0, 0, status="returned", decision="approve"),
            _entry(1, 1, status="queued", decision=None),
        ],
    )

    progression = nodes._sync_loop_runtime_from_manifest(state)

    assert progression["status"] == "running"
    assert state.status == "running"
    assert state.current_cycle == 1
    assert state.current_retry == 1
