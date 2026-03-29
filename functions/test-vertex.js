const { VertexAI } = require("@google-cloud/vertexai");

async function run() {
  try {
    const vertexAPI = new VertexAI({ project: "goalie-coach-dev-11a17", location: "us-central1" });
    const model = vertexAPI.preview.getGenerativeModel({ model: "gemini-1.5-pro" });
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
    });
    console.log("Success:", JSON.stringify(res.response.candidates[0].content.parts));
  } catch (err) {
    console.error("Error:", err.message);
  }
}
run();
