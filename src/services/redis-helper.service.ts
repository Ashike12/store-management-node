import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisHelperService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_URI, // Redis host
      port: Number(process.env.REDIS_PORT),        // Redis port
      password: process.env.REDIS_PASS, // optional
    });

    // Alternatively, you can use a connection string
    // this.client = new Redis('redis://:[password]@[host]:[port]');
  }

  onModuleInit() {
    console.log('Redis client connected');
  }

  onModuleDestroy() {
    this.client.quit();
    console.log('Redis client disconnected');
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async setWithExpiryInSecond(key: string, value: string, expiry: number): Promise<void> {
    await this.client.set(key, value, 'EX', expiry);
  }

  async get(key: string): Promise<string> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }
}
