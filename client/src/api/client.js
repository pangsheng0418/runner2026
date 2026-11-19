const TOKEN_KEY = 'runflow_admin_token';

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAdminToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest(url, options = {}) {
  const { auth = false, body, headers = {}, isFormData = false, ...rest } = options;
  const finalHeaders = { ...headers };

  if (!isFormData && body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = getAdminToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const err = new Error(data?.error || `請求失敗（HTTP ${res.status}）`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
