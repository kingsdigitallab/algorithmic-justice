const INFERRENCE_BACKEND = 'openai'

const CONTEXT_LENGTH = 4000

export default class InferenceEngine {
  constructor(config = {}) {
    this.serviceUrl = config.serviceUrl ?? ''
    this.apiKey = config.apiKey ?? ''
    this.model = config.model ?? ''
    this.contextLength = config.contextLength ?? CONTEXT_LENGTH
    this.models = []
    this.isWorking = false
  }

  updateConfig(config) {
    if (config.serviceUrl !== undefined) this.serviceUrl = config.serviceUrl
    if (config.apiKey !== undefined) this.apiKey = config.apiKey
    if (config.model !== undefined) this.model = config.model
    if (config.contextLength !== undefined) this.contextLength = config.contextLength
  }

  async fetchModels() {
    let ret = []
    if (this.serviceUrl.includes('/')) {
      let res = await this.callApi('models')
      if (res?.data) {
        ret = res.data.map(modelInfo => modelInfo.id)
      }
    }
    this.models = ret
    this.isWorking = ret.length > 0
    return ret
  }

  async callApi(path, body) {
    let fullPath = this.serviceUrl.replace(/\/+$/, '')
    if (!fullPath.includes('/')) {
      return {}
    }
    fullPath += '/' + path.replace(/^\/+/, '')

    let headers = { "Content-Type": "application/json" }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    let requestInit = { headers }
    if (body) {
      requestInit.body = JSON.stringify(body)
      requestInit.method = 'POST'
    }

    let res
    try {
      res = await fetch(fullPath, requestInit)
    } catch (error) {
      throw new Error(`Processing error (${error.message}). Check address or access to model server (${this.serviceUrl}).`)
    }

    if (!res.ok && res?.status) {
      throw new Error(`Processing error (${res.status}). Check address or access to model server (${this.serviceUrl}).`)
    }

    if (res?.status == '401') {
      throw new Error(`Can't access the model (401), is your API key valid? (check Settings tab)`)
    }

    if ([200, 404, 400].includes(res?.status)) {
      try {
        const data = await res.json()
        if (data?.error?.message) {
          throw new Error(`Processing error (${data.error.message}).`)
        }
        if (res?.status == '200') {
          return data
        }
        if (data.detail) {
          throw new Error(`Processing error (${data.detail}).`)
        }
        throw new Error('Processing error (unknown).')
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`Processing error (${error.message}). Check address or access to model server in the Settings tab.`)
        }
        throw error
      }
    }

    return {}
  }

  async sendPrompt(prompt) {
    let generate_url = ''
    let body = {}
    if (INFERRENCE_BACKEND == 'ollama') {
      generate_url = 'generate'
      body = {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          "num_ctx": CONTEXT_LENGTH,
          think: false,
        }
      }
    }
    if (INFERRENCE_BACKEND == 'openwebui' || INFERRENCE_BACKEND == 'openai') {
      generate_url = 'chat/completions'
      body = {
        model: this.model,
        messages: [{
          role: 'user',
          content: prompt
        }],
        stream: false,
        max_tokens: parseInt(this.contextLength)
      }
    }

    const res = await this.callApi(generate_url, body)
    console.log(res)
    return res?.choices[0]?.message?.content || ''
  }

  parseObject(text) {
    return this._parse(text, true)
  }

  parseArray(text) {
    return this._parse(text, false)
  }

  _parse(text, isObject) {
    let ret = isObject ? {} : []
    if (text) {
      let cleaned = text.replace('```json', '').replace('```', '').trim()
      let brackets = [['[', ']'], ['{', '}']]
      let [open, close] = brackets[isObject ? 1 : 0]
      if (cleaned.startsWith(open) && cleaned.endsWith(close)) {
        try {
          ret = JSON.parse(cleaned)
        } catch (error) {
          console.log(error.message)
        }
      }
    }
    return ret
  }

  static hash(string) {
    let hash = 0
    for (const char of string) {
      hash = (hash << 5) - hash + char.charCodeAt(0)
      hash |= 0
    }
    return hash
  }

  static delay(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000))
  }
}
