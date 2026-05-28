#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const CACHE_FILE = new URL('../app/data/responses.json', import.meta.url)

function ls() {
  const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))

  for (const [key, entry] of Object.entries(data)) {
    console.log(`${key}\t${entry.model}\t${entry.response.length}`)
  }
}

const action = process.argv[2]
if (action === 'ls') {
  ls()
} else {
  console.error('Unknown action:', action)
  console.error('Usage: node cache.mjs <ls>')
  process.exit(1)
}
