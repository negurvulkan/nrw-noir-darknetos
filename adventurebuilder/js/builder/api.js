const BASE_URL = './api/api.php';

function handleResponse(res) {
  if (!res.ok) throw new Error('Serverfehler: ' + res.status);
  return res.json();
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
  }
};
