#!/usr/bin/env node
// AJ_LLM_API=http://localhost:11436/v1 AJ_MODEL=qwen3.6:27b node cache.mjs fetch
// AJ_LLM_API=http://localhost:11436/v1 AJ_MODEL=granite4.1:30b node cache.mjs fetch
import { readFileSync, writeFileSync } from 'node:fs'
import { getDefaultSetting } from '../app/settings.mjs'
import CachedInferenceEngine from '../app/cached-inference-engine.mjs'

const APP_DATA_FILE = new URL('../app/data/app-data.json', import.meta.url)

class ResponseCacheManager {

  constructor() {
    this.engine = new CachedInferenceEngine({
      serviceUrl: process.env.AJ_LLM_API || getDefaultSetting('serviceUrl'),
      model: process.env.AJ_MODEL || getDefaultSetting('model')
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
    const appData = JSON.parse(readFileSync(APP_DATA_FILE, 'utf-8'))
    let template = getDefaultSetting('templateQuestionnaire')

    for (const [caseKey, caseData] of Object.entries(appData.cases)) {
      let questionIndex = 0
      for (const question of appData.questions) {
        console.log(`Questionnaire; ${caseKey}, question ${questionIndex+1}, ${question.text}`)
        let res = await this.engine.sendPromptTemplate(template, {
          STATEMENT: caseData.statement,
          QUESTION: question.text,
        })
        console.log(`  length: ${res?.length || 0}`)
        questionIndex += 1
      }
    }

    template = getDefaultSetting('templateHighlighter')
    let questions = getDefaultSetting('questions')
    questions = questions.split('\n').map(l => l.trim()).filter(l => l.length)

    for (const [caseKey, caseData] of Object.entries(appData.cases)) {
      let questionIndex = 0
      for (const question of questions) {
        console.log(`Highlighter; ${caseKey}, question ${questionIndex+1}, ${question}`)
        let res = await this.engine.sendPromptTemplate(template, {
          STATEMENT: caseData.statement,
          QUESTION: question,
        })
        console.log(`  length: ${res?.length || 0}`)
        questionIndex += 1
      }
    }

    this.engine.saveCache()
  }

  async actionCompact() {
    this.engine.removeDerivedProperties()
    this.engine.saveCache(true)
  }

  async actionExpand() {
    this.engine.saveCache()
  }

  async runAction(action) {
    await this.loadCache()

    if (action === 'ls') {
      this.actionLs()
    } else if (action === 'models') {
      this.actionModels()
    } else if (action === 'fetch') {
      this.actionFetch()
    } else if (action === 'compact') {
      this.actionCompact()
    } else if (action === 'expand') {
      this.actionExpand()
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
