/*
TODO:

Questionnaire (MVP):
DONE populate json file
DONE load json file
S reset magistrate answer on load
DONE aknowledge yes/no/under answers
DONE show content on the tab
DONE magistrate choices: yes, no, undetermined, ask ai
DONE buttons to get one LLM response at a time
M. CACHING! Seek LLM answer only if not in data already
DONE show answer
DONE. show reason
. show highlights
S button to export questionnaire data to json format
. add question numbers
DONE more space b/w buttons

Questionnaire (Edit):
. add an edit switch in the settings (only if token is valid)
. edit statement
. edit questions

Scoring algorithm?
. should we show the scores?
*/
const { createApp, nextTick } = window.Vue;

// const INFERRENCE_URL = "http://localhost:11436/api/"
// const INFERRENCE_BACKEND = 'ollama'
// const INFERRENCE_URL = "https://ai.create.kcl.ac.uk/api/"
// const INFERRENCE_BACKEND = 'openwebui'
const INFERRENCE_BACKEND = 'openai'


// const MODEL = "gemma3:12b" // can't disable thinking, which takes a lot of tokens and time
// const MODEL = "gemma3:4b"

const CONTEXT_LENGTH = 4000

const DELAY_IN_SECONDS_FOR_CACHED_RESPONSES = 2

function camelToSpaceCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (match) => match.toUpperCase());
}

// Source - https://stackoverflow.com/a
// Posted by esmiralha, modified by community. See post 'Timeline' for change history
// Retrieved 2026-01-27, License - CC BY-SA 4.0
const generateHash = (string) => {
  let hash = 0;
  for (const char of string) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0; // Constrain to 32bit integer
  }
  return hash;
};

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

