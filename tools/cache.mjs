#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { DEFAULT_TEMPLATE_QUESTIONNAIRE as TEMPLATE } from '../app/settings.js'

const CACHE_FILE = new URL('../app/data/responses.json', import.meta.url)
const APP_DATA_FILE = new URL('../app/data/app-data.json', import.meta.url)

function load() {
  return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
}

function actionLs() {
  const data = load()

  for (const [key, entry] of Object.entries(data)) {
    console.log(`${key}\t${entry.model}\t${entry.response.length}`)
  }
}

function actionModels() {
  const data = load()
  const counts = {}

  for (const entry of Object.values(data)) {
    counts[entry.model] = (counts[entry.model] || 0) + 1
  }

  for (const [model, count] of Object.entries(counts)) {
    console.log(`${model}\t${count}`)
  }
}

function hash(string) {
  let h = 0
  for (const char of string) {
    h = (h << 5) - h + char.charCodeAt(0)
    h |= 0
  }
  return h
}

function buildPrompt(template, variables) {
  let ret = template
  for (const [k, v] of Object.entries(variables)) {
    ret = ret.replace(`{${k}}`, v)
  }
  return ret
}

async function actionFetch() {
  const serviceUrl = process.env.AJ_LLM_API
  const model = process.env.AJ_MODEL

  if (!serviceUrl || !model) {
    console.error('Set AJ_LLM_API and AJ_MODEL environment variables')
    process.exit(1)
  }

  const cache = load()
  const appData = JSON.parse(readFileSync(APP_DATA_FILE, 'utf-8'))

  for (const [caseKey, caseData] of Object.entries(appData.cases)) {
    for (const question of appData.questions) {
      const prompt = buildPrompt(TEMPLATE, {
        STATEMENT: caseData.statement,
        QUESTION: question.text,
      })

      const key = hash(`${model}-${prompt}`)

      if (cache[key]) {
        continue
      }

      const url = serviceUrl.replace(/\/+$/, '') + '/chat/completions'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          max_tokens: 4000,
        }),
      })

      if (!res.ok) {
        console.error(`API error (${res.status}) for ${caseKey} / ${question.text}`)
        continue
      }

      const data = await res.json()
      const response = data?.choices?.[0]?.message?.content

      if (response) {
        cache[key] = { response, model, hash: key }
        console.log(`cached ${caseKey} / ${question.text}`)
      }

      writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
    }
  }
}

const action = process.argv[2]
if (action === 'ls') {
  actionLs()
} else if (action === 'models') {
  actionModels()
} else if (action === 'fetch') {
  actionFetch()
} else {
  console.error('Unknown action:', action)
  console.error('Usage: node cache.mjs <ls|models|fetch>')
  process.exit(1)
}
