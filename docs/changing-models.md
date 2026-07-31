# How to change the large language model (LLM)

## On the Questionnaire and Highlighter

All the responses displayed on 
[the questionnaire and highlighter prototypes](https://kingsdigitallab.github.io/algorithmic-justice/nlpui.html) 
come from the same model selected in the Settings tab.

![Setting tab, model drop down](settings-model.png)

(You can ignore the "Secondary Model" dropdown in the settings)

By default the drop down is set to a particular model 
(`gemma3:4b` in this example).

You can select alternative models in the drop down 
then return to the Questionnaire 
and click the "Ask" button next to each question to see the response.

To save you from clicking all the Ask button 
you can also pre-render all the responses at once 
after changing a model
by pressing the "Show all responses" button 
at the bottom of the Settings screen 
then return to the Questionnaire tab.

![Settings tab, show all responses button](settings-show-all-responses.png)

Whenever you change a model 
its name is updated in the URL of the web page 
which may be visible in the address bar of your browser.
You can therefore bookmark, copy and share that address 
and the next time it is opened, that model will be pre-selected.

## On the integrated prototype

Similarly all responses displayed on 
[the integrated prototype](https://kingsdigitallab.github.io/algorithmic-justice/poc3.html) 
come from one model. 

The model name is mentioned under the algorthm section. 
To get there, click "Explain algorithm" button under the question table.

![model in poc3 web page](poc3-model.png)

There is no settings tab on this prototype 
because it is designed for end-users or tests.
An alternative model can be specified via the URL.

For instance, this URL [https://kingsdigitallab.github.io/algorithmic-justice/poc3.html?model=qwen3.6:27b](https://kingsdigitallab.github.io/algorithmic-justice/poc3.html?model=qwen3.6:27b) 
will select qwen3.6:27b and show its responses in the question table.

This allows you to share a link with other users or tester 
who will only see that particular model 
when the integrated prototype loads in their browser.

**Before sharing a link, please double check that it selects the desired model 
by opening it in your browser and verifying its name in the algorithm section**.

One way to obtain the link to the intergrated prototpye with the correct model
is to:
1. visit the Settings tab on the Questionnaire and Highlighter page;
2. select the desired model in the drop down;
3. click the link at the bottom of the Settings tab

![Settings link to integrated prototype](settings-link.png)

## Cached mode

By default all the prototypes work with *cached* responses from a small range of models.
Caching here means that a KDL developer has prompted models with all possible questions 
and saved their responses in a file. 
The user interface of the prototypes then fetches the responses from that file 
instead of a model server, which is:
* more cost effective (i.e. it's free), 
* more sustainable (i.e. it will still work in the future even if the model is decommissioned), 
* much more responsive (i.e. no delay for the end user)
* more reliable (i.e. no model server downtime or connection issue will disrupt a workshop or a testing session)
* much easier to configure (i.e. no service account, VPN, API key or other configuration)
* more secure (i.e. no risk of losing keys or exposing KCL LLM platform)

That caching mode is the default. 
When it is enabled you'll see the Service Url dropdown set to "CACHED".

<img width="436" height="362" alt="image" src="https://github.com/user-attachments/assets/c38eb41c-9b41-4dbb-a57a-491e278a9ba3" />

Caching also comes with some disadvantages. 
If a question changes or a new model is needed, 
a KDL developer has to prompt the model offline and add the responses to the cache.
In that mode the Highlighter only works with predefined queries.

It is technically feasible to update the cache with new models and questions
by using the prototype interface and github editorial interface.
But that process is a bit more involved. 
KDL can provide additional instructions for it if needed.

## Models

The models used in this prototype are on the smaller end of the range.
The number at the end of the name is the quantity of parameters.
For instance gemma3:4b has 4 billion parameters.
Which is considered very small. 
Smaller models will have less world knowledge 
and follow instructions will less nuance or accuracy 
(e.g. simple or sometimes poor reasoning; less ability to find passages in statement).

KDL can access models up to ~30 billion parameters on its own infrastructure.
For instance qwen3.6:27b. 
These are still considered small compared to leading LLMs 
which have hundreds (or thousands) of billions of parameters.
It's important to understand that there can be a considerable gap in 
output quality among small and larger models. 
However for relatively simple tasks based on small amount of textual input,
that gap is not always so pronounced.

## Live prompting

When a model server like 
[Openrouter](https://openrouter.ai/) 
or [KCL eResearch (ai.create.kcl.ac.uk)](ai.create.kcl.ac.uk)
is selected in the "Service Url" dropdown 
the prototypes will prompt the models directly without a cache. 
In that mode, the Highlighter will also allow the user to type their own query.

However to use those model providers you'll need to consult their website 
to find out how to obtain a personal API key which can then be pasted 
in the "API Key" input box in the Settings tab. It shouldn't take more than 10 minutes.
If all goes well the list of available models from the selected service will appear 
in the "Model" dropdown.

Both Openrouter and eResearch platforms offer free and low cost access to models.
OpenRouter has a very large selection whereas eResearch hosts three to four models
but with better support for staff and more secure policies for sensitive data.

## Where are the questions and other algorithmic parameters stored?

They can be found in this configuration file:

[app-data.json](https://github.com/kingsdigitallab/algorithmic-justice/blob/main/app/data/app-data.json)

The questionnaire is not editable via the interface, 
they can be changed in the file only. 
Each time the questionnaire changes the responses have to be 
computed and cached by a KDL developer. 
Note that the questionnaire and the cached responses 
are shared by between the Questionnaire tab 
and the Integrated prototype.

Whereas the other variables, such as the prompt templates,
visible on the Settings tab are stored in this file:

[settings.mjs](https://github.com/kingsdigitallab/algorithmic-justice/blob/main/app/settings.mjs)

Those settings can be temporarily changed in the Settings tab, 
but it won't affect the default values stored in the file.
When you reload the web page without special argument in the URL,
the settings are reset to their default.

Any change in those two files above will trigger 
an automatic rebuild of the website on github.
After a couple of minutes the changes will appear in the live interfaces
if you reload the page in your browser.
