import { NextResponse } from "next/server";
import questionsData from "@/data/react-mcq-50.json";

// Returns question data (including code snippets) but WITHOUT correct answers
export async function GET() {
  const safeQuestions = questionsData.map((q: Record<string, unknown>) => ({
    id: q.id,
    topic: q.topic,
    difficulty: q.difficulty,
    questionType: q.questionType || "theory",
    question: q.question,
    codeSnippet: q.codeSnippet || null,
    options: q.options,
    tags: q.tags,
    // NOTE: correctOptionId is NOT included
  }));

  return NextResponse.json(safeQuestions);
}
