const DEFAULT_TEMPLATE = `TASK:
You'll find below a STATEMENT and a QUESTION related to it.
The STATEMENT is a plea from a road offender.
The QUESTION is from a magistrate trying to quickly find clues in the STATEMENT.
Generate a response in valid JSON. 
You response should contain a list of relevant passages from the statement
and one very short sentence to explain your selection.
The response is therefore an array of passage objects. 
Each passage object has two keys: 
* 'passage': it must be exactly as it occurs in the statement, it can be part of a sentence
* 'reason': reason for selecting that passage

Try to be optimal in your selection. 
Find all relevant passages but only include fragments of sentences which pertains to the question.
Make sure your selection and reason are logically rigorous and impartial.
Avoid overlapping passages.

STATEMENT:
{STATEMENT}

QUESTION:
{QUESTION}

RESPONSE:
`

let DEFAULT_STATEMENT = `
I fully acknowledge that I failed to give way at the mini-roundabout on Deansgate, 
and I deeply regret the momentary lapse in concentration that led to this incident. 
The conditions that evening were challenging: heavy rain reduced visibility, 
and my sat-nav—usually reliable—was malfunctioning, which distracted me 
as I approached the junction. While I am familiar with the area, the hired 
vehicle’s unfamiliar braking system required more force than I anticipated, 
causing me to hesitate just as I needed to react. I accept that, regardless 
of these factors, the responsibility for safe driving lies with me, 
and I should have been more vigilant.

My driving record speaks to my commitment to road safety. 
In twelve years of driving, I have never received a penalty 
or been involved in an accident. I have always prided myself 
on my attentiveness, especially in urban areas, 
and I am genuinely upset that my standards slipped on this occasion. 
I immediately reported the sat-nav issue to the hire company 
and have since invested in a more reliable model. 
I also took the initiative to revisit the Highway Code, 
particularly the sections on roundabouts and priority rules, 
to ensure my understanding is up to date.

I want to be clear that I do not seek to excuse my actions, 
but to provide context. The combination of fatigue after a long workday, 
the technical issue with the sat-nav, and the unfamiliar vehicle 
created a perfect storm for error. I have learned from this experience 
and have already taken steps to mitigate such risks in the future, 
including planning more frequent breaks on long drives 
and familiarizing myself with any hired vehicle’s controls 
before setting off.

Given my previously unblemished record 
and the proactive measures I have taken, I respectfully ask the magistrates 
to consider this a one-off error rather than a pattern of reckless behaviour. 
I would welcome the opportunity to attend a driver improvement course 
to further reinforce my knowledge and skills. I hope you will recognize 
my genuine remorse and the evidence of my otherwise responsible driving 
history in your deliberations.
`

DEFAULT_STATEMENT = DEFAULT_STATEMENT.replaceAll(/\n\s*\n/g, 'BREAK').replaceAll('\n', '').replaceAll('BREAK', '\n\n')

const SETTINGS = {
  question: {
    default: 'technical defects',
    inQueryString: true,
  },
  model: {
    // default: "gpt-oss:20b",
    default: "gemma3n:latest",
    inQueryString: true,
    lookup: 'getModelsList',
  },
  serviceUrl: {
    //default: "https://ai.create.kcl.ac.uk/api/",
    default: "http://localhost:11434/v1",
    inQueryString: true,
  },
  apiKey: {
    default: '',
    type: 'password',
  },
  contextLength: {
    default: 4000,
  },
  statement: {
    default: DEFAULT_STATEMENT,
    type: 'textarea',
  },
  template: {
    default: DEFAULT_TEMPLATE,
    type: 'textarea',
  },
}

window.SETTINGS = SETTINGS