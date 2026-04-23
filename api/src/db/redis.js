import IORedis from 'ioredis';

let _client;

export function getRedisClient() {
  if (!_client) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    _client = new IORedis(url, {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    _client.on('error', () => {
      // Redis is optional — getActiveRuleset falls back to DB on every call
    });
  }
  return _client;
}
