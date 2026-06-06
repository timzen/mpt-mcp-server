#!/usr/bin/env bash
# codex-runner.sh — Codex task runner wrapper.
#
# Persistent poll-execute-report loop for OpenAI Codex CLI:
# 1. Polls daemon for next task
# 2. Writes task prompt + AGENTS.md context to work directory
# 3. Launches `codex --auto-edit` (fire-and-forget, no mid-task communication)
# 4. Reads output
# 5. Reports completion to daemon
#
# Environment variables:
#   MPT_DAEMON_URL    - Daemon HTTP endpoint (default: http://localhost:3100)
#   MPT_AGENT_ID      - This agent's identifier (default: "codex-agent-1")
#   MPT_POLL_INTERVAL - Seconds between polls when idle (default: 5)
#   MPT_WORK_DIR      - Working directory for codex sessions (default: cwd)
#   MPT_AGENTS_MD     - Path to AGENTS.md for context (default: ./AGENTS.md)
#   MPT_CODEX_BIN     - Path to codex binary (default: codex)
#   MPT_LOG_LEVEL     - Log level: debug, info, warn, error (default: info)

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

DAEMON_URL="${MPT_DAEMON_URL:-http://localhost:3100}"
AGENT_ID="${MPT_AGENT_ID:-codex-agent-1}"
POLL_INTERVAL="${MPT_POLL_INTERVAL:-5}"
WORK_DIR="${MPT_WORK_DIR:-$(pwd)}"
AGENTS_MD="${MPT_AGENTS_MD:-./AGENTS.md}"
CODEX_BIN="${MPT_CODEX_BIN:-codex}"
LOG_LEVEL="${MPT_LOG_LEVEL:-info}"
MAX_RETRIES="${MPT_MAX_RETRIES:-3}"

# ─── Logging ─────────────────────────────────────────────────────────────────

declare -A LOG_LEVELS=([debug]=0 [info]=1 [warn]=2 [error]=3)
CURRENT_LOG_LEVEL="${LOG_LEVELS[${LOG_LEVEL}]:-1}"

log() {
  local level="$1"
  shift
  local level_num="${LOG_LEVELS[${level}]:-1}"
  if (( level_num >= CURRENT_LOG_LEVEL )); then
    echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"${level}\",\"msg\":\"$*\"}" >&2
  fi
}

# ─── Daemon Communication ────────────────────────────────────────────────────

# Poll the daemon for the next available task.
# Outputs JSON task object to stdout, or empty string if none.
poll_task() {
  local url="${DAEMON_URL}/api/tasks/next?assignee=$(urlencode "${AGENT_ID}")"
  local response
  local http_code

  # Fetch with timeout, capture body and HTTP status
  response=$(curl -s -w "\n%{http_code}" --max-time 10 "${url}" 2>/dev/null) || {
    log debug "Daemon unreachable"
    echo ""
    return
  }

  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "200" ]]; then
    # Validate it has an id field
    local task_id
    task_id=$(echo "$body" | jq -r '.id // empty' 2>/dev/null)
    if [[ -n "$task_id" ]]; then
      echo "$body"
    else
      log warn "Daemon returned 200 but no valid task"
      echo ""
    fi
  else
    log debug "No task available (HTTP ${http_code})"
    echo ""
  fi
}

# Report task completion to the daemon.
report_result() {
  local task_id="$1"
  local status="$2"
  local summary="$3"
  local output_file="$4"

  local url="${DAEMON_URL}/api/tasks/${task_id}/complete"
  local output=""
  if [[ -f "$output_file" ]]; then
    output=$(cat "$output_file" | jq -Rs '.' 2>/dev/null || cat "$output_file")
  fi

  local payload
  payload=$(jq -n \
    --arg agentId "$AGENT_ID" \
    --arg taskId "$task_id" \
    --arg status "$status" \
    --arg summary "$summary" \
    --arg output "$output" \
    --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{agentId: $agentId, taskId: $taskId, status: $status, summary: $summary, output: $output, completedAt: $completedAt}')

  local attempt=0
  while (( attempt < MAX_RETRIES )); do
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
      -X POST \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "${url}" 2>/dev/null) || true

    if [[ "$http_code" == "200" || "$http_code" == "201" || "$http_code" == "204" ]]; then
      log info "Reported completion for task ${task_id}"
      return 0
    fi

    attempt=$((attempt + 1))
    log warn "Report attempt ${attempt} failed (HTTP ${http_code:-000})"
    if (( attempt < MAX_RETRIES )); then
      sleep $((attempt * 2))
    fi
  done

  log error "Failed to report result for task ${task_id} after ${MAX_RETRIES} retries"
  return 1
}

# ─── Task Execution ──────────────────────────────────────────────────────────

