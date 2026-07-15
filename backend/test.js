require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";

async function test() {
  const model = genAI.getGenerativeModel({ model: modelName });  
    const result = await model.generateContent("Say hello in one sentence.");
    console.log(result.response.text());

}

test().catch(err => console.error("Error:", err.message));
