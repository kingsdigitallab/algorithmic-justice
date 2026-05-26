import InferenceEngine from './inference-engine.mjs'

export default class CachedInferenceEngine extends InferenceEngine {
  constructor(config = {}) {
    super(config)
    this.cache = {}
  }

  async loadCache(url) {
    let ret = {}
    try {
      const response = await fetch(url)
      if (response.ok) {
        ret = await response.json()
      }
    } catch (err) {
      console.error('Error loading cache:', err)
    }
    this.cache = ret
  }

  async sendPrompt(prompt) {
    let key = InferenceEngine.hash(`${this.model}-${prompt}`)
    if (key in this.cache) {
      return this.cache[key]
    }
    let ret = await super.sendPrompt(prompt)
    if (ret) {
      this.cache[key] = ret
    }
    return ret
  }
}
