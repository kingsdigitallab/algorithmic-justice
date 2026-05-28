#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const CACHE_FILE = new URL('../app/data/responses.json', import.meta.url)

function load() {
  return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
}

function ls() {
  const data = load()

  for (const [key, entry] of Object.entries(data)) {
    console.log(`${key}\t${entry.model}\t${entry.response.length}`)
  }
}

function models() {
  const data = load()
  const counts = {}

  for (const entry of Object.values(data)) {
    counts[entry.model] = (counts[entry.model] || 0) + 1
  }

  for (const [model, count] of Object.entries(counts)) {
    console.log(`${model}\t${count}`)
  }
}

const action = process.argv[2]
if (action === 'ls') {
  ls()
} else if (action === 'models') {
  models()
} else {
  console.error('Unknown action:', action)
  console.error('Usage: node cache.mjs <ls|models>')
  process.exit(1)
}
