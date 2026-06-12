import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in .env");
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

async function main() {
    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: "Trả lời một câu ngắn: Gemini API đã chạy chưa?",
    });

    console.log(response.text);
}

main().catch((error) => {
    console.error("Gemini error:", error.message);
});