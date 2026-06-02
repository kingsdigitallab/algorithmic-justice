/*
TODO:

DONE case selection
DONE show case
DONE show penalty
DONE table
DONE draw LLM responses from cache
S explaination
C highlights
C summary 
W highlights snippets
W show algorithm
W polish interface

S dedupe code (with nlpui.js)
*/
const { createApp, nextTick } = window.Vue;
import CachedInferenceEngine from './cached-inference-engine.mjs'

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
      settings: window.SETTINGS,
      message: {
        content: '',
        level: 'info',
      },
      isResponding: false,
      isServiceWorking: false,
      questionnaire: {},
      modelsList: [],
      areDetailsShown: false,
    }
  },
  async mounted() {
    this.initSettings()

    this.engine = new CachedInferenceEngine({
      serviceUrl: this.settings.serviceUrl.value,
      apiKey: this.settings.apiKey.value,
      model: this.settings.model.value,
      contextLength: this.settings.contextLength.value,
    })

    await this.loadQuestionnaire()

    await this.initService()    
  },
  computed: {
    selectedCase() {
      let ret = null
      if (this?.questionnaire?.cases) {
        ret = this.questionnaire.cases[this.questionnaire.selectedCaseKey] ?? null
      }
      return ret
    },
    highlightedQuestionnaireStatement() {
      // let ret = this.questionnaire.questions[this.questionnaire.selectedQuestionIndex]?.text
      // let response = this.getLLMResponseToQuestionnaire(questionText)
      let response = null
      let ret = this.highlightText(
        this.selectedCase?.statement, 
        response?.highlights ?? []
      )
      return ret
    },
    reviewRows() {
      let ret = []
      for (let qst of this?.questionnaire?.questions ?? []) {
        let response = this.engine.getCachedResponseFromTemplate(
          this.settings.templateQuestionnaire.value, 
          {
            QUESTION: qst.text, 
            STATEMENT: this.selectedCase.statement
          }
        )
        response = this.engine.parseObject(response?.response)
        ret.push({
          text: qst.text,
          answer: response?.answer ?? 'undefined',
          score: response?.answer === 'yes' ? qst.effect : 0,
        })
      }
      return ret
    },
    totalScore() {
      let ret = 0
      for (let r of this.reviewRows) {
        ret += r.score
      }
      return ret
    },
    bucket() {
      let ret = null
      if (this.questionnaire.buckets) {
        ret = this.questionnaire.buckets[this.totalScore]
      }
      return ret
    },
    penalty() {
      let ret = null
      let bucket = this.bucket
      if (bucket !== null) {
        ret = (this.selectedCase?.weeklyWage ?? 0) * bucket.ratio
      }
      return ret
    },
  },
  methods: {
    initSettings() {
      // TODO: deduped this code from nlpui.js
      const params = new URLSearchParams(window.location.search);

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
    async loadQuestionnaire() {
      // TODO: deduped this code from nlpui.js
      let res = await loadJson('data/app-data.json')
      if (res) {
        await this.engine.loadCache('data/responses.json')
        
        this.questionnaire = res
        this.questionnaire.selectedQuestionIndex = null
        // let responses = await loadJson('data/responses.json')
        // this.responses = responses
      }
    },
    async initService() {
      // TODO: deduped this code from nlpui.js
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
      // TODO: deduped this code from nlpui.js
      // even if no model engine is available 
      // we want the user to access the cached responses
      this.modelsList = [...this.modelsList, ...this.engine?.getCachedModels() ?? []]
    },
    setMessage(message, level='info') {
      // TODO: deduped this code from nlpui.js
      // levels: info|success|warning|danger
      this.message.content = message
      this.message.level = level
    },
    getTitleFromCase(acase) {
      let nameParts = acase.name.split(/\s/)
      return `${acase.incidentDate} - ${nameParts[1]} ${nameParts[0][0]}.`;
    },
    highlightText(text, highlights) {
      // TODO: deduped this code from nlpui.js
      let ret = text ?? ''
      let invalidPassages = 0
      for (let highlight of highlights ?? []) {
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
      // if (invalidPassages) {
      //   this.setMessage(`${invalidPassages} passage(s) returned by the LLM are not verbatim`, 'danger')
      // }
      return ret
    },
    onClickShowDetails() {
      this.areDetailsShown = true
    },
  }
}).mount('#app')
