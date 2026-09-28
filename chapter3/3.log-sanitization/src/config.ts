import dotenv from "dotenv";
dotenv.config();
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:latest";
export const VERBOSE = process.env.VERBOSE !== "false";
