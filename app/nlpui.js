/*
TODO:

Questionnaire (MVP):
DONE populate json file
DONE load json file
DONE reset magistrate answer on load
DONE aknowledge yes/no/under answers
DONE show content on the tab
DONE magistrate choices: yes, no, undetermined, ask ai
DONE buttons to get one LLM response at a time
DONE CACHING! Seek LLM answer only if not in data already
DONE show answer
DONE show reason
DONE show highlights
DONE button to export questionnaire data to json format
DONE add question numbers
DONE more space b/w buttons
DONE accept multiple statements
DONE ability to switch in the UI
DONE refactor the data model
DONE cache all responses with a button

Highlighter in cache mode:
DONE statement selection (drop down)
DONE cache responses
DONE read responses from cache first
DONE query selection (drop down in CACHE mode)
DONE clear latest responses and highlights when query or statement change
DONE fix tooltips not always shpwing

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

const AGENT_MAGISTRATE = 'magistrate'
// const MODEL = "gemma3:12b" // can't disable thinking, which takes a lot of tokens and time
// const MODEL = "gemma3:4b"

const SERVICE_CACHE = 'CACHED'

const CONTEXT_LENGTH = 4000

const TAB_HIGHLIGHTER = 'highlighter'

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

// Source - https://stackoverflow.com/a/3561711
// Posted by bobince, modified by community. See post 'Timeline' for change history
// Retrieved 2026-02-05, License - CC BY-SA 4.0
// RegExp.escape() support in browser started between 24Q4 and 25Q2
function escapeRegex(string) {
  if (RegExp.escape) {
    return RegExp.escape(string)
  } else {
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')
  }
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
      cachingMessage: '',
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
      // selectedTab: 'questionnaire',
      // selectedTab: 'settings',
      selectedTab: TAB_HIGHLIGHTER,
      questionnaire: {
        cases: {},
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
    highlighterQuestions() {
      let questions = this.settings.questions?.value ?? ''
      return questions.split('\n').map(l => l.trim()).filter(l => l.length > 2)
    },
    higlightedText() {
      let ret = this.highlightText(
        this.selectedQuestionnaireStatement, 
        this.highlights
      )
      // add highlights underneath for accessibility purpose, or taking screennshots
      if (this.response) {
        ret += '<hr><h4 class="title is-4">Highlights:</h4>'
        ret += '<div class="content">'
        ret += '<ul>'
        ret += this.highlights.map(h => `<li>"${h.passage}" (reason: ${h.reason})</li>`).join('')
        ret += '</ul>'
        ret += '<hr>'
        ret += `Answer: ${this.response.answer}<br>`
        ret += `Reason: ${this.response.reasoning}<br>`
        ret += '</div>'
      }
      return ret
    },
    selectedQuestionnaireStatement() {
      return this.questionnaire?.cases[this.questionnaire?.selectedCaseKey]?.statement ?? ''
    },
    selectedModel() {
      return this.settings?.model?.value ?? ''
    },
    highlightedQuestionnaireStatement() {
      let response = this.getLLMResponseToQuestionnaire(this.questionnaire.selectedQuestion)
      return this.highlightText(
        this.selectedQuestionnaireStatement, 
        response?.highlights ?? []
      )
    },
    highlights() {
      // return this.getArrayFromLLMResponse(this.response)
      return this.response?.highlights ?? []
    },
    isReadyForQuestions() {
      return this.isServiceWorking && this.isSelectedModelAvailable
    },
    isSelectedModelAvailable() {
      return this.modelsList.includes(this.selectedModel)
    },
  },
  watch: {
    'questionnaire.selectedCaseKey'() {
      this.response = null
    },
    'settings.question.value'() {
      this.response = null
    }
  },
  methods: {
    highlightText(text, highlights) {
      let ret = text ?? ''
      let invalidPassages = 0
      for (let highlight of highlights) {
        let lengthBefore = ret.length
        let passage = highlight.passage.replace(/^\W|\W$/g, '')
        ret = ret.replaceAll(
          new RegExp(escapeRegex(passage), 'gi'),
          `<span class="passage" data-tippy-content="${highlight.reason}">$&</span>`
        )
        if (lengthBefore === ret.length) {
          invalidPassages += 1
          console.log(`Passage not found in case (${this.questionnaire.selectedCaseKey}, ${this.questionnaire.selectedQuestion}): "${highlight.passage}"`)
        }
      }
      ret = ret.replaceAll('\n', '<br><br>')
      if (invalidPassages) {
        this.setMessage(`${invalidPassages} passage(s) returned by the LLM are not verbatim`, 'danger')
      }
      return ret
    },
    getLLMResponseToQuestionnaire(question) {
      return this.getQuestionnaireResponse(question)
    },
    canShowLLMResponseForQuestionnaire(question) {
      // only show if the response for that part exists
      // AND 
      // the magistrate asked to see it
      let magistrateResponse = this.getMagistrateResponse(question)
      let modelResponse = this.getQuestionnaireResponse(question)
      return magistrateResponse.askedAI && modelResponse.answer
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
      let res = await loadJson('data/app-data.json')
      let responses = await loadJson('data/responses.json')
      if (res) {
        this.questionnaire = res
        this.questionnaire.responses = responses
        // reset all the magistrate metadata
        for (const [inputHash, response] of Object.entries(responses)) {
          if (response.model === AGENT_MAGISTRATE) {
            response.answer = ""
            response.askedAI = false
          }
        }
        this.questionnaire.selectedQuestion = null
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
      return this.modelsList.sort()
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
      for (const [inputHash, response] of Object.entries(this.questionnaire.responses)) {
        // let cachedModels = Object.keys(part).filter(p => !(['question', 'magistrate'].includes(p)))
        if (response.model === AGENT_MAGISTRATE) continue;
        if (!this.modelsList.includes(response.model)) {
          this.modelsList.push(response.model)
        }
      }
    },
    getMagistrateResponse(question) {
      let ret = this.getQuestionnaireResponse(question, AGENT_MAGISTRATE)
      if (!ret?.askedAI) {
        ret.askedAI = false
        this.questionnaire.responses[ret.inputHash] = ret
      }
      return ret
    },
    getQuestionnaireResponse(question, model=null, promptTemplate=null) {
      model = model ?? this.selectedModel
      let hash = this.getInputHash(question, model, promptTemplate)
      let defaultResponse = {
        caseKey: this.questionnaire.selectedCaseKey,
        question: question,
        model: model,
        inputHash: hash,
        answer: '',
      }
      return this.questionnaire.responses[hash] ?? defaultResponse
    },
    getInputHash(question, model, promptTemplate=null) {
      let prompt = this.getQuestionnairePrompt(question, promptTemplate)
      return generateHash(`${model}-${prompt}`)
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
        for (let response of Object.values(this.questionnaire.responses)) {
          response.askedAI = false
        }
        this.questionnaire.selectedQuestion = null
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
    async sendHighlightPrompt(question=null) {
      question = question ?? this.settings.question.value
      this.response = await this.sendPromptOrGetFromCache(question, this.settings.templateHighlighter.value)
      nextTick(() => {
        window.tippy('[data-tippy-content]');
      })
    },
    getQuestionnairePrompt(question=null, promptTemplate=null) {
      question = question ?? this.questionnaire.selectedQuestion
      let ret = promptTemplate
      if (!ret) {
        ret = this.settings.templateQuestionnaire?.value ?? ''
      }
      ret = ret.replace('{STATEMENT}', this.selectedQuestionnaireStatement)
      ret = ret.replace('{QUESTION}', question)
      return ret
    },
    async sendQuestionnairePrompt(question) {
      let response = await this.sendPromptOrGetFromCache(question)
      if (response?.answer) {
        let magistrateResponse = this.getMagistrateResponse(question)
        magistrateResponse.askedAI = true
        this.questionnaire.selectedQuestion = question
        nextTick(() => {
          window.tippy('[data-tippy-content]');
        })
      }
    },
    async sendPromptOrGetFromCache(question, promptTemplate=null) {
      let cachedResponse = this.getQuestionnaireResponse(question, null, promptTemplate)

      if (!cachedResponse?.answer) {
        let prompt = this.getQuestionnairePrompt(question, promptTemplate)
        let res = await this.sendPrompt(prompt)

        let response = this.getObjectFromLLMResponse(res, true)

        if (response?.answer) {
          cachedResponse.answer = response?.answer ?? ''
          cachedResponse.highlights = response.highlights
          cachedResponse.reasoning = response?.reasoning ?? ''
          this.questionnaire.responses[cachedResponse.inputHash] = cachedResponse
        } else {
          delete this.questionnaire.responses[cachedResponse.inputHash]
        }
      } else {
        this.isResponding = true
        this.setMessage(`Model server is processing your request...`)
        if (!this.isServiceWorking) {
          await delay(DELAY_IN_SECONDS_FOR_CACHED_RESPONSES)
        }
        this.setMessage('')
        this.isResponding = false
        console.log('Response already cached')
      }
      
      return cachedResponse
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
      // this.questionnaire.selectedPart = null
      await this.copyToClipboard(JSON.stringify(this.questionnaire, null, 2))
    },
    async copyToClipboard(content) {
      await navigator.clipboard.writeText(content);
    },
    onClickMagistrateOption(question, option) {
      let response = this.getMagistrateResponse(question)
      response.answer = option
    },
    onClickShowHighlights(question) {
      this.questionnaire.selectedQuestion = question
    },
    async cacheAllResponses() {
      this.cachingMessage = '(caching...)'

      // questionnaire
      for (let caseKey of Object.keys(this.questionnaire.cases)) {
        this.questionnaire.selectedCaseKey = caseKey
        let questionIndex = 0
        for (let question of this.questionnaire.questions) {
          questionIndex += 1
          this.cachingMessage = `(Questionnaire - ${caseKey}, question ${questionIndex})`
          await this.sendQuestionnairePrompt(question)
        }
      }

      // highlighter
      for (let caseKey of Object.keys(this.questionnaire.cases)) {
        this.questionnaire.selectedCaseKey = caseKey
        let questionIndex = 0
        for (let question of this.highlighterQuestions) {
          questionIndex += 1
          this.cachingMessage = `(Highlighter - ${caseKey}, question ${questionIndex})`
          await this.sendHighlightPrompt(question)
        }
      }

      this.cachingMessage = '(done)'
      this.questionnaire.selectedCaseKey = Object.keys(this.questionnaire.cases)[0]
    },
    async removeCachedResponsesBySelectedModel() {
      let responseKeys = Object.keys(this.questionnaire.responses)
      for (let rk of responseKeys) {
        if (this.questionnaire.responses[rk].model === this.selectedModel) {
          delete this.questionnaire.responses[rk]
        }
      }
    },
  }
}).mount('#app')
