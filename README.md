# Algorithmic Justice

KDL components for the Algorithmic Justice research project.

[Research prototypes](https://kingsdigitallab.github.io/algorithmic-justice/).

# Interfaces

The web application has three prototypes, each one on a separate screen.

1. A **questionnaire** about a driver's statement that can be answered by a magistrate or a large language model (LLM).
2. A **highlighter** to ask a LLM to highlight passages in the driver statement which are relevant to the users query.
3. An **integrated prototype** that lets a magistrate select cases to consult the automated answers to predefined questions from a LLM and the resulting fine calculated with an algorithm from the answers and the driver's weekly wage.

# Interacting with LLMs

By default the application use **cached** responses from LLMs. 

If you want to prompt live LLMs, 
you'll need to select the URL of an LLM inference platform in the setting screen 
and paste your API token.

If your machine has a GPU, 
you can install and use a [local Ollama platform](https://ollama.com/), 
usually at `http://localhost:11434/v1`. After installation, type 
`ollama pull qwen3.5:4b` to download that particular LLM. 
Check the [Ollama models list on their site](https://ollama.com/search) 
to see what else you can download.

You can use [KCL e-Research (ER) AI Hub](https://ai.create.kcl.ac.uk/) 
if you are a KCL staff member.
That platform URL is `https://api.ai.create.kcl.ac.uk/v1`.
Note that you will need to access it through ER VPN and 
[create your own API Key](https://ai.create.kcl.ac.uk/dashboard/api-keys/create):

Another simple option is to use the [OpenRouter platform](https://openrouter.ai/) 
which is a third-party service that offers a large number of paid-for and free models.
All you need is to create an account and an API key.

If everything goes well, you can return to the 'Highlighter' or 'Highlighter'
tab and ask a question to the language model.

# Running the application on your local machine

First clone this repository.

## Install dependencies

```bash
cd app
npm ci
```

## Start the web interfaces

```bash
cd app
npm start
```

Then visit the index page at `http://localhost:3000` to access the prototypes.

# Data and tools

* [`settings.mjs`](app/settings.mjs): application-wide settings, such as API URLs and prompt templates for the LLM. `SETTINGS` is a special structure which values can be temporarily edited in the browser on the settings tab of the first prototype before prompting the LLMs.

* [`app-data.json`](app/data/app-data.json): contains the questionnaire, with algorithmic effect of each yes answer, the sample cases, and buckets indexed by the sum of effects from questionnaire and the the ratio applied to the monthly wage to calcualte the fine.

* [`responses.json`](app/data/responses.json): contains all the cached responses from the LLM for every combination of question and case in the questionnaire. 

* [`cache.mjs`](tools/cache.mjs): a command line tool to get live responses from the LLM for every combination of question and case in the questionnaire and save them in `responses.json`.
