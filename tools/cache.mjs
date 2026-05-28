#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const CACHE_FILE = new URL('../app/data/responses.json', import.meta.url)

function hash(string) {
  let h = 0
  for (const char of string) {
    h = (h << 5) - h + char.charCodeAt(0)
    h |= 0
  }
  return h
}

function ls() {
  const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))

  for (const [key, entry] of Object.entries(data)) {
    const responseHash = hash(entry.response)
    console.log(`${key}\t${entry.model}\t${responseHash}`)
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
