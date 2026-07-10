const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${host}:8000/api/v1`;
  }
  return 'http://localhost:8000/api/v1';
};

export const environment = {
  production: false,
  apiUrl: getApiUrl()
};
