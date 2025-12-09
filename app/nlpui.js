const { createApp, nextTick } = window.Vue;

// const INFERRENCE_URL = "http://localhost:11436/api/"
// const INFERRENCE_BACKEND = 'ollama'
// const INFERRENCE_URL = "https://ai.create.kcl.ac.uk/api/"
// const INFERRENCE_BACKEND = 'openwebui'
const INFERRENCE_BACKEND = 'openai'


// const MODEL = "gemma3:12b" // can't disable thinking, which takes a lot of tokens and time
// const MODEL = "gemma3:4b"

const CONTEXT_LENGTH = 4000

function camelToSpaceCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (match) => match.toUpperCase());
}

async function loadJson(url) {
  let ret = {}
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    ret = data
  } catch (err) {
    console.error('Error loading JSON:', err);
  }
  return ret
}

createApp({
  data() {
    return {
      // question: DEFAULT_QUESTION,
      // template: TEMPLATE,
      // statement: STATEMENT,
      response: '',
      isResponding: false,
      isServiceWorking: false,
      message: {
        content: '',
        level: 'info',
      },
      settings: window.SETTINGS,
      modelsList: [],
      tabs: {
        'highlighter': {
          'title': 'Highlighter',
        },
        'settings': {
          'title': 'Settings',
        }
      },
      // selectedTab: 'highlighter',
      selectedTab: 'settings',
    }
  },
  async mounted() {
    this.initSettings()

    this.initService()
    
    if (this.isServiceWorking) {
      this.sendPrompt()
    }
  },
  computed: {
    settingsFiltered() {
      let ret = {}

      return ret  
    },
    higlightedText() {
      let ret = this.settings.statement?.value ?? ''
      for (let highlight of this.highlights) {
        ret = ret.replaceAll(highlight.passage, `<span class="passage" data-tippy-content="${highlight.reason}">${highlight.passage}</span>`)
      }
      ret = ret.replaceAll('\n', '<br>')
      return ret
    },
    highlights() {
      let ret = []
      let res = this.response.replace('```json', '').replace('```', '').trim()
      if (res.startsWith('[') && res.endsWith(']')) {
        ret = JSON.parse(res)
      }
      return ret
    },
    clipDisplayUnits() {
      let ret = this.clipUnits
      ret.sort((a, b) => a.start.localeCompare(b.start))
      let pLast = null
      for (let p of ret) {
        p.current = (this.videoCurrentTime + 5) > this.getSecondsFromTimeCode(p.start)
        if (pLast && p.current) {
          pLast.current = false
        }
        pLast = p
      }
      return ret
    },
  },
  methods: {
    getModelsList() {
      return this.modelsList
    },
    async initService() {
      let res = await this.fetchModelsList()
      this.isServiceWorking = (res && res?.length > 0)
    },
    async sendToService(path, body) {
      let ret = {}

      this.isResponding = true

      this.setMessage(`Model server is processing your request (${path})...`)

      let res = {}
      let headers = {
        "Content-Type": "application/json",
      }
      if (this.settings.apiKey.value) {
        headers['Authorization'] = `Bearer ${this.settings.apiKey.value}`
      }
      let requestInit = {
        headers: headers,
      }
      if (body) {
        requestInit.body = JSON.stringify(body)
        requestInit.method = 'POST'
      }
      let fullPath = this.settings.serviceUrl.value.replace(/\/+$/, '');
      fullPath += '/' + path.replace(/^\/+/, '');
      try {
        res = await fetch(fullPath, requestInit);
      } catch (error) {
        this.setMessage(`Processing error (${error.message}). Check address or access to model server (${this.settings.serviceUrl.value}).`, 'danger')
      }

      if (!res.ok && res?.status) {
        this.setMessage(`Processing error (${res.status}). Check address or access to model server (${this.settings.serviceUrl.value}).`, 'danger')
      }

      if (res?.status == '401') {
        this.setMessage(`Can't access the model (401), is your API key valid? (check Settings tab)`, 'danger')
      }

      if (res?.status == '404' || res?.status == '200') {
        const data = await res.json();
        if (data?.error?.message) {
          this.setMessage(`Processing error (${data.error.message}).`, 'danger')
        } else {
          if (res?.status == '200') {
            ret = data
          }
        }
        // responseElement.textContent = data.response;
        // console.log(data)
      }

      if (this.message.level === 'info') {
        this.setMessage('')
      } else {
        this.response = ''
      }

      this.isResponding = false

      return ret
    },
    initSettings() {
      const params = new URLSearchParams(window.location.search);
      // this.question = params.get('q') ?? DEFAULT_QUESTION;
      // this.settings.model = params.get('model') ?? this.settings.model;

      for (let [settingKey, setting] of Object.entries(this.settings)) {
        setting.value = setting.default
        if (!setting?.label) {
          setting.label = camelToSpaceCase(settingKey)
        }
        if (setting?.lookup) {
          setting.lookupMethod = this[setting.lookup]
          setting.type = 'select'
        }
        if (setting.inQueryString) {
          setting.value = params.get(settingKey) ?? setting.value
        } else {
          setting.value = sessionStorage.getItem(settingKey) ?? setting.value
        }
      }
    },
    onChangeApiKey() {
      // sessionStorage.setItem('apiKey', this.apiKey)
    },
    onClickTab(tabKey) {
      this.selectedTab = tabKey
    },
    onChangedSetting(settingKey) {
      let setting = this.settings[settingKey]
      if (!setting.value) {
        setting.value = setting.default
      }
      if (setting.inQueryString) {
        const url = new URL(window.location);
        url.searchParams.set(settingKey, setting.value);
        window.history.replaceState({}, '', url);
      } else {
        sessionStorage.setItem(settingKey, setting.value)
      }
    },
    // async fetchModelsListOLD() {
    //   let ret = ['gemma3:4b', 'gemma3:12b', 'gemma3:27b', 'qwen3:4b', 'qwen3:8b', 'gpt-oss:20b']
    //   if (INFERRENCE_BACKEND == 'openwebui') {
    //     ret = ['qwen3', 'gpt-oss:20b']
    //   }
    //   this.modelsList = ret
    //   return ret
    // },
    async fetchModelsList() {
      let ret = []
      let res = await this.sendToService('models')
      if (res?.data) {
        ret = res.data.map(modelInfo => modelInfo.id)
      }
      this.modelsList = ret
      return ret
    },
    requestVideoJumpToSelectedFeature(play=false) {
      if (this.selectedFeature) {
        this.requestVideoJumpInTimeCode(this.selectedFeature.video_start, play)
      }
    },
    async onQuestionEnter() {
      await this.sendPrompt()
    },
    updateQueryString() {
      // const url = new URL(window.location);
      // url.searchParams.set('q', this.settings.question.value);
      // url.searchParams.set('model', this.settings.model.value);
      // window.history.replaceState({}, '', url);
    },
    async sendPrompt() {
      // const prompt = document.getElementById("promptInput").value;
      // const responseElement = document.getElementById("response");
      // responseElement.textContent = "Loading...";
      let prompt = 'hello'

      this.updateQueryString()

      this.isResponding = true
      this.response = ''

      prompt = this.settings.template.value
      prompt = prompt.replace('{STATEMENT}', this.settings.statement.value)
      prompt = prompt.replace('{QUESTION}', this.settings.question.value)

      // let generate_url = this.settings.serviceUrl.value
      let generate_url = ''

      let body = {}
      if (INFERRENCE_BACKEND == 'ollama') {
        generate_url = 'generate'
        body = {
          model: this.settings.model, // Replace with your downloaded model name
          prompt: prompt,
          stream: false, // Set to true for streaming response
          options: {
            "num_ctx": CONTEXT_LENGTH,
            think: false,
          }             
        }
      }
      if (INFERRENCE_BACKEND == 'openwebui' || INFERRENCE_BACKEND == 'openai') {
        generate_url = 'chat/completions'
        // if (this.apiKey) {
        //   headers['Authorization'] = `Bearer ${this.apiKey}`
        // }
        body = {
          model: this.settings.model.value, // Replace with your downloaded model name
          messages: [{
            role: 'user',
            content: prompt
          }],
          stream: false, // Set to true for streaming response
          max_tokens: parseInt(this.settings.contextLength.value)
          // options: {
          //   "num_ctx": CONTEXT_LENGTH,
          //   think: false,
          // }             
        }
      }

      const res = await this.sendToService(generate_url, body)
      console.log(res)
      // const res = await fetch(generate_url, {
      //   method: "POST",
      //   headers: headers,
      //   body: JSON.stringify(body),
      // });


      // if (INFERRENCE_BACKEND == 'ollama') {
      //   this.response = data?.response || ''
      // } else {
      //   this.response = data?.choices[0]?.message?.content || ''
      // }
        
      if (this.message.level === 'info') {
        this.response = res?.choices[0]?.message?.content || ''
      } else {
        this.response = ''
      }

      nextTick(() => {
        window.tippy('[data-tippy-content]');
      })

      this.isResponding = false
    },
    setMessage(message, level='info') {
      // levels: info|success|warning|danger
      this.message.content = message
      this.message.level = level
    }
  }
}).mount('#app')
