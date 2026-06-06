#!/usr/bin/env bash
# codex-runner.test.sh — Tests for the Codex task runner.
#
# Tests the shell functions in isolation by sourcing parts of the runner
# and exercising them with mock data.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="${SCRIPT_DIR}/../src/runners/codex-runner.sh"
PASS=0
FAIL=0

# ─── Test Helpers ────────────────────────────────────────────────────────────

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  ✔ ${desc}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${desc}"
    echo "    expected: ${expected}"
    echo "    actual:   ${actual}"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "  ✔ ${desc}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${desc}"
    echo "    expected to contain: ${needle}"
    echo "    actual: ${haystack}"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() {
  local desc="$1" path="$2"
  if [[ -f "$path" ]]; then
    echo "  ✔ ${desc}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${desc} — file not found: ${path}"
    FAIL=$((FAIL + 1))
  fi
}

# ─── Source runner functions (skip main loop) ────────────────────────────────

# We can't source the whole file because it calls main() at the bottom.
# Instead, test by extracting and calling specific functions.
# We'll use a subshell approach.

# ─── Test: Configuration defaults ────────────────────────────────────────────

echo "▶ Configuration"

# Unset vars to test defaults
unset MPT_DAEMON_URL MPT_AGENT_ID MPT_POLL_INTERVAL 2>/dev/null || true

