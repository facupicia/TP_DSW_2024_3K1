let accessToken: string | null = null;

const hasBrowserStorage = (): boolean => typeof window !== 'undefined' && !!window.localStorage;

export const getAccessToken = (): string | null => {
  if (accessToken) {
    return accessToken;
  }

  if (!hasBrowserStorage()) {
    return null;
  }

  const legacyToken = window.localStorage.getItem('token');
  if (legacyToken) {
    accessToken = legacyToken;
    window.localStorage.removeItem('token');
  }

  return accessToken;
};

export const setAccessToken = (token: string): void => {
  accessToken = token;
  if (hasBrowserStorage()) {
    window.localStorage.removeItem('token');
  }
};

export const clearAccessToken = (): void => {
  accessToken = null;
  if (hasBrowserStorage()) {
    window.localStorage.removeItem('token');
  }
};
