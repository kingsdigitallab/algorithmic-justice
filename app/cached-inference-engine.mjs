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

  async sendPrompt(prompt, ignoreCache=false) {
    let key = InferenceEngine.hash(`${this.model}-${prompt}`)
    if (!ignoreCache) {
      let entry = this.cache[key]
      if (entry) {
        return entry.response
      }
    }
    let ret = await super.sendPrompt(prompt)
    if (ret) {
      this.cache[key] = { response: ret, model: this.model, hash: key }
    }
    return ret
  }
}