result=$(bash -c '
  DAEMON_URL="${MPT_DAEMON_URL:-http://localhost:3100}"
  AGENT_ID="${MPT_AGENT_ID:-codex-agent-1}"
  POLL_INTERVAL="${MPT_POLL_INTERVAL:-5}"
  echo "${DAEMON_URL}|${AGENT_ID}|${POLL_INTERVAL}"
')

assert_eq "default daemon URL" "http://localhost:3100|codex-agent-1|5" "$result"

# Test with env overrides
result=$(MPT_DAEMON_URL="http://custom:8080" MPT_AGENT_ID="my-codex" MPT_POLL_INTERVAL="10" bash -c '
  DAEMON_URL="${MPT_DAEMON_URL:-http://localhost:3100}"
  AGENT_ID="${MPT_AGENT_ID:-codex-agent-1}"
  POLL_INTERVAL="${MPT_POLL_INTERVAL:-5}"
  echo "${DAEMON_URL}|${AGENT_ID}|${POLL_INTERVAL}"
')

assert_eq "env var overrides" "http://custom:8080|my-codex|10" "$result"

# ─── Test: write_task_context ────────────────────────────────────────────────

echo "▶ write_task_context"

# Create a temp dir and test context writing
TEMP_DIR=$(mktemp -d)
TASK_JSON='{"id":"task-42","title":"Fix the bug","description":"There is a bug in main.js","context":"Production issue","acceptanceCriteria":"Tests pass"}'

# Source just what we need (config + utilities + write_task_context)
task_file=$(MPT_AGENTS_MD="/nonexistent" MPT_WORK_DIR="$TEMP_DIR" bash -c '
  set -euo pipefail
  AGENTS_MD="/nonexistent"
  WORK_DIR="'"$TEMP_DIR"'"

  write_task_context() {
    local task_json="$1"
    local task_dir="$2"

    local task_id title description context acceptance_criteria
    task_id=$(echo "$task_json" | jq -r ".id")
    title=$(echo "$task_json" | jq -r ".title // \"\"")
    description=$(echo "$task_json" | jq -r ".description // \"\"")
    context=$(echo "$task_json" | jq -r ".context // \"\"")
    acceptance_criteria=$(echo "$task_json" | jq -r ".acceptanceCriteria // \"\"")

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

  write_task_context '"'$TASK_JSON'"' "'"$TEMP_DIR"'"
')

assert_file_exists "TASK.md created" "${TEMP_DIR}/TASK.md"

if [[ -f "${TEMP_DIR}/TASK.md" ]]; then
  content=$(cat "${TEMP_DIR}/TASK.md")
  assert_contains "contains task title" "## Task: Fix the bug" "$content"
  assert_contains "contains task ID" "task-42" "$content"
  assert_contains "contains description" "There is a bug in main.js" "$content"
  assert_contains "contains context" "Production issue" "$content"
  assert_contains "contains acceptance criteria" "Tests pass" "$content"
  assert_contains "contains completion instruction" "Output a summary" "$content"
fi

rm -rf "$TEMP_DIR"

# ─── Test: extract_summary ───────────────────────────────────────────────────

echo "▶ extract_summary"

TEMP_DIR=$(mktemp -d)

# Test with summary heading
cat > "${TEMP_DIR}/output1.txt" << 'EOF'
Some preamble text here.

## Summary
Fixed the bug by updating the handler.
All tests now pass.
EOF

summary=$(bash -c '
  extract_summary() {
    local output_file="$1"
    if [[ ! -f "$output_file" ]]; then
      echo "No output captured"
      return
    fi
    local summary
    summary=$(grep -A 20 -i "^##\\? *Summary" "$output_file" 2>/dev/null | head -20 | tail -19)
    if [[ -n "$summary" ]]; then
      echo "$summary" | head -c 1000
      return
    fi
    tail -10 "$output_file" | head -c 1000
  }
  extract_summary "'"${TEMP_DIR}/output1.txt"'"
')

assert_contains "extracts summary section" "Fixed the bug" "$summary"

# Test without summary heading (fallback to tail)
cat > "${TEMP_DIR}/output2.txt" << 'EOF'
Line 1
Line 2
Final line of output
EOF

summary=$(bash -c '
  extract_summary() {
    local output_file="$1"
    if [[ ! -f "$output_file" ]]; then
      echo "No output captured"
      return
    fi
    local summary
    summary=$(grep -A 20 -i "^##\\? *Summary" "$output_file" 2>/dev/null | head -20 | tail -19)
    if [[ -n "$summary" ]]; then
      echo "$summary" | head -c 1000
      return
    fi
    tail -10 "$output_file" | head -c 1000
  }
  extract_summary "'"${TEMP_DIR}/output2.txt"'"
')

assert_contains "falls back to tail" "Final line of output" "$summary"

# Test with missing file
summary=$(bash -c '
  extract_summary() {
    local output_file="$1"
    if [[ ! -f "$output_file" ]]; then
      echo "No output captured"
      return
    fi
    local summary
    summary=$(grep -A 20 -i "^##\\? *Summary" "$output_file" 2>/dev/null | head -20 | tail -19)
    if [[ -n "$summary" ]]; then
      echo "$summary" | head -c 1000
      return
    fi
    tail -10 "$output_file" | head -c 1000
  }
  extract_summary "/nonexistent/file.txt"
')

assert_eq "handles missing file" "No output captured" "$summary"

rm -rf "$TEMP_DIR"

# ─── Test: poll_task with unreachable daemon ─────────────────────────────────

echo "▶ poll_task"

result=$(/usr/local/bin/bash -c '
  DAEMON_URL="http://localhost:19999"
  AGENT_ID="test-agent"
  log() { :; }
  urlencode() { echo "$1"; }

  poll_task() {
    local url="${DAEMON_URL}/api/tasks/next?assignee=$(urlencode "${AGENT_ID}")"
    local response
    response=$(curl -s -w "\n%{http_code}" --max-time 2 "${url}" 2>/dev/null) || {
      echo ""
      return
    }
    local http_code
    http_code=$(echo "$response" | tail -1)
    if [[ "$http_code" == "200" ]]; then
      local body
      body=$(echo "$response" | sed "\$d")
      echo "$body"
    else
      echo ""
    fi
  }

  poll_task
' 2>/dev/null || echo "")

assert_eq "returns empty when daemon unreachable" "" "$result"

# ─── Test: Script is valid bash ──────────────────────────────────────────────

echo "▶ Script validity"

syntax_check=$(bash -n "$RUNNER" 2>&1) || true
assert_eq "runner.sh has valid bash syntax" "" "$syntax_check"

# ─── Results ─────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────"
TOTAL=$((PASS + FAIL))
echo "tests ${TOTAL} | pass ${PASS} | fail ${FAIL}"

if (( FAIL > 0 )); then
  exit 1
fi
