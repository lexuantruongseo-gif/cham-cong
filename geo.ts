
let cachedIp: string | null = null;
let lastFetchTime = 0;

export const fetchPublicIp = async (): Promise<string> => {
  const now = Date.now();
  if (cachedIp && (now - lastFetchTime < 300000)) {
    return cachedIp;
  }
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) throw new Error('Failed to fetch IP');
    const data = await response.json();
    cachedIp = data.ip;
    lastFetchTime = now;
    return data.ip;
  } catch (error) {
    console.error('IP Fetch Error:', error);
    return cachedIp || '127.0.0.1'; 
  }
};