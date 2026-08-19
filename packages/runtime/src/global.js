(function () {
  const API_BASE = '/api/workspace';

  async function request(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      const err = new Error(json.error?.message || 'Request failed');
      err.code = json.error?.code || 'INTERNAL_ERROR';
      err.details = json.error?.details;
      throw err;
    }
    return json.data;
  }

  async function safe(promise) {
    try {
      const data = await promise;
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: { code: error.code || 'UNKNOWN', message: error.message } };
    }
  }

  const broker = {
    fs: {
      readFile: (path) => request(`/fs/read?path=${encodeURIComponent(path)}`),
      safeReadFile: (path) => safe(broker.fs.readFile(path)),
      writeFile: (path, content, frontmatter) =>
        request('/fs/write', {
          method: 'POST',
          body: JSON.stringify({ path, content, frontmatter }),
        }),
      safeWriteFile: (path, content, frontmatter) =>
        safe(broker.fs.writeFile(path, content, frontmatter)),
      patchFile: (path, patch) =>
        request('/fs/patch', { method: 'POST', body: JSON.stringify({ path, patch }) }),
      safePatchFile: (path, patch) => safe(broker.fs.patchFile(path, patch)),
      listFiles: (glob = '**/*') => request(`/fs/list?glob=${encodeURIComponent(glob)}`),
      safeListFiles: (glob) => safe(broker.fs.listFiles(glob)),
    },

    debts: {
      list: (filter = {}) => {
        const params = new URLSearchParams();
        if (filter.status) params.set('status', filter.status);
        if (filter.direction) params.set('direction', filter.direction);
        if (filter.personName) params.set('personName', filter.personName);
        return request(`/debts?${params.toString()}`);
      },
      getSummary: () => request('/debts/summary'),
      settle: (id) => request(`/debts/${id}/settle`, { method: 'POST' }),
      cancel: (id) => request(`/debts/${id}/cancel`, { method: 'POST' }),
      delete: (id) => request(`/debts/${id}`, { method: 'DELETE' }),
      create: (data) => request('/debts/create', { method: 'POST', body: JSON.stringify(data) }),
    },

    daily: {
      getToday: () => request('/daily/today'),
      get: (date) => request(`/daily/${date}`),
      save: (date, report, customSections = '') =>
        request(`/daily/${date}`, {
          method: 'POST',
          body: JSON.stringify({ report, customSections }),
        }),
    },

    time: {
      getCurrentDate: async () => (await request('/time')).currentDate,
      getTimezone: async () => (await request('/time')).timezone,
    },

    events: {
      subscribe: (callback) => {
        const sse = new EventSource(`${API_BASE}/events`);
        sse.onmessage = (e) => {
          try {
            callback(JSON.parse(e.data));
          } catch {}
        };
        return () => sse.close();
      },
    },
  };

  window.workboost = broker;

  // Listen to SSE events and re-emit them as DOM Events so Alpine.js apps can react
  broker.events.subscribe((event) => {
    window.dispatchEvent(new CustomEvent('workboost:change', { detail: event }));
  });
})();
