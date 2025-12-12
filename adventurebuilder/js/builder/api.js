const BASE_URL = './api/api.php';
const AI_URL = './api/ai.php';

function handleResponse(res) {
  return res.json().then((json) => {
    if (!res.ok) {
      const message = json?.error || ('Serverfehler: ' + res.status);
      throw new Error(message);
    }
    return json;
  });
}

export const Api = {
  async listAdventures() {
    return fetch(`${BASE_URL}?action=list_adventures`).then(handleResponse);
  },
  async createAdventure(payload) {
    return fetch(`${BASE_URL}?action=create_adventure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(handleResponse);
  },
  async loadAdventure(id) {
    return fetch(`${BASE_URL}?action=load_adventure&id=${encodeURIComponent(id)}`).then(handleResponse);
  },
  async saveAdventure(id, payload) {
    return fetch(`${BASE_URL}?action=save_adventure&id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(handleResponse);
  },
  async uploadAscii(id, file) {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE_URL}?action=upload_ascii&id=${encodeURIComponent(id)}`, {
      method: 'POST',
      body: form
    }).then(handleResponse);
  },
  async aiStatus() {
    return fetch(AI_URL, { method: 'GET' }).then(handleResponse);
  },
  async aiAssist(payload) {
    return fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(handleResponse);
  }
};
