import dotenv from 'dotenv';

dotenv.config();

export const config = {
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:latest',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  visionModel: process.env.VISION_MODEL || '',
};
