const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    if (port === '4200') {
      return `${protocol}//${host}:8000/api/v1`;
    }
    return '/api/v1';
  }
  return '/api/v1';
};

export const environment = {
  production: false,
  apiUrl: getApiUrl()
};
