const Redis = require("ioredis");

let redisClient = null;
let isConnected = false;

/**
 * Create and configure Redis client
 */
const createRedisClient = () => {
  if (redisClient) {
    return redisClient;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    reconnectOnError(err) {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) {
        // Only reconnect when the error contains "READONLY"
        return true;
      }
      return false;
    },
  };

  // Add TLS configuration for production
  if (
    process.env.NODE_ENV === "production" &&
    process.env.REDIS_TLS === "true"
  ) {
    redisConfig.tls = {
      rejectUnauthorized: false, // For Redis Cloud compatibility
    };
  }

  redisClient = new Redis(redisConfig);

  // Connection event handlers
  redisClient.on("connect", () => {
    console.log("🔄 Connecting to Redis...");
  });

  redisClient.on("ready", () => {
    isConnected = true;
    console.log("✅ Redis Connected Successfully");
    console.log(`   Host: ${process.env.REDIS_HOST}`);
    console.log(`   Port: ${process.env.REDIS_PORT}`);
  });

  redisClient.on("error", (err) => {
    isConnected = false;
    console.error("❌ Redis Connection Error:", err.message);
  });

  redisClient.on("close", () => {
    isConnected = false;
    console.log("⚠️  Redis connection closed");
  });

  redisClient.on("reconnecting", () => {
    console.log("🔄 Reconnecting to Redis...");
  });

  return redisClient;
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
  if (!redisClient) {
    return createRedisClient();
  }
  return redisClient;
};

/**
 * Check if Redis is connected
 */
const isRedisConnected = () => {
  return isConnected && redisClient && redisClient.status === "ready";
};

/**
 * Gracefully close Redis connection
 */
const closeRedis = async () => {
  if (redisClient) {
    console.log("🛑 Closing Redis connection...");
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
  }
};

/**
 * Ping Redis to check connectivity
 */
const pingRedis = async () => {
  try {
    if (!redisClient) {
      return false;
    }
    const result = await redisClient.ping();
    return result === "PONG";
  } catch (error) {
    console.error("Redis ping failed:", error.message);
    return false;
  }
};

// Handle process termination
process.on("SIGINT", async () => {
  await closeRedis();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeRedis();
  process.exit(0);
});

module.exports = {
  createRedisClient,
  getRedisClient,
  isRedisConnected,
  closeRedis,
  pingRedis,
};
