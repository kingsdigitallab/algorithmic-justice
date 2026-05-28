#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { DEFAULT_TEMPLATE_QUESTIONNAIRE as TEMPLATE } from '../app/settings.mjs'
import CachedInferenceEngine from '../app/cached-inference-engine.mjs'

const APP_DATA_FILE = new URL('../app/data/app-data.json', import.meta.url)

class ResponseCacheManager {

  constructor() {
    this.engine = new CachedInferenceEngine({
      serviceUrl: process.env.AJ_LLM_API,
      model: process.env.AJ_MODEL
    })
  }

  async loadCache() {
    await this.engine.loadCache('../app/data/responses.json')
  }

  getCacheEntries() {
    return this.engine.getCache()
  }

  actionLs() {
    const entries = this.getCacheEntries()

    for (const [key, entry] of Object.entries(entries)) {
      console.log(`${key}\t${entry.model}\t${entry.response.length}`)
    }
  }

  actionModels() {
    const entries = this.getCacheEntries()
    const counts = {}

    for (const entry of Object.values(entries)) {
      counts[entry.model] = (counts[entry.model] || 0) + 1
    }

    for (const [model, count] of Object.entries(counts)) {
      console.log(`${model}\t${count}`)
    }
  }

  async actionFetch() {
    const cache = this.engine.getCache()
    const appData = JSON.parse(readFileSync(APP_DATA_FILE, 'utf-8'))

    for (const [caseKey, caseData] of Object.entries(appData.cases)) {
      for (const question of appData.questions) {
        const prompt = this.engine.getPromptFromTemplate(TEMPLATE, {
          STATEMENT: caseData.statement,
          QUESTION: question.text,
        })

        const key = CachedInferenceEngine.hash(`${model}-${prompt}`)

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
      }
    }
  }

  async runAction(action) {
    await this.loadCache()

    if (action === 'ls') {
      this.actionLs()
    } else if (action === 'models') {
      this.actionModels()
    } else if (action === 'fetch') {
      this.actionFetch()
    } else {
      if (action && action !== 'help') {
        console.error('Unknown action:', action)
      }
      console.error('Usage: node cache.mjs <ls|models|fetch>')
      process.exit(1)
    }
  }
}

const app = new ResponseCacheManager()
await app.runAction(process.argv[2])
