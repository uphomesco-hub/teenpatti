const TOKEN_PREFIX = 'teenpatti.token.';

export function getStoredToken(roomId) {
  if (!roomId) {
    return '';
  }
  return window.localStorage.getItem(`${TOKEN_PREFIX}${roomId}`) || '';
}

export function setStoredToken(roomId, token) {
  if (!roomId || !token) {
    return;
  }
  window.localStorage.setItem(`${TOKEN_PREFIX}${roomId}`, token);
}

export function clearStoredToken(roomId) {
  if (!roomId) {
    return;
  }
  window.localStorage.removeItem(`${TOKEN_PREFIX}${roomId}`);
}
