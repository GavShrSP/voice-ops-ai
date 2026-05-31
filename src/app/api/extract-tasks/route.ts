type ExtractedTask = {
  employee: string;
  task: string;
  deadline: string;
  status: "Pending";
};

type OpenRouterResponse = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message?: string;
  };
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "poolside/laguna-m.1:free";

function getTaskValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTasksFromContent(content: string): ExtractedTask[] {
  const cleanedContent = content
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  const parsedTasks = JSON.parse(cleanedContent);

  if (!Array.isArray(parsedTasks)) {
    return [];
  }

  return parsedTasks
    .map((task) => ({
      employee: getTaskValue(task.employee),
      task: getTaskValue(task.task),
      deadline: getTaskValue(task.deadline),
      status: "Pending" as const,
    }))
    .filter((task) => task.employee || task.task || task.deadline);
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const body = await req.json();
    const transcript = body.transcript;

    if (!apiKey) {
      return Response.json(
        { error: "OPENROUTER_API_KEY is not configured" },
        { status: 500 }
      );
    }

    if (!transcript || typeof transcript !== "string") {
      return Response.json({ result: [] });
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Extract operational tasks from the transcript. Return ONLY valid JSON. No markdown. No explanations. Each task should contain employee, task, deadline and status.",
          },
          {
            role: "user",
            content: `Extract tasks from this transcript.

Rules:
- Identify employee names.
- Identify assigned tasks.
- Identify deadlines if mentioned.
- Set every status to "Pending".
- If a value is not mentioned, use an empty string.
- Return only a JSON array in this exact shape:
[
  {
    "employee": "",
    "task": "",
    "deadline": "",
    "status": "Pending"
  }
]

Transcript:
${transcript}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "task_extraction",
            strict: true,
            schema: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["employee", "task", "deadline", "status"],
                properties: {
                  employee: { type: "string" },
                  task: { type: "string" },
                  deadline: { type: "string" },
                  status: {
                    type: "string",
                    enum: ["Pending"],
                  },
                },
              },
            },
          },
        },
      }),
    });

    const data = (await response.json()) as OpenRouterResponse;

    if (!response.ok) {
      console.error("OpenRouter Error:", data.error?.message || data);

      return Response.json(
        { error: "Task extraction failed" },
        { status: response.status }
      );
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return Response.json({ result: [] });
    }

    const tasks = parseTasksFromContent(content);
    return Response.json({
      result: tasks,
    });
  } catch (error) {
    console.error("FULL ERROR:", error);

    return Response.json(
      {
        error: "Something went wrong",
      },
      { status: 500 }
    );
  }
}
