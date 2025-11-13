const { getRedisClient, isRedisConnected } = require("../config/redis");

/**
 * Cache Service - Abstraction layer for Redis caching
 * Provides fallback to direct DB queries if Redis is unavailable
 */
class CacheService {
  constructor() {
    this.redis = getRedisClient();
    this.defaultTTL = 300; // 5 minutes default TTL
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Parsed value or null
   */
  async get(key) {
    try {
      if (!isRedisConnected()) {
        console.warn("Redis not connected, cache miss");
        return null;
      }

      const value = await this.redis.get(key);
      if (!value) return null;

      // Try to parse JSON
      try {
        return JSON.parse(value);
      } catch {
        return value; // Return as string if not JSON
      }
    } catch (error) {
      console.error(`Cache GET error for key ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      if (!isRedisConnected()) {
        console.warn("Redis not connected, skipping cache set");
        return false;
      }

      const stringValue =
        typeof value === "string" ? value : JSON.stringify(value);
      await this.redis.setex(key, ttl, stringValue);
      return true;
    } catch (error) {
      console.error(`Cache SET error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   */
  async del(key) {
    try {
      if (!isRedisConnected()) {
        return false;
      }

      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error(`Cache DEL error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   * @param {string} pattern - Pattern to match (e.g., "session:*")
   */
  async delPattern(pattern) {
    try {
      if (!isRedisConnected()) {
        return false;
      }

      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error(`Cache DEL pattern error for ${pattern}:`, error.message);
      return false;
    }
  }

  /**
   * Increment a counter atomically
   * @param {string} key - Counter key
   * @param {number} ttl - Optional TTL for new counters
   * @returns {Promise<number>} - New counter value
   */
  async incr(key, ttl = null) {
    try {
      if (!isRedisConnected()) {
        throw new Error("Redis not connected");
      }

      const newValue = await this.redis.incr(key);

      // Set TTL only if it's a new key (value === 1)
      if (ttl && newValue === 1) {
        await this.redis.expire(key, ttl);
      }

      return newValue;
    } catch (error) {
      console.error(`Cache INCR error for key ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Decrement a counter atomically
   * @param {string} key - Counter key
   * @returns {Promise<number>} - New counter value
   */
  async decr(key) {
    try {
      if (!isRedisConnected()) {
        throw new Error("Redis not connected");
      }

      return await this.redis.decr(key);
    } catch (error) {
      console.error(`Cache DECR error for key ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Set a key with NX (only if not exists) option
   * @param {string} key - Cache key
   * @param {any} value - Value to set
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - True if set, false if key already exists
   */
  async setNX(key, value, ttl) {
    try {
      if (!isRedisConnected()) {
        throw new Error("Redis not connected");
      }

      const stringValue =
        typeof value === "string" ? value : JSON.stringify(value);
      const result = await this.redis.set(key, stringValue, "NX", "EX", ttl);
      return result === "OK";
    } catch (error) {
      console.error(`Cache SETNX error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    try {
      if (!isRedisConnected()) {
        return false;
      }

      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Cache EXISTS error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} - TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key) {
    try {
      if (!isRedisConnected()) {
        return -2;
      }

      return await this.redis.ttl(key);
    } catch (error) {
      console.error(`Cache TTL error for key ${key}:`, error.message);
      return -2;
    }
  }

  /**
   * Set expiry on an existing key
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   */
  async expire(key, ttl) {
    try {
      if (!isRedisConnected()) {
        return false;
      }

      await this.redis.expire(key, ttl);
      return true;
    } catch (error) {
      console.error(`Cache EXPIRE error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Get multiple keys at once
   * @param {string[]} keys - Array of cache keys
   * @returns {Promise<any[]>} - Array of values
   */
  async mget(keys) {
    try {
      if (!isRedisConnected() || keys.length === 0) {
        return keys.map(() => null);
      }

      const values = await this.redis.mget(...keys);
      return values.map((value) => {
        if (!value) return null;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      console.error("Cache MGET error:", error.message);
      return keys.map(() => null);
    }
  }

  /**
   * Invalidate cache for a session
   * @param {string} sessionId - Session ID
   */
  async invalidateSession(sessionId) {
    const patterns = [
      `session:${sessionId}`,
      `live_results:${sessionId}`,
      `vote_count:${sessionId}:*`,
      `total_votes:${sessionId}`,
    ];

    for (const pattern of patterns) {
      if (pattern.includes("*")) {
        await this.delPattern(pattern);
      } else {
        await this.del(pattern);
      }
    }
  }

  /**
   * Invalidate cache for a student
   * @param {string} studentId - Student ID
   */
  async invalidateStudent(studentId) {
    const keys = [
      `student:profile:${studentId}`,
      `student:session:${studentId}`,
      `eligible_sessions:${studentId}`,
    ];

    for (const key of keys) {
      await this.del(key);
    }
  }

  /**
   * Get Redis info for monitoring
   */
  async getInfo() {
    try {
      if (!isRedisConnected()) {
        return { connected: false };
      }

      const info = await this.redis.info("stats");
      const memory = await this.redis.info("memory");

      return {
        connected: true,
        info,
        memory,
      };
    } catch (error) {
      console.error("Cache INFO error:", error.message);
      return { connected: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new CacheService();
