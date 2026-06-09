/**
 * daemon-client.mjs — HTTP client for the my-pizza-team daemon API.
 *
 * Provides all the API calls needed for the multi-transition teammate
 * workflow: register, heartbeat, poll for work, claim, transition,
 * release, comments, and attachments.
 *
 * This is the generic (non-Pi) equivalent of pi-pizza-team's client.ts.
 * Used by MCP tools and runners to communicate with the daemon.
 */

import { hostname } from 'node:os';

/**
 * Create a daemon client instance.
 * @param {object} options
 * @param {string} options.daemonUrl - Daemon base URL (e.g., http://localhost:7437)
 * @param {string} options.agentId   - Unique agent identifier
 * @param {string} [options.hostId]  - Host identifier (defaults to os.hostname())
 */
export function createDaemonClient({ daemonUrl, agentId, hostId }) {
  const baseUrl = daemonUrl.replace(/\/$/, '');
  const resolvedHostId = hostId || hostname();

  // ─── Internal Helpers ────────────────────────────────────────────

  async function request(path, options = {}) {
    const headers = { ...options.headers };
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body.error) errorMsg = body.error;
      } catch {
        errorMsg = res.statusText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    return res.json();
  }

  function post(path, body) {
    return request(path, { method: 'POST', body: JSON.stringify(body) });
  }

  function get(path) {
    return request(path);
  }

  function del(path) {
    return request(path, { method: 'DELETE' });
  }

  // ─── Public API ──────────────────────────────────────────────────

  return {
    /** The daemon's base URL */
    get url() { return baseUrl; },

    /** The agent's identifier */
    get id() { return agentId; },

    /** The host identifier */
    get hostId() { return resolvedHostId; },

    // ═══ Health ═══════════════════════════════════════════════════════

    /**
     * Check if the daemon is reachable.
     * @returns {Promise<boolean>}
     */
    async checkHealth() {
      try {
        const res = await fetch(`${baseUrl}/health`);
        return res.ok;
      } catch {
        return false;
      }
    },

    /**
     * Get daemon status summary.
     */
    async getStatus() {
      return get('/api/status');
    },

    // ═══ Agent Protocol ═══════════════════════════════════════════════

    /**
     * Register this agent with the daemon.
     * @param {object} opts
     * @param {string} opts.name - Agent display name
     * @param {string} opts.cwd  - Working directory
     */
    async register({ name, cwd }) {
      return post('/api/agents/register', {
        id: agentId,
        name,
        cwd,
        hostId: resolvedHostId,
        capabilities: ['http', 'tools', 'messages'],
      });
    },

    /**
     * Deregister this agent (clean shutdown).
     */
    async deregister() {
      return del(`/api/agents/${encodeURIComponent(agentId)}`);
    },

    /**
     * Signal the daemon to dismiss an agent (it will stop on next heartbeat).
     * @param {string} targetAgentId - The agent ID to dismiss
     */
    async dismissAgent(targetAgentId) {
      return post(`/api/agents/${encodeURIComponent(targetAgentId)}/dismiss`, {});
    },

    /**
     * Send heartbeat. Never throws.
     * @param {'idle'|'working'|'pairing'} status
     * @param {string} [currentTask]
     * @returns {Promise<{dismissed?: boolean}>}
     */
    async heartbeat(status, currentTask) {
      try {
        return await post('/api/agents/heartbeat', {
          id: agentId,
          status,
          currentTask,
        });
      } catch {
        return {};
      }
    },

    /**
     * Poll for next available work (unclaimed task with teammate transitions).
     * @returns {Promise<{task: object|null}>}
     */
    async getNextWork() {
      return get(`/api/agents/next-work?agentId=${encodeURIComponent(agentId)}`);
    },

    /**
     * Claim ownership of a task (no state change).
     * @param {string} taskId
     * @returns {Promise<{success: boolean, availableTransitions?: Array}>}
     */
    async claimTask(taskId) {
      return post(`/api/agents/claim/${encodeURIComponent(taskId)}`, { agentId });
    },

    /**
     * Transition a claimed task to the next state.
     * @param {string} taskId
     * @param {string} targetState
     * @param {string} [result] - Summary of work done
     * @returns {Promise<{success: boolean, released?: boolean, instructions?: string, availableTransitions?: Array}>}
     */
    async transitionTask(taskId, targetState, result) {
      return post(`/api/agents/transition/${encodeURIComponent(taskId)}`, {
        agentId,
        status: targetState,
        result,
      });
    },

    /**
     * Release a task (when blocked by lead-only transitions).
     * @param {string} taskId
     */
    async releaseTask(taskId) {
      return post(`/api/agents/release/${encodeURIComponent(taskId)}`, { agentId });
    },

    // ═══ Comments ═════════════════════════════════════════════════════

    /**
     * Get comments for a task.
     * @param {string} taskId
     * @returns {Promise<{comments: Array}>}
     */
    async getComments(taskId) {
      return get(`/api/agents/comments/${encodeURIComponent(taskId)}`);
    },

    /**
     * Post a comment on a task.
     * @param {string} taskId
     * @param {string} body
     * @param {Array<{name: string, size?: number, type?: string}>} [attachments]
     */
    async postComment(taskId, body, attachments) {
      const payload = { agentId, body };
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }
      return post(`/api/agents/comments/${encodeURIComponent(taskId)}`, payload);
    },

    // ═══ Attachments ══════════════════════════════════════════════════

    /**
     * Upload a file attachment to a task.
     * @param {string} taskId
     * @param {string} filename
     * @param {string} content
     */
    async uploadAttachment(taskId, filename, content) {
      return post(`/api/tasks/${encodeURIComponent(taskId)}/attachments`, {
        name: filename,
        content,
        encoding: 'utf-8',
      });
    },

    // ═══ Spawn Requests (leader) ══════════════════════════════════════

    /**
     * Poll for pending spawn requests targeted at this host.
     */
    async getSpawnRequests() {
      return get(`/api/spawn-requests?hostId=${encodeURIComponent(resolvedHostId)}`);
    },

    /**
     * Acknowledge a spawn request has been executed.
     * @param {string} requestId
     */
    async ackSpawnRequest(requestId) {
      return post(`/api/spawn-requests/${encodeURIComponent(requestId)}/ack`, {});
    },

    /**
     * Create a spawn request. The daemon generates a unique name.
     * @param {{ cwd?: string, storyId?: string, reason?: string }} opts
     * @returns {Promise<{ id: string, name: string, hostId: string, status: string, createdAt: string }>}
     */
    async createSpawnRequest(opts = {}) {
      return post('/api/spawn-requests', {
        hostId: resolvedHostId,
        cwd: opts.cwd,
        storyId: opts.storyId,
        reason: opts.reason,
      });
    },

    // ═══ Token Usage ═══════════════════════════════════════════════════

    /**
     * Report token usage for a task.
     * @param {string} taskId
     * @param {{inputTokens: number, outputTokens: number, model?: string}} usage
     */
    async reportTokenUsage(taskId, usage) {
      return post(`/api/tasks/${encodeURIComponent(taskId)}/token-usage`, {
        agentId,
        ...usage,
      });
    },

    // ═══ Stories & Tasks (leader) ══════════════════════════════════════

    /**
     * Create a new story.
     * @param {object} story - Story data (id, title, description, dependsOn, dir, workflow)
     */
    async createStory(story) {
      return post('/api/stories', story);
    },

    /**
     * Update an existing story.
     * @param {string} storyId
     * @param {object} updates - Fields to update (title, description, status, dependsOn, dir, workflow)
     */
    async updateStory(storyId, updates) {
      return request(`/api/stories/${encodeURIComponent(storyId)}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Create a task within a story.
     * @param {string} storyId
     * @param {string} title
     * @param {string} description
     */
    async createTask(storyId, title, description) {
      return post(`/api/stories/${encodeURIComponent(storyId)}/tasks`, { title, description });
    },

    // ═══ Assistant Queue ═══════════════════════════════════════════════

    /**
     * Queue a request for the assistant to process asynchronously.
     * @param {string} prompt
     */
    async enqueueAssistantRequest(prompt) {
      return post('/api/assistant/queue', { prompt });
    },

    // ═══ Memory Notes ═════════════════════════════════════════════════

    /**
     * Save a memory note.
     * @param {string} title
     * @param {string} content
     * @param {string[]} categories
     */
    async saveNote(title, content, categories) {
      return post('/api/assistant/notes', { title, content, categories });
    },

    /**
     * Search memory notes by keyword.
     * @param {string} query
     * @param {string} [category]
     * @param {number} [limit]
     */
    async searchNotes(query, category, limit) {
      const params = new URLSearchParams({ q: query });
      if (category) params.set('category', category);
      if (limit) params.set('limit', String(limit));
      return get(`/api/assistant/notes/search?${params}`);
    },
  };
}
