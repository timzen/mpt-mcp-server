/**
 * mock-daemon.mjs — Lightweight mock daemon for integration tests.
 *
 * Implements the minimal daemon REST API contract:
 *   GET  /api/tasks/next?assignee=X  — Return next pending task for assignee
 *   POST /api/tasks/:id/complete     — Mark task complete with result
 *   POST /api/stories                — Create a story with tasks
 *   GET  /api/tasks                  — List all tasks
 *   GET  /api/completions            — List all completions
 *   POST /api/messages               — Send a message
 *   GET  /api/messages               — List messages
 *
 * Uses Node's built-in http module — no dependencies.
 */

import { createServer } from 'node:http';

/**
 * Create and start a mock daemon server.
 * @param {number} [port=0] — Port to listen on (0 = random available)
 * @returns {Promise<MockDaemon>}
 */
export async function startMockDaemon(port = 0) {
  const state = {
    tasks: [],
    completions: [],
    messages: [],
    stories: [],
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);
    const method = req.method;

    // Collect body for POST requests
    if (method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          handleRequest(method, url, data, res, state);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    } else {
      handleRequest(method, url, null, res, state);
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const addr = server.address();

  return {
    url: `http://127.0.0.1:${addr.port}`,
    port: addr.port,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function handleRequest(method, url, body, res, state) {
  const path = url.pathname;

  // GET /api/tasks/next?assignee=X
  if (method === 'GET' && path === '/api/tasks/next') {
    const assignee = url.searchParams.get('assignee');
    const task = state.tasks.find((t) => {
      const isPending = t.status === 'pending';
      const matchesAssignee = assignee ? t.assignee === assignee : true;
      return isPending && matchesAssignee;
    });

    if (task) {
      // Mark as in-progress to prevent double-dispatch
      task.status = 'in-progress';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(task));
    } else {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  // POST /api/tasks/:id/complete
  const completeMatch = path.match(/^\/api\/tasks\/([^/]+)\/complete$/);
  if (method === 'POST' && completeMatch) {
    const taskId = completeMatch[1];
    const task = state.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = 'complete';
    }
    const completion = {
      ...body,
      taskId,
      completedAt: body.completedAt || new Date().toISOString(),
    };
    state.completions.push(completion);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(completion));
    return;
  }

  // POST /api/stories — Create a story with tasks
  if (method === 'POST' && path === '/api/stories') {
    const story = {
      id: `story-${crypto.randomUUID().slice(0, 8)}`,
      title: body.title,
      tasks: [],
      createdAt: new Date().toISOString(),
    };

    if (body.tasks && Array.isArray(body.tasks)) {
      for (const taskDef of body.tasks) {
        const task = {
          id: `task-${crypto.randomUUID().slice(0, 8)}`,
          storyId: story.id,
          title: taskDef.title,
          description: taskDef.description || '',
          context: taskDef.context || '',
          acceptanceCriteria: taskDef.acceptanceCriteria || '',
          assignee: taskDef.assignee || null,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        state.tasks.push(task);
        story.tasks.push(task);
      }
    }

    state.stories.push(story);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(story));
    return;
  }

  // GET /api/tasks
  if (method === 'GET' && path === '/api/tasks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state.tasks));
    return;
  }

  // GET /api/completions
  if (method === 'GET' && path === '/api/completions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state.completions));
    return;
  }

  // POST /api/messages
  if (method === 'POST' && path === '/api/messages') {
    const msg = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      ...body,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(msg);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(msg));
    return;
  }

  // GET /api/messages
  if (method === 'GET' && path === '/api/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state.messages));
    return;
  }

  // 404 fallback
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found', path }));
}

/**
 * @typedef {object} MockDaemon
 * @property {string} url - Base URL (e.g. http://127.0.0.1:PORT)
 * @property {number} port
 * @property {object} state - Direct access to daemon state for assertions
 * @property {() => Promise<void>} close
 */
