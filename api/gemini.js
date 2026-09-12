// ===================================================
// Gemini API 호출 서버리스 함수 (Vercel Serverless Function)
//
// 주소: /api/gemini
// 모델: gemini-1.5-flash (Google AI 무료 티어 제공 모델)
//
// 규칙:
//   - API 키는 Vercel 환경변수(GEMINI_API_KEY)에서 가져옵니다.
//   - 개인정보 보호: 학생 이름이나 uid 등 식별 정보는 전달받지 않고,
//     오직 메모 내용(text)만 Gemini에게 전달합니다.
// ===================================================

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 허용됩니다." });
  }

  const { text } = req.body || {};

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "메모 내용(text)이 필요합니다." });
  }

  // Vercel 환경변수에서 Gemini API 키 읽기
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 환경변수에 등록해 주세요."
    });
  }

  // Google Gemini API 무료 모델 (gemini-1.5-flash) 호출 엔드포인트
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // 따뜻한 교사 페르소나 프롬프트 (개인 식별 정보 제외)
  const prompt = `당신은 학생들을 따뜻하게 격려하는 초·중등학교 교사입니다.
학생이 학급 담벼락에 남긴 다음 메모를 읽고, 학생에게 힘이 되는 따뜻한 칭찬과 응원의 한마디(1~2문장의 친근한 존댓말)를 작성해 주세요.

학생 메모: "${text}"`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.error?.message || "Gemini API 호출에 실패했습니다."
      });
    }

    const data = await response.json();
    const comment =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "참 좋은 생각이에요! 선생님도 함께 응원할게요.";

    return res.status(200).json({ comment });
  } catch (error) {
    console.error("Gemini API 호출 에러:", error);
    return res.status(500).json({
      error: "서버 내부 오류가 발생했습니다: " + error.message
    });
  }
}
