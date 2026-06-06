/**
 * store.mjs — In-memory data store for the MCP server.
 *
 * Provides persistence abstractions for memory entries, attachments,
 * messages, and tasks. Currently in-memory; can be backed by a file
 * or database later.
 */

/**
 * Creates a new store instance with in-memory collections.
 */
export function createStore() {
  /** @type {Array<{id: string, content: string, category: string, tags: string[], createdAt: string}>} */
  const memories = [];

  /** @type {Array<{id: string, filename: string, content: string, taskId: string|null, message: string|null, createdAt: string}>} */
  const attachments = [];

  /** @type {Array<{id: string, from: string, to: string, content: string, createdAt: string}>} */
  const messages = [];

  /** @type {Array<{id: string, title: string, description: string, status: string, assignee: string|null, createdAt: string}>} */
  const tasks = [];

  /** @type {Array<{taskId: string, summary: string, completedAt: string}>} */
  const completions = [];

  return {
    // Memory
    addMemory(entry) {
      const record = {
        id: crypto.randomUUID(),
        content: entry.content,
        category: entry.category || 'general',
        tags: entry.tags || [],
        createdAt: new Date().toISOString(),
      };
      memories.push(record);
      return record;
    },

    searchMemory(query, category = null, limit = 5) {
      const lowerQuery = query.toLowerCase();
      let results = memories.filter((m) => {
        const matchesQuery =
          m.content.toLowerCase().includes(lowerQuery) ||
          m.tags.some((t) => t.toLowerCase().includes(lowerQuery));
        const matchesCategory = category ? m.category === category : true;
        return matchesQuery && matchesCategory;
      });
      return results.slice(0, limit);
    },

    // Attachments
    addAttachment(entry) {
      const record = {
        id: crypto.randomUUID(),
        filename: entry.filename,
        content: entry.content,
        taskId: entry.taskId || null,
        message: entry.message || null,
        createdAt: new Date().toISOString(),
      };
      attachments.push(record);
      return record;
    },

    // Messages
    addMessage(entry) {
      const record = {
        id: crypto.randomUUID(),
        from: entry.from,
        to: entry.to,
        content: entry.content,
        createdAt: new Date().toISOString(),
      };
      messages.push(record);
      return record;
    },

    getMessages(participant = null) {
      if (!participant) return [...messages];
      return messages.filter(
        (m) => m.from === participant || m.to === participant
      );
    },

    // Tasks
    addTask(entry) {
      const record = {
        id: crypto.randomUUID(),
        title: entry.title,
        description: entry.description || '',
        status: 'pending',
        assignee: entry.assignee || null,
        createdAt: new Date().toISOString(),
      };
      tasks.push(record);
      return record;
    },

    getNextTask(assignee = null) {
      const pending = tasks.filter((t) => {
        const isPending = t.status === 'pending';
        const matchesAssignee = assignee ? t.assignee === assignee : true;
        return isPending && matchesAssignee;
      });
      return pending[0] || null;
    },

    // Completions
    reportComplete(taskId, summary) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = 'complete';
      }
      const record = {
        taskId,
        summary,
        completedAt: new Date().toISOString(),
      };
      completions.push(record);
      return record;
    },

    // Expose raw collections for testing
    _memories: memories,
    _attachments: attachments,
    _messages: messages,
    _tasks: tasks,
    _completions: completions,
  };
}
