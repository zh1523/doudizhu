// Redis 存储层 — 房间状态持久化
// 如果 Redis 不可用，自动降级为内存 Map 模式

import { Redis } from 'ioredis'

let redis: Redis | null = null
let redisAvailable = false

// 内存降级存储
const memoryStore = new Map<string, string>()
const memoryExpires = new Map<string, number>()

// 初始化 Redis 连接
export async function initRedis(): Promise<boolean> {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    })
    redis.on('error', () => {})
    await redis.connect()
    redisAvailable = true
    console.log('[Redis] 已连接')
    return true
  } catch {
    console.log('[Redis] 未检测到，降级为内存存储')
    redisAvailable = false
    redis = null
    return false
  }
}

// ======== Hash 操作 ========

async function hset(key: string, field: string, value: string): Promise<void> {
  if (redisAvailable && redis) {
    await redis.hset(key, field, value)
    return
  }
  const hash = JSON.parse(memoryStore.get(key) || '{}')
  hash[field] = value
  memoryStore.set(key, JSON.stringify(hash))
}

async function hget(key: string, field: string): Promise<string | null> {
  if (redisAvailable && redis) {
    return await redis.hget(key, field)
  }
  const hash = JSON.parse(memoryStore.get(key) || '{}')
  return hash[field] ?? null
}

async function hgetall(key: string): Promise<Record<string, string>> {
  if (redisAvailable && redis) {
    return await redis.hgetall(key)
  }
  return JSON.parse(memoryStore.get(key) || '{}')
}

async function hdel(key: string, ...fields: string[]): Promise<void> {
  if (redisAvailable && redis) {
    await redis.hdel(key, ...fields)
    return
  }
  const hash = JSON.parse(memoryStore.get(key) || '{}')
  for (const f of fields) delete hash[f]
  if (Object.keys(hash).length === 0) memoryStore.delete(key)
  else memoryStore.set(key, JSON.stringify(hash))
}

async function delKey(key: string): Promise<void> {
  if (redisAvailable && redis) {
    await redis.del(key)
    return
  }
  memoryStore.delete(key)
  memoryExpires.delete(key)
}

// ======== 房间数据 ========

const ROOMS_KEY = 'lobby:rooms'

export interface RoomRedisData {
  id: string
  mode: string
  phase: string
  playerCount: number
  maxPlayers: number
  players: { id: string; name: string; seat: number; isReady: boolean; isOnline: boolean }[]
}

export async function syncRoom(roomId: string, data: RoomRedisData): Promise<void> {
  await hset(ROOMS_KEY, roomId, JSON.stringify(data))
}

export async function removeRoom(roomId: string): Promise<void> {
  await hdel(ROOMS_KEY, roomId)
}

export async function getRoom(roomId: string): Promise<RoomRedisData | null> {
  const raw = await hget(ROOMS_KEY, roomId)
  if (!raw) return null
  return JSON.parse(raw) as RoomRedisData
}

export async function getAllRooms(): Promise<RoomRedisData[]> {
  const hash = await hgetall(ROOMS_KEY)
  return Object.values(hash).map(raw => JSON.parse(raw) as RoomRedisData)
}

export async function clearAllRooms(): Promise<void> {
  await delKey(ROOMS_KEY)
}
