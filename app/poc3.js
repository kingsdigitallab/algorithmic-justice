/*
TODO:

DONE case selection
DONE show case
DONE show penalty
DONE table
DONE draw LLM responses from cache
DONE explaination
DONE highlights
C summary 
DONE highlights snippets
DONE show algorithm
C polish interface

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
      // modelsList: [],
      areDetailsShown: true,
      isAlgorithmExplained: false,
      // model: null,
      // modelSecondary: null,
      hoveredQuestion: null,
      selectedQuestion: null,
      // maps `${CASEKEY}${QUESTIONTEXT}` to a score given by user (default=score for the LLM answer)
      userScores: {},
    }
  },
  async mounted() {
    this.initSettings()

    this.engine = new CachedInferenceEngine({
      serviceUrl: this.settings.serviceUrl.value,
      apiKey: this.settings.apiKey.value,
      // model: this.model,
      contextLength: this.settings.contextLength.value,
    })
    await this.engine.loadCache('data/responses.json')
    
    this.selectModel()
    this.selectModel(true)

    await this.loadQuestionnaire()

    await this.initService()    
  },
  computed: {
    model() {
      return this.settings.model.value
    },
    modelSecondary() {
      return this.settings.modelSecondary.value
    },
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
      let response = this.hoveredQuestion?.llmResponse || this.selectedQuestion?.llmResponse
      let ret = this.highlightText(
        this.selectedCase?.statement, 
        response?.highlights ?? []
      )
      this.enableNewTooltips('#statement span.passage')
      return ret
    },
    reviewRows() {
      let ret = []
      for (let qst of this?.questionnaire?.questions ?? []) {
        let response = this.getResponse(qst)
        let responseSecondary = this.getResponse(qst, true)

        let score = response?.answer === 'yes' ? qst.effect : 0
        this.userScores[this.caseKey+qst.text] = Number(this.userScores[this.caseKey+qst.text] || score)
        
        ret.push({
          text: qst.text,
          answer: response?.answer ?? 'undefined',
          answerSecondary: responseSecondary?.answer ?? 'undefined',
          score: this.userScores[this.caseKey+qst.text],
          llmResponse: response
        })
      }

      this.enableNewTooltips()

      return ret
    },
    caseKey() {
      return this.questionnaire.selectedCaseKey
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
    sortedBuckets() {
      let keys = Object.keys(this.questionnaire.buckets).sort((a, b) => Number(a) - Number(b))
      let ret = []
      for (let k of keys) {
        ret.push({...this.questionnaire.buckets[k], total: k})
      }
      return ret
    },
    sortedEffects() {
      let keys = Object.keys(this.questionnaire.effectsLabel).sort((a, b) => Number(a) - Number(b))
      let ret = []
      for (let k of keys) {
        ret.push({
          value: k,
          label: this.questionnaire.effectsLabel[k]
        })
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
    undeterminedWarningMessage() {
      let ret = ''
      let answersIndexes = []

      for (const [i, row] of this.reviewRows.entries()) {
        if (!['yes', 'no'].includes(row.answer)) {
          answersIndexes.push(i+1)
        }
      }

      let questionForm = 'question' + (answersIndexes.length > 1 ? 's' : '');

      if (answersIndexes.length) {
        let lastIndex = answersIndexes.pop()
        let questionsStr = answersIndexes.join(', ')
        if (questionsStr) {
          questionsStr += ` and `
        }
        questionsStr += lastIndex
        ret = `⚠️ Warning: the tool could not resolve ${questionForm} ${questionsStr} confidently.`
      }

      return ret
    }
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
        // this.modelsList = [...this.engine.models]
      } catch (error) {
        this.isServiceWorking = false
        this.setMessage(error.message, 'danger')
      }
      this.isResponding = false
      // this.updateModelsListFromCachedResponses()
    },
    // updateModelsListFromCachedResponses() {
    //   // TODO: deduped this code from nlpui.js
    //   // even if no model engine is available 
    //   // we want the user to access the cached responses
    //   this.modelsList = [...this.modelsList, ...this.engine?.getCachedModels() ?? []]
    // },
    async selectModel(secondary=false) {
      let models = await this.engine.fetchModels()
      const modelRank = 'model' + (secondary ? 'Secondary' : '')
      const modelCandidates = [
        this.settings[modelRank].value,
        this.settings[modelRank].default,
        secondary ? 1 : 0,
      ]
      for (let model of modelCandidates) {
        console.log(model)
        if (typeof model === 'number') {
          model = models[model]
        }
        if (!models.includes(model)) {
          continue
        }
        this.settings[modelRank].value = model
        break
      }
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
    getEffectLabelFromQuestion(question) {
      let defaultLabel = this.questionnaire.effectsLabel['0']
      return this.questionnaire.effectsLabel[question.score] || defaultLabel
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
    onClickExplainAlgorithm() {
      this.isAlgorithmExplained = !this.isAlgorithmExplained
    },
    onHoverQuestion(question) {
      this.hoveredQuestion = question
    },
    onUnhoverQuestion(question) {
      this.hoveredQuestion = null
    },
    onClickQuestion(question) {
      this.selectedQuestion = question
    },
    enableNewTooltips(selector) {
      selector = selector || ''
      nextTick(() => {
        window.tippy(`${selector}[data-tippy-content]`);
      })
    },
    getResponse(question, useSecondaryModel=false) {
      let response = this.engine.getCachedResponseFromTemplate(
        this.settings.templateQuestionnaire.value, 
        {
          QUESTION: question.text, 
          STATEMENT: this.selectedCase.statement
        },
        useSecondaryModel ? this.modelSecondary : this.model, 
      )
      return this.engine.parseObject(response?.response)
    },
  }
}).mount('#app')
