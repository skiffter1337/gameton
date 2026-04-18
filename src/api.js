const API_PREFIX = '/api';

function endpoint(path) {
  return `${API_PREFIX}${path}`;
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = text;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const details = Array.isArray(payload?.errors)
      ? payload.errors.join('; ')
      : typeof payload === 'string'
        ? payload
        : response.statusText;

    throw new Error(`${response.status} ${details}`);
  }

  return payload;
}

export async function getArena(signal) {
  const response = await fetch(endpoint('/arena'), { signal });

  return parseResponse(response);
}

export async function getLogs(signal) {
  const response = await fetch(endpoint('/logs'), { signal });

  return parseResponse(response);
}

export async function sendCommand(body) {
  const response = await fetch(endpoint('/command'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return parseResponse(response);
}