# Write the task context files to the work directory.
write_task_context() {
  local task_json="$1"
  local task_dir="$2"

  local task_id title description context acceptance_criteria
  task_id=$(echo "$task_json" | jq -r '.id')
  title=$(echo "$task_json" | jq -r '.title // ""')
  description=$(echo "$task_json" | jq -r '.description // ""')
  context=$(echo "$task_json" | jq -r '.context // ""')
  acceptance_criteria=$(echo "$task_json" | jq -r '.acceptanceCriteria // ""')

  # Write AGENTS.md if available
  if [[ -f "$AGENTS_MD" ]]; then
    cp "$AGENTS_MD" "${task_dir}/AGENTS.md"
  fi

  # Build the task prompt file
  local prompt_file="${task_dir}/TASK.md"
  {
    echo "## Task: ${title}"
    echo "**Task ID: ${task_id}**"
    echo ""
    if [[ -n "$description" ]]; then
      echo "$description"
      echo ""
    fi
    if [[ -n "$context" ]]; then
      echo "### Context"
      echo "$context"
      echo ""
    fi
    if [[ -n "$acceptance_criteria" ]]; then
      echo "### Acceptance Criteria"
      echo "$acceptance_criteria"
      echo ""
    fi
    echo "---"
    echo "Complete this task. Work in this directory. Output a summary of what you accomplished when done."
  } > "$prompt_file"

  echo "$prompt_file"
}

# Execute the task using codex CLI.
execute_task() {
  local task_json="$1"
  local task_id
  task_id=$(echo "$task_json" | jq -r '.id')

  # Create temp work directory for this task
  local task_dir
  task_dir=$(mktemp -d "${WORK_DIR}/mpt-codex-${task_id}-XXXXXX")

  log info "Task dir: ${task_dir}"

  # Write context files
  local prompt_file
  prompt_file=$(write_task_context "$task_json" "$task_dir")

  # Read the prompt content
  local prompt
  prompt=$(cat "$prompt_file")

  # Output file for capturing codex response
  local output_file="${task_dir}/output.txt"

  log info "Launching codex for task ${task_id}"

  # Run codex in auto-edit mode (fire-and-forget, no interaction)
  local exit_code=0
  ${CODEX_BIN} --auto-edit \
    --quiet \
    "${prompt}" \
    > "$output_file" 2>&1 || exit_code=$?

  if (( exit_code == 0 )); then
    log info "Codex completed task ${task_id} successfully"
    echo "success|${output_file}|${task_dir}"
  else
    log warn "Codex exited with code ${exit_code} for task ${task_id}"
    echo "error|${output_file}|${task_dir}"
  fi
}

# Extract a summary from codex output.
extract_summary() {
  local output_file="$1"
  if [[ ! -f "$output_file" ]]; then
    echo "No output captured"
    return
  fi

  # Try to find a summary section
  local summary
  summary=$(grep -A 20 -i "^##\? *Summary" "$output_file" 2>/dev/null | head -20 | tail -19)
  if [[ -n "$summary" ]]; then
    echo "$summary" | head -c 1000
    return
  fi

  # Otherwise take the last 10 lines
  tail -10 "$output_file" | head -c 1000
}

# ─── Utilities ───────────────────────────────────────────────────────────────

urlencode() {
  local string="$1"
  python3 -c "import urllib.parse; print(urllib.parse.quote('$string'))" 2>/dev/null || echo "$string"
}

# Clean up temp task directory
cleanup_task_dir() {
  local task_dir="$1"
  if [[ -d "$task_dir" && "$task_dir" == *"mpt-codex-"* ]]; then
    rm -rf "$task_dir"
    log debug "Cleaned up ${task_dir}"
  fi
}

# ─── Main Loop ───────────────────────────────────────────────────────────────

RUNNING=true

shutdown() {
  log info "Received shutdown signal, stopping..."
  RUNNING=false
}

trap shutdown SIGINT SIGTERM

main() {
  log info "Codex runner started — agent=\"${AGENT_ID}\" daemon=\"${DAEMON_URL}\""
  log info "Poll interval: ${POLL_INTERVAL}s | Work dir: ${WORK_DIR}"

  # Verify dependencies
  if ! command -v jq &>/dev/null; then
    log error "jq is required but not found in PATH"
    exit 1
  fi
  if ! command -v curl &>/dev/null; then
    log error "curl is required but not found in PATH"
    exit 1
  fi
  if ! command -v "${CODEX_BIN}" &>/dev/null; then
    log warn "codex binary '${CODEX_BIN}' not found — will fail on execution"
  fi

  while $RUNNING; do
    # 1. Poll for next task
    local task_json
    task_json=$(poll_task)

    if [[ -z "$task_json" ]]; then
      sleep "$POLL_INTERVAL"
      continue
    fi

    local task_id
    task_id=$(echo "$task_json" | jq -r '.id')
    local task_title
    task_title=$(echo "$task_json" | jq -r '.title // "untitled"')
    log info "Got task: ${task_id} — \"${task_title}\""

    # 2. Execute the task
    local result
    result=$(execute_task "$task_json")

    local status output_file task_dir
    status=$(echo "$result" | cut -d'|' -f1)
    output_file=$(echo "$result" | cut -d'|' -f2)
    task_dir=$(echo "$result" | cut -d'|' -f3)

    # 3. Extract summary and report
    local summary
    summary=$(extract_summary "$output_file")

    report_result "$task_id" "$status" "$summary" "$output_file"

    log info "Task ${task_id} completed — status: ${status}"

    # 4. Clean up
    cleanup_task_dir "$task_dir"
  done

  log info "Codex runner stopped."
}

main
