import InferenceEngine from './inference-engine.mjs'

export default class CachedInferenceEngine extends InferenceEngine {
  constructor(config = {}) {
    super(config)
    this.cache = {}
  }

  async sendPrompt(prompt) {
    let key = InferenceEngine.hash(`${this.model}-${prompt}`)
    if (key in this.cache) {
      return this.cache[key]
    }
    let ret = await super.sendPrompt(prompt)
    this.cache[key] = ret
    return ret
  }
}
