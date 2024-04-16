import { CreateMessage, JSONValue } from '../shared/types';
interface GenerateContentResponse {
  candidates: GenerateContentCandidate[]; // Ensuring it's always defined as an array
}

async function* streamable(response: {
  stream: AsyncIterable<GenerateContentResponse>;
}) {
  for await (const chunk of response.stream) {
    const parts = chunk.candidates?.[0]?.content?.parts;

    if (parts === undefined) {
      continue;
    }

    const firstPart = parts[0];

    if (typeof firstPart.text === 'string') {
      yield firstPart.text;
    }
  }
}

interface Content {
  role: string;
  parts: Part[];
}

interface TextPart {
  text: string;
  inlineData?: never;
}

interface GeminiFunctionCall {
  name: string;
  args: Record<string, any>;
}

interface GenerateContentCandidate {
  index: number;
  content: Content;
}

interface GenerateContentResponse {
  candidates: GenerateContentCandidate[];
}

interface BasePart {
  text?: string;
}

interface TextPart extends BasePart {
  text: string;
}

interface FunctionCallPart {
  name: string;
  args: Record<string, any>;
}

interface FunctionCallContainer extends BasePart {
  functionCall: FunctionCallPart;
}

type Part = TextPart | FunctionCallContainer;

function isFunctionCallContainer(part: Part): part is FunctionCallContainer {
  return (part as FunctionCallContainer).functionCall !== undefined;
}
function parseGeminiFunctionCall(response: GenerateContentResponse): FunctionCallPart | null {
  const firstCandidate = response.candidates[0];
  const functionCallPart = firstCandidate.content.parts.find(isFunctionCallContainer);
  return functionCallPart?.functionCall || null;
}

interface GoogleGeminiStreamCallbacks {
  experimental_onFunctionCall?: (
    functionCallPayload: GeminiFunctionCall, // Specific to Gemini response structure.
    createFunctionCallMessages: (functionCallResult: JSONValue) => CreateMessage[],
  ) => Promise<
    Response | undefined | void | string | AsyncIterable<GenerateContentResponse>
  >;
}

export function GoogleGenerativeAIStream(
  response: { stream: AsyncIterable<GenerateContentResponse> },
  cb?: GoogleGeminiStreamCallbacks
): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const reader = response.stream[Symbol.asyncIterator]();

      // Reading logic and invoking the function call handler
      // @ts-ignore
      reader.next().then(async function process({ done, value }) {
        if (done) {
          controller.close();
          return;
        }

        const functionDetails = parseGeminiFunctionCall(value);
        if (functionDetails && cb?.experimental_onFunctionCall) {
          const createFunctionCallMessages = (functionCallResult: JSONValue): CreateMessage[] => {
            // Logic to transform function call result into chat messages
            return [
              { role: 'system', content: `Result: ${JSON.stringify(functionCallResult)}` }
            ];
          };

          await cb.experimental_onFunctionCall(functionDetails, createFunctionCallMessages);
        }

        controller.enqueue(value);
        return reader.next().then(process);
      });
    }
  });
}
