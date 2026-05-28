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

  getCache() {
    return this.cache
  }

  async sendPrompt(prompt, ignoreCache=false, cachedDelaySeconds=0) {
    let key = CachedInferenceEngine.hash(`${this.model}-${prompt}`)
    if (!ignoreCache) {
      let entry = this.cache[key]
      if (entry) {
        if (cachedDelaySeconds) {
          await CachedInferenceEngine.delay(cachedDelaySeconds)
        }
        return entry.response
      }
    }
    let ret = await super.sendPrompt(prompt)
    if (ret) {
      this.cache[key] = { response: ret, model: this.model, hash: key }
    }
    return ret
  }

  getCachedResponseFromTemplate(template, variables) {
    let prompt = this.getPromptFromTemplate(template, variables)
    return this.getCachedResponse(prompt)
  }

  getCachedResponse(prompt) {
    let key = CachedInferenceEngine.hash(`${this.model}-${prompt}`)
    console.log(key, prompt)
    return this.cache[key] ?? null
  }

  getCachedModels() {
    let ret = []

    for (let r of Object.values(this.cache)) {
      if (r.model === 'magistrate') continue;
      if (!ret.includes(r.model)) {
        ret.push(r.model)
      }
    }

    return ret
  }

  removeCachedResponsesByModel(model=null) {
    model = model ?? this.model

    if (model) {
      let keys = Object.keys(this.cache)
      for (let k of keys) {
        if (this.cache[k].model === model) {
          delete this.cache[k]
        }
      }    
    }
  }

  static delay(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000))
  }

  static hash(string) {
    let hash = 0
    for (const char of string) {
      hash = (hash << 5) - hash + char.charCodeAt(0)
      hash |= 0
    }
    return hash
  }

}
