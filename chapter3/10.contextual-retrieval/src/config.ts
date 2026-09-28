import dotenv from 'dotenv';

dotenv.config();

export const answerConfig = {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:latest',
};
