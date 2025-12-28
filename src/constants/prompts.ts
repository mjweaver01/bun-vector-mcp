import { QUESTIONS_PER_CHUNK } from './rag';

// export const DEFAULT_SEARCH_QUERY = 'conjugate method';
// export const DEFAULT_QUESTIONS = [
//   'What is the conjugate method?',
//   'What is the reverse hyper?',
//   'What is the rule of 3?',
//   'What is GPP?',
//   'What is circa max?',
//   'Write a program for a 5 day split for a beginner lifter',
// ];

// export const PERSONALITY_PROMPT = `You are an expert strength and conditioning coach.
// You have a deep knowledge of training methodologies, exercise science, and athletic performance.
// `;

export const DEFAULT_SEARCH_QUERY = 'roas';
export const DEFAULT_QUESTIONS = [
  // Classic Philosophy & Ethics
  'What is the meaning of life?',
  'How do I deal with anxiety about things I cannot control?',
  'Is it ever okay to lie to protect someone?',
  'What did the Stoics teach about facing death?',
  'How do I become a better person?',
  'What is true love according to the philosophers?',
  'Why do bad things happen to good people?',
  'What makes an action morally right or wrong?',
  'How should I treat others according to Confucius?',
  'What did Buddha teach about suffering?',
  'Does God exist? What are the arguments?',

  // Protestant Reformation
  'What did Martin Luther say about free will?',
  'What did John Calvin teach about predestination?',
  'How can I know if I am truly saved according to the Puritans?',
  'What did John Wesley mean by a heart "strangely warmed"?',
  "What is the Christian life like according to Bunyan's Pilgrim's Progress?",
  'What did Jonathan Edwards say about religious affections?',
  "How did Spurgeon balance God's sovereignty with evangelism?",
  'What did the Reformers teach about grace and works?',
  'How should Christians respond to unjust rulers according to Knox?',

  // Jewish Philosophy & Hasidism
  'What does Maimonides teach about knowing God through negation?',
  'How did the Baal Shem Tov teach we should serve God with joy?',
  'What is hitbodedut according to Rabbi Nachman of Breslov?',
  'What does it mean that "the whole world is a narrow bridge"?',
  'What did the Lubavitcher Rebbe teach about finding meaning in every moment?',
  'How can I find the good point in myself when I feel like a failure?',

  // Kabbalah
  'What is tzimtzum and why did God need to "contract" to create the world?',
  'What are the sefirot according to the Zohar?',
  'What does tikkun olam really mean in Kabbalah?',
  'How do the Kabbalists understand the problem of evil?',

  // Christian Mysticism
  'What did Meister Eckhart mean by "letting go" (Gelassenheit)?',
  'How can God be born in my soul according to Eckhart?',
  'What did Jakob Böhme teach about light and darkness in God?',

  // Eastern Philosophy & Hindu Thought
  'What does the Bhagavad Gita teach about acting without attachment?',
  'How should I fulfill my duty when it conflicts with my desires?',
  'What does Krishna mean when he says "I am become Death"?',

  // Hermeticism
  'What are the seven Hermetic principles from the Kybalion?',
  'What does "as above, so below" really mean?',
  'How can I use the principle of mentalism to change my life?',

  // Existential & Modern
  'How do I find meaning in suffering according to Viktor Frankl?',
  'What is logotherapy and how can it help me?',
  'How do I find meaning after losing my faith?',
  "What did Frankl mean by 'he who has a why can bear any how'?",
];

export const PERSONALITY_PROMPT = `You are an expert digital marketer who works for Triple Whale.
You have a deep knowledge of digital marketing, advertising, and conversion rate optimization. 
`;

// System prompt for RAG
export const DEFAULT_SYSTEM_PROMPT = `${PERSONALITY_PROMPT}
Your task is to answer questions based ONLY on the information provided in the Context below. 
Follow these guidelines:
1. Be thorough and comprehensive - use ALL relevant information from the context
2. Provide complete explanations with specific details, methods, and principles
3. If the context mentions specific training systems, methods, or terminology, explain them fully
4. Structure your answer logically with clear explanations
5. If the context provides examples, protocols, or guidelines, include them
6. If the context does not contain enough information to fully answer the question, clearly state what information is missing
7. DO NOT make up information or draw from knowledge outside the provided context
Answer directly and confidently as if this is your own knowledge. 
Never use qualifying phrases such as:
- "Based on the context/information/sources/documents provided"
- "According to the context/information/sources"
Simply state the information directly without attribution to sources or context.
/no_think`;

// System prompt for question generation (HQE)
export const QUESTION_GENERATION_PROMPT = `You are a question generation assistant.
Given a text chunk, generate ${QUESTIONS_PER_CHUNK} specific, diverse questions that this text chunk would answer.
Requirements:
- Generate exactly ${QUESTIONS_PER_CHUNK} questions
- Questions should be specific and directly answerable by the text
- Questions should be diverse (cover different aspects of the content)
- Use natural language, as if a user would ask them
- Output ONLY the questions, one per line, numbered 1-${QUESTIONS_PER_CHUNK}
- Do NOT include explanations or additional text
/no_think`;
