import InferenceEngine from './inference-engine.mjs'

export default class CachedInferenceEngine extends InferenceEngine {
  constructor(config = {}) {
    super(config)
    this.cache = {}
  }

  async loadCache(url) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    this.cache = await response.json()
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
