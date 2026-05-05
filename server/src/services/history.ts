import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', '..', 'data', 'history.db')

import fs from 'node:fs'
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    players TEXT NOT NULL,
    base_score INTEGER DEFAULT 1,
    multiplier INTEGER DEFAULT 1,
    bomb_count INTEGER DEFAULT 0,
    winner INTEGER DEFAULT -1,
    duration INTEGER DEFAULT 0,
    status TEXT DEFAULT 'finished',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    name TEXT PRIMARY KEY,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    landlord_games INTEGER DEFAULT 0,
    landlord_wins INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0
  );
`)

// Add status column if upgrading from older schema
try { db.exec(`ALTER TABLE game_history ADD COLUMN status TEXT DEFAULT 'finished'`) } catch { /* already exists */ }

// Prepared statements
const insertHistory = db.prepare(`
  INSERT INTO game_history (room_id, mode, players, base_score, status)
  VALUES (?, ?, ?, ?, 'playing')
`)

const updateHistory = db.prepare(`
  UPDATE game_history SET multiplier=?, bomb_count=?, winner=?, duration=?, status='finished'
  WHERE room_id=? AND status='playing'
`)

const selectHistory = db.prepare(`
  SELECT * FROM game_history WHERE status='finished' ORDER BY created_at DESC LIMIT 50
`)

const upsertStats = db.prepare(`
  INSERT INTO player_stats (name, games_played, games_won, landlord_games, landlord_wins, total_score)
  VALUES (?, 1, ?, ?, ?, ?)
  ON CONFLICT(name) DO UPDATE SET
    games_played = games_played + 1,
    games_won = games_won + excluded.games_won,
    landlord_games = landlord_games + excluded.landlord_games,
    landlord_wins = landlord_wins + excluded.landlord_wins,
    total_score = total_score + excluded.total_score
`)

export interface HistoryRecord {
  id: number
  room_id: string
  mode: string
  players: string
  base_score: number
  multiplier: number
  bomb_count: number
  winner: number
  duration: number
  status: string
  created_at: string
}

export interface PlayerRecord {
  name: string
  isLandlord: boolean
  won: boolean
}

// Called when game starts
export function beginGame(
  roomId: string,
  mode: string,
  players: PlayerRecord[],
  baseScore: number,
) {
  insertHistory.run(roomId, mode, JSON.stringify(players), baseScore)
}

// Called when game ends — updates the 'playing' record to 'finished'
export function recordGame(
  roomId: string,
  mode: string,
  players: PlayerRecord[],
  baseScore: number,
  multiplier: number,
  bombCount: number,
  winner: number,
  duration: number,
) {
  updateHistory.run(multiplier, bombCount, winner, duration, roomId)

  for (const p of players) {
    upsertStats.run(
      p.name,
      p.won ? 1 : 0,
      p.isLandlord ? 1 : 0,
      p.isLandlord && p.won ? 1 : 0,
      p.won ? multiplier : -multiplier,
    )
  }
}

export function getRecentHistory(): HistoryRecord[] {
  return selectHistory.all() as HistoryRecord[]
}
