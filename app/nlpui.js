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
import InferenceEngine from './inference-engine.mjs'

// const INFERRENCE_URL = "http://localhost:11436/api/"
// const INFERRENCE_BACKEND = 'ollama'
// const INFERRENCE_URL = "https://ai.create.kcl.ac.uk/api/"
// const INFERRENCE_BACKEND = 'openwebui'
const AGENT_MAGISTRATE = 'magistrate'
// const MODEL = "gemma3:12b" // can't disable thinking, which takes a lot of tokens and time
// const MODEL = "gemma3:4b"

const SERVICE_CACHE = 'CACHED'

const TAB_HIGHLIGHTER = 'highlighter'

const DELAY_IN_SECONDS_FOR_CACHED_RESPONSES = 2

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
      engine: null,
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

    this.engine = new InferenceEngine({
      serviceUrl: this.settings.serviceUrl.value,
      apiKey: this.settings.apiKey.value,
      model: this.settings.model.value,
      contextLength: this.settings.contextLength.value,
    })

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
      let questionText = this.questionnaire.questions[this.questionnaire.selectedQuestionIndex]?.text
      let response = this.getLLMResponseToQuestionnaire(questionText)
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
          console.log(`Passage not found in case (${this.questionnaire.selectedCaseKey}, question ${this.questionnaire.selectedQuestionIndex}): "${highlight.passage}"`)
        }
      }
      ret = ret.replaceAll('\n', '<br><br>')
      if (invalidPassages) {
        this.setMessage(`${invalidPassages} passage(s) returned by the LLM are not verbatim`, 'danger')
      }
      return ret
    },
    getLLMResponseToQuestionnaire(questionText) {
      return this.getQuestionnaireResponse(questionText)
    },
    canShowLLMResponseForQuestionnaire(questionText) {
      // only show if the response for that part exists
      // AND 
      // the magistrate asked to see it
      let magistrateResponse = this.getMagistrateResponse(questionText)
      let modelResponse = this.getQuestionnaireResponse(questionText)
      return magistrateResponse.askedAI && modelResponse.answer
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
        this.questionnaire.selectedQuestionIndex = null
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
      this.isResponding = true
      try {
        await this.engine.fetchModels()
        this.isServiceWorking = this.engine.isWorking
        this.modelsList = [...this.engine.models]
      } catch (error) {
        this.isServiceWorking = false
        this.setMessage(error.message, 'danger')
      }
      this.isResponding = false
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
    getMagistrateResponse(questionText) {
      let ret = this.getQuestionnaireResponse(questionText, AGENT_MAGISTRATE)
      if (!ret?.askedAI) {
        ret.askedAI = false
        this.questionnaire.responses[ret.inputHash] = ret
      }
      return ret
    },
    getQuestionnaireResponse(questionText, model=null, promptTemplate=null) {
      model = model ?? this.selectedModel
      let hash = this.getInputHash(questionText, model, promptTemplate)
      let defaultResponse = {
        caseKey: this.questionnaire.selectedCaseKey,
        question: questionText,
        model: model,
        inputHash: hash,
        answer: '',
      }
      return this.questionnaire.responses[hash] ?? defaultResponse
    },
    getInputHash(questionText, model, promptTemplate=null) {
      let prompt = this.getQuestionnairePrompt(questionText, promptTemplate)
      return InferenceEngine.hash(`${model}-${prompt}`)
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

      if (['serviceUrl', 'apiKey', 'model', 'contextLength'].includes(settingKey)) {
        this.engine.updateConfig({ [settingKey]: setting.value })
      }

      if (!dontInitService && settingKey === 'serviceUrl' || settingKey === 'apiKey') {
        await this.initService()
      }

      if (settingKey === 'model') {
        // hide the LLM response to all parts of the questionnaire
        for (let response of Object.values(this.questionnaire.responses)) {
          response.askedAI = false
        }
        this.questionnaire.selectedQuestionIndex = null
      }
    },
    async onHighlightQuestionEnter() {
      this.onChangedSetting('question')
      await this.sendHighlightPrompt()
    },
    async sendHighlightPrompt(questionText=null) {
      questionText = questionText ?? this.settings.question.value
      this.response = await this.sendPromptOrGetFromCache(questionText, this.settings.templateHighlighter.value)
      nextTick(() => {
        window.tippy('[data-tippy-content]');
      })
    },
    getQuestionnairePrompt(questionText=null, promptTemplate=null) {
      questionText = questionText ?? this.questionnaire.questions[this.questionnaire.selectedQuestionIndex]?.text
      let ret = promptTemplate
      if (!ret) {
        ret = this.settings.templateQuestionnaire?.value ?? ''
      }
      ret = ret.replace('{STATEMENT}', this.selectedQuestionnaireStatement)
      ret = ret.replace('{QUESTION}', questionText)
      return ret
    },
    async sendQuestionnairePrompt(questionIndex) {
      let questionText = this.questionnaire.questions[questionIndex]?.text
      let response = await this.sendPromptOrGetFromCache(questionText)
      if (response?.answer) {
        let magistrateResponse = this.getMagistrateResponse(questionText)
        magistrateResponse.askedAI = true
        this.questionnaire.selectedQuestionIndex = questionIndex
        nextTick(() => {
          window.tippy('[data-tippy-content]');
        })
      }
    },
    async sendPromptOrGetFromCache(questionText, promptTemplate=null) {
      let cachedResponse = this.getQuestionnaireResponse(questionText, null, promptTemplate)

      if (!cachedResponse?.answer) {
        let prompt = this.getQuestionnairePrompt(questionText, promptTemplate)
        let res = await this.sendPrompt(prompt)

        let response = this.engine.parseObject(res)

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
          await InferenceEngine.delay(DELAY_IN_SECONDS_FOR_CACHED_RESPONSES)
        }
        this.setMessage('')
        this.isResponding = false
        console.log('Response already cached')
      }
      
      return cachedResponse
    },
    async sendPrompt(prompt) {
      this.isResponding = true
      this.response = ''
      this.setMessage('Model server is processing your request...')
      try {
        const ret = await this.engine.sendPrompt(prompt)
        if (this.message.level === 'info') {
          this.setMessage('')
        }
        return ret
      } catch (error) {
        this.setMessage(error.message, 'danger')
        this.response = ''
        return ''
      } finally {
        this.isResponding = false
      }
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
    onClickMagistrateOption(questionText, option) {
      let response = this.getMagistrateResponse(questionText)
      response.answer = option
    },
    onClickShowHighlights(questionIndex) {
      this.questionnaire.selectedQuestionIndex = questionIndex
    },
    async cacheAllResponses() {
      this.cachingMessage = '(caching...)'

      // questionnaire
      for (let caseKey of Object.keys(this.questionnaire.cases)) {
        this.questionnaire.selectedCaseKey = caseKey
        let questionIndex = 0
        for (let question of this.questionnaire.questions) {
          questionIndex += 1
          this.cachingMessage = `(Questionnaire - ${caseKey}, questionText ${questionIndex})`
          await this.sendQuestionnairePrompt(questionIndex - 1)
        }
      }

      // highlighter
      for (let caseKey of Object.keys(this.questionnaire.cases)) {
        this.questionnaire.selectedCaseKey = caseKey
        let questionIndex = 0
        for (let questionText of this.highlighterQuestions) {
          questionIndex += 1
          this.cachingMessage = `(Highlighter - ${caseKey}, questionText ${questionIndex})`
          await this.sendHighlightPrompt(questionText)
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
