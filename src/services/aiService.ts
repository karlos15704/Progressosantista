import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface CorrectionResult {
  studentName: string;
  answers: Record<string, string>;
  score: number;
  maxScore: number;
  feedback: string;
}

export async function correctExamFromImage(
  imageBase64: string,
  examTitle: string,
  answerKey: Record<string, string>
): Promise<CorrectionResult> {
  const prompt = `
    Você é um assistente de correção de provas. 
    Analise a imagem do gabarito da prova "${examTitle}".
    O gabarito oficial é: ${JSON.stringify(answerKey)}.
    
    Extraia o nome do aluno e as respostas marcadas (ex: 1: A, 2: B, ...).
    Compare com o gabarito oficial e calcule a nota final.
    Dê um feedback construtivo curto.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          studentName: { type: Type.STRING },
          answers: { 
            type: Type.OBJECT,
            description: "Mapeamento de número da questão para resposta extraída"
          },
          score: { type: Type.NUMBER },
          maxScore: { type: Type.NUMBER },
          feedback: { type: Type.STRING }
        },
        required: ["studentName", "answers", "score", "maxScore", "feedback"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Falha ao processar a imagem da prova.");
  }

  return JSON.parse(response.text);
}

export async function generateStudyGuide(content: string): Promise<string> {
  const prompt = `
    Com base nos seguintes conteúdos: "${content}", crie um guia de estudos estruturado para os alunos.
    Inclua tópicos principais, explicações breves e dicas de estudo.
    Formate em Markdown.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  return response.text || "Não foi possível gerar o guia.";
}
