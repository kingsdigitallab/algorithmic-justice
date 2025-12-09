# Algorithmic Justice

KDL components for the Algorithmic Justice research project.

[Experimental interface](https://kingsdigitallab.github.io/algorithmic-justice/nlpui.html).

# Requirements

The interface requires an API Key to interact with large language models (LLM) hosted by KCL e-Research (ER).

If you are a KDL member of staff you can generate your own API Key like this:
1. Go to [the LLM platform hosted by ER](https://ai.create.kcl.ac.uk/)
2. Click the account icon in the top right corner of the screen: a drop down menu appears
3. Click 'Settings' in the menu; a Setting model appears
4. Click Account on the left hand side
5. click "Generate New API Key" near the bottom of the modal
6. copy the key and paste it in a private place for future referrence. Do not share it with anyone
7. Now you can paste that API Key in the Settings Tab of [the natural language processing application](https://kingsdigitallab.github.io/algorithmic-justice/nlpui.html) developped by KDL

# Local set up

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

