export const SERVERS = {
  test: {
    key: 'test',
    label: 'Test',
    origin: 'https://games-test.datsteam.dev',
    prefix: '/api-test',
  },
  final: {
    key: 'final',
    label: 'Final',
    origin: 'https://games.datsteam.dev',
    prefix: '/api-final',
  },
};

function endpoint(serverKey, path) {
  const server = SERVERS[serverKey] ?? SERVERS.test;
  return `${server.prefix}${path}`;
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

export async function getArena(serverKey, token, signal) {
  const response = await fetch(endpoint(serverKey, '/arena'), {
    signal,
    headers: {
      'X-Auth-Token': token,
    },
  });

  return parseResponse(response);
}

export async function getLogs(serverKey, token, signal) {
  const response = await fetch(endpoint(serverKey, '/logs'), {
    signal,
    headers: {
      'X-Auth-Token': token,
    },
  });

  return parseResponse(response);
}

export async function sendCommand(serverKey, token, body) {
  const response = await fetch(endpoint(serverKey, '/command'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token,
    },
    body: JSON.stringify(body),
  });

  return parseResponse(response);
}