function delay(seconds) {
  // usage: await delay(2000)
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
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
        'questionnaire': {
          'title': 'Questionnaire',
        },
        'highlighter': {
          'title': 'Highlighter',
        },
        'settings': {
          'title': 'Settings',
        }
      },
      selectedTab: 'questionnaire',
      questionnaire: {
        statement: '',
        questions: [
          '',
        ],
        responses: [
          {
            question: '',
            answer: '',
            reason: '',
            highlights: [
                {
                  passage: '',
                  reason: '',
                },
            ],
          }
        ],
        model: '',
      }
      // selectedTab: 'settings',
    }
  },
  async mounted() {
    this.initSettings()

    await this.loadQuestionnaire()

    await this.initService()
    
    // if (this.isServiceWorking) {
    //   this.sendHighlightPrompt()
    // }
  },
  computed: {
    settingsFiltered() {
      let ret = {}

      return ret  
    },
    higlightedText() {
      let ret = this.settings.statement?.value ?? ''
      let invalidPassages = 0
      for (let highlight of this.highlights) {
        let lengthBefore = ret.length
        ret = ret.replaceAll(highlight.passage, `<span class="passage" data-tippy-content="${highlight.reason}">${highlight.passage}</span>`)
        if (lengthBefore === ret.length) {
          invalidPassages += 1
        }
      }
      ret = ret.replaceAll('\n', '<br>')
      if (invalidPassages) {
        this.setMessage(`${invalidPassages} passage(s) returned by the LLM are not verbatim`, 'danger')
      }
      return ret
    },
    highlightedQuestionnaireStatement() {
      let ret = this.questionnaire?.statement ?? ''
      let invalidPassages = 0
      let highlightedPart = this.questionnaire?.selectedPart
      if (highlightedPart && highlightedPart[this.settings.model.value]) {
        for (let highlight of highlightedPart[this.settings.model.value]?.highlights ?? []) {
          let lengthBefore = ret.length
          ret = ret.replaceAll(highlight.passage, `<span class="passage" data-tippy-content="${highlight.reason}">${highlight.passage}</span>`)
          if (lengthBefore === ret.length) {
            invalidPassages += 1
          }
        }
      }
      ret = ret.replaceAll('\n', '<br>')
      if (invalidPassages) {
        this.setMessage(`${invalidPassages} passage(s) returned by the LLM are not verbatim`, 'warning')
      }
      return ret
    },
    highlights() {
      return this.getArrayFromLLMResponse(this.response)
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
    isReadyForQuestions() {
      return this.isServiceWorking && this.isSelectedModelAvailable
    },
    isSelectedModelAvailable() {
      return this.modelsList.includes(this.settings.model.value)
    },
  },
  methods: {
    getLLMResponseToQuestionnaire(part) {
      return part[this.settings.model.value]
    },
    canShowLLMResponseForQuestionnaire(part) {
      // only show if the response for that part exists
      // AND 
      // the magistrate asked to see it
      return part?.magistrate?.askedAI && part[this.settings.model.value]?.answer
    },
    getArrayFromLLMResponse(response) {
      return this.getArrayOrObjectFromLLMResponse(response)
    },
    getObjectFromLLMResponse(response) {
      return this.getArrayOrObjectFromLLMResponse(response, true)
    },
    getArrayOrObjectFromLLMResponse(response, isObject=false) {
      let ret = isObject ? {} : []
      if (response) {
        let res = response.replace('```json', '').replace('```', '').trim()
        let bracketPairs = [
          ['[', ']'],
          ['{', '}']
        ]
        let bracketPair = bracketPairs[isObject ? 1 : 0]
        let isWellFormed = false
        if (res.startsWith(bracketPair[0]) && res.endsWith(bracketPair[1])) {
          try {
            ret = JSON.parse(res)
            isWellFormed = true
          } catch (error) {
            console.log(error.message)
          }
        }
        if (!isWellFormed) {
          this.setMessage(`Response from LLM is malformed`, 'danger')
        }
      }
      return ret
    },
    async loadQuestionnaire() {
      let res = await loadJson('data/pleas/questionnaire.json')
      if (res) {
        this.questionnaire = res
        // reset all the magistrate metadata
        for (let part of res.parts) {
          part.magistrate = {
            answer: "",
            askedAI: false,
          }
        }
        this.questionnaire.selectedPart = null
      }
    },
    getInputClass(settingKey) {
      let ret = 'is-normal'
      if (settingKey == 'serviceUrl' && !this.isServiceWorking) {
        ret = 'is-danger'
      }
      if (settingKey == 'model' && !this.isSelectedModelAvailable) {
        ret = 'is-danger'
      }
      return ret
    },
    getModelsList() {
      return this.modelsList
    },
    async initService() {
      this.setMessage('')
      let res = await this.fetchModelsList()
      this.isServiceWorking = (res && res?.length > 0)
      
      this.updateModelsListFromCachedResponses()
    },
    updateModelsListFromCachedResponses() {
      // even if no model engine is available 
      // we want the user to access the cached responses
      for (let part of this.questionnaire.parts) {
        let cachedModels = Object.keys(part).filter(p => !(['question', 'magistrate'].includes(p)))
        for (let model of cachedModels) {
          if (!this.modelsList.includes(model)) {
            this.modelsList.push(model)
          }
        }
      }
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

      if (!fullPath.includes('/')) {
        // dummy path, e.g. 'CACHED'
        this.setMessage('No model service selected', 'warning')
      } else {
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

        if ([200, 404, 400].includes(res?.status)) {
          try {
            const data = await res.json();

            if (data?.error?.message) {
              this.setMessage(`Processing error (${data.error.message}).`, 'danger')
            } else {
              if (res?.status == '200') {
                ret = data
              } else {
                if (data.detail) {
                  this.setMessage(`Processing error (${data.detail}).`, 'danger')
                } else {
                  this.setMessage(`Processing error (unknown).`, 'danger')
                }
              }
            }
          } catch (error) {
            this.setMessage(`Processing error (${error.message}). Check address or access to model server in the Settings tab.`, 'danger')
          }
          // responseElement.textContent = data.response;
          // console.log(data)
        }
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
          if (Array.isArray(setting.lookup)) {
            setting.lookupMethod = () => setting.lookup
          } else {
            setting.lookupMethod = this[setting.lookup]
          }
          setting.type = 'select'
        }
        if (setting.inQueryString) {
          setting.value = params.get(settingKey) ?? setting.value
        } else {
          setting.value = sessionStorage.getItem(settingKey) ?? setting.value
        }
      }
    },
    onClickTab(tabKey) {
      this.selectedTab = tabKey
    },
    async onChangedSetting(settingKey, dontInitService=false) {
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

      if (!dontInitService && settingKey === 'serviceUrl' || settingKey === 'apiKey') {
        await this.initService()
      }

      if (settingKey === 'model') {
        // hide the LLM response to all parts of the questionnaire
        for (let part of this.questionnaire.parts) {
          part.magistrate.askedAI = false
        }
        this.questionnaire.selectedPart = null
      }
    },
    async fetchModelsList() {
      let ret = []
      if (this.settings.serviceUrl.value.includes('/')) {
        let res = await this.sendToService('models')
        if (res?.data) {
          ret = res.data.map(modelInfo => modelInfo.id)
        }
      }
      this.modelsList = ret
      return ret
    },
    async onHighlightQuestionEnter() {
      this.onChangedSetting('question')

      await this.sendHighlightPrompt()
    },
    async sendHighlightPrompt() {
      let prompt = this.settings.template.value
      prompt = prompt.replace('{STATEMENT}', this.settings.statement.value)
      prompt = prompt.replace('{QUESTION}', this.settings.question.value)

      let res = await this.sendPrompt(prompt)

      this.response = res
    },
    async sendQuestionnairePrompt(part) {
      let prompt = this.settings.templateQuestionnaire.value
      prompt = prompt.replace('{STATEMENT}', this.questionnaire.statement)
      prompt = prompt.replace('{QUESTION}', part.question)

      let cachedResponse = part[this.settings.model.value]

      let inputHash = generateHash(`${prompt}`)

      if (!cachedResponse?.answer || cachedResponse?.inputHash !== inputHash) {
        let res = await this.sendPrompt(prompt)

        let structuredResponse = this.getObjectFromLLMResponse(res, true)

        if (structuredResponse?.answer) {
          structuredResponse.inputHash = inputHash
          part[this.settings.model.value] = structuredResponse
        } else {
          delete part[this.settings.model.value]
        }
      } else {
        this.isResponding = true
        this.setMessage(`Model server is processing your request...`)
        await delay(DELAY_IN_SECONDS_FOR_CACHED_RESPONSES)
        this.setMessage('')
        this.isResponding = false
        console.log('Response already cached')
      }
      
      if (part[this.settings.model.value]?.answer) {
        part.magistrate.askedAI = true
        this.questionnaire.selectedPart = part
      }
    },
    async sendPrompt(prompt) {
      let ret = ''

      this.isResponding = true
      this.response = ''

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
        // this.response = res?.choices[0]?.message?.content || ''
        ret = res?.choices[0]?.message?.content || ''
      } else {
        // this.response = ''
      }

      nextTick(() => {
        window.tippy('[data-tippy-content]');
      })

      this.isResponding = false

      return ret
    },
    setMessage(message, level='info') {
      // levels: info|success|warning|danger
      this.message.content = message
      this.message.level = level
    },
    async resetAllSettings() {
      for (let [settingKey, setting] of Object.entries(this.settings)) {
        setting.value = setting.default
        await this.onChangedSetting(settingKey, true)
      }

      await this.initService()
    },
    async copyQuestionnaireToClipboard() {
      await this.copyToClipboard(JSON.stringify(this.questionnaire, null, 2))
    },
    async copyToClipboard(content) {
      await navigator.clipboard.writeText(content);
    },
    onClickMagistrateOption(part, option) {
      part.magistrate.answer = option
    },
    onClickShowHighlights(part) {
      this.questionnaire.selectedPart = part
    },
  }
}).mount('#app')
