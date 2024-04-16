import {
  createCallbacksTransformer,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
} from './ai-stream';

import { createStreamDataTransformer } from './stream-data';
import { CreateMessage, JSONValue } from '../shared/types';

// interface GenerateContentResponse {
//   candidates?: GenerateContentCandidate[];
// }

// interface GenerateContentResponse {
//   candidates?: GenerateContentCandidate[]; // If it can be optionally undefined
// }

interface GenerateContentResponse {
  candidates: GenerateContentCandidate[]; // Ensuring it's always defined as an array
}



interface Content {
  role: string;
  parts: Part[];
}

// type Part = TextPart | InlineDataPart;

interface InlineDataPart {
  text?: never;
}

interface TextPart {
  text: string;
  inlineData?: never;
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

// export function GoogleGenerativeAIStream(
//   response: {
//     stream: AsyncIterable<GenerateContentResponse>;
//   },
//   cb?: AIStreamCallbacksAndOptions,
// ): ReadableStream {
//   return readableFromAsyncIterable(streamable(response))
//     .pipeThrough(createCallbacksTransformer(cb))
//     .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData));
// }

// function parseGeminiFunctionCall(data) {
//   // Example structure based on the Provided Gemini response structure
//   return data.candidates[0]?.content?.parts?.find(part => part.functionCall)?.functionCall || null;
// }


// interface FunctionCallPart {
//   name: string;
//   args: Record<string, any>;
// }
//
// interface Part {
//   text?: string;
//   functionCall?: FunctionCallPart;
// }
//
// interface Content {
//   role: string;
//   parts: Part[];
// }
//
// interface GenerateContentCandidate {
//   content: Content;
// }
//
// interface GenerateContentResponse {
//   candidates: GenerateContentCandidate[];
// }


interface GeminiFunctionCall {
  name: string;
  args: Record<string, any>;
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GenerateContentCandidate {
  index: number;
  content: Content;
}
// interface GenerateContentCandidate {
//   content: GeminiContent;
// }

interface GenerateContentResponse {
  candidates: GenerateContentCandidate[];
}

// function parseGeminiFunctionCall(response: GenerateContentResponse): FunctionCallPart | null {
//   const firstCandidate = response.candidates[0];
//   const functionCallPart = firstCandidate.content.parts.find(part => part.functionCall);
//   return functionCallPart?.functionCall || null;
// }
//
// export function GoogleGenerativeAIStream(
//   response: { stream: AsyncIterable<GenerateContentResponse> },
//   cb?: AIStreamCallbacksAndOptions,
// ): ReadableStream {
//   return readableFromAsyncIterable(response.stream)
//     .pipeThrough(new TransformStream({
//       transform(chunk, controller) {
//         const functionDetails = parseGeminiFunctionCall(chunk);
//         if (functionDetails && cb?.experimental_onFunctionCall) {
//           cb.experimental_onFunctionCall(functionDetails);
//         }
//       }
//     }))
//     .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData));
// }




// interface AIStreamCallbacksAndOptions {
//   experimental_onFunctionCall?: (functionCall: GeminiFunctionCall) => void;
//   experimental_streamData?: boolean;
// }

// function parseGeminiFunctionCall(response: GenerateContentResponse): GeminiFunctionCall | null {
//   // @ts-ignore
//   const firstCandidate = response.candidates[0];
//   const functionCallPart = firstCandidate.content.parts.find(part => {
//     return part.functionCall;
//   });
//   return functionCallPart?.functionCall || null;
// }


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

// export function GoogleGenerativeAIStream(
//   response: { stream: AsyncIterable<GenerateContentResponse> },
//   cb?: AIStreamCallbacksAndOptions
// ): ReadableStream {
//   return new ReadableStream({
//     start(controller) {
//       const reader = response.stream[Symbol.asyncIterator]();
//       const transformStream = new TransformStream({
//         async transform(chunk, controller) {
//           const functionDetails = parseGeminiFunctionCall(chunk);
//           if (functionDetails && cb?.experimental_onFunctionCall) {
//             cb.experimental_onFunctionCall(functionDetails);
//           }
//           controller.enqueue(chunk);
//         }
//       });
//
//       reader.next().then(function process({ done, value }) {
//         if (done) {
//           controller.close();
//           return;
//         }
//         const transformedStream = transformStream.writable.getWriter();
//         transformedStream.write(value);
//         transformedStream.releaseLock();
//
//         return reader.next().then(process);
//       });
//     }
//   }).pipeThrough(new TransformStream({
//     transform(chunk, controller) {
//       // Implement data transformation or flow control as needed
//       controller.enqueue(chunk);
//     }
//   }));
// }



// export function GoogleGenerativeAIStream(
//   response: { stream: AsyncIterable<GenerateContentResponse>; },
//   cb?: AIStreamCallbacksAndOptions,
// ): ReadableStream {
//   const stream = readableFromAsyncIterable(response.stream).pipeThrough(createCallbacksTransformer({
//     ...cb,
//     onFunctionCall: async (functionCall) => {
//       // Handle Gemini function call
//       const functionDetails = parseGeminiFunctionCall(functionCall);
//       if (functionDetails) {
//         // Add handler logic similar to experimental_onFunctionCall in OpenAIStream
//         console.log("Function call detected:", functionDetails);
//       }
//     }
//   }));
//   return stream.pipeThrough(createStreamDataTransformer(cb?.experimental_streamData));
// }










//
// import {
//   createCallbacksTransformer,
//   readableFromAsyncIterable,
//   type AIStreamCallbacksAndOptions,
// } from './ai-stream';
// import { createStreamDataTransformer } from './stream-data';
//
// interface GenerateContentResponse {
//   candidates?: GenerateContentCandidate[];
// }
//
// interface GenerateContentCandidate {
//   index: number;
//   content: Content;
// }
//
// interface Content {
//   role: string;
//   parts: Part[];
// }
//
// type Part = TextPart | InlineDataPart | FunctionCallPart;
//
// interface TextPart {
//   text: string;
//   inlineData?: never;
// }
//
// interface InlineDataPart {
//   text?: never;
// }
//
// interface FunctionCallPart {
//   functionCall: {
//     name: string;
//     args: any;  // Modify as per Gemini's actual API specs
//   };
//   text?: never;
//   inlineData?: never;
// }
//
// async function* streamable(response: {
//   stream: AsyncIterable<GenerateContentResponse>;
// }) {
//   for await (const chunk of response.stream) {
//     const parts = chunk.candidates?.[0]?.content?.parts;
//
//     for (const part of parts || []) {
//       if (part.text) {
//         yield part.text;
//       } else if (part.functionCall) {
//         yield JSON.stringify({
//           isText: false,
//           function_call: {
//             name: part.functionCall.name,
//             arguments: JSON.stringify(part.functionCall.args)
//           }
//         });
//       }
//     }
//   }
// }
//
// export function GoogleGenerativeAIStream(
//   response: {
//     stream: AsyncIterable<GenerateContentResponse>;
//   },
//   cb?: AIStreamCallbacksAndOptions,
// ): ReadableStream {
//   const stream = readableFromAsyncIterable(streamable(response));
//
//   // Handle function calls if a relevant callback is provided
//   if (cb && cb.experimental_onFunctionCall) {
//     const transformStream = new TransformStream({
//       async transform(chunk, controller) {
//         const decodedChunk = JSON.parse(chunk);
//         if (decodedChunk.isText === false && decodedChunk.function_call) {
//           const result = await cb.experimental_onFunctionCall(decodedChunk.function_call, (functionResult) => {
//             return [{
//               role: 'function',
//               content: JSON.stringify(functionResult),
//             }];
//           });
//           controller.enqueue(new TextEncoder().encode(JSON.stringify(result)));
//         } else {
//           controller.enqueue(chunk);
//         }
//       }
//     });
//
//     return stream.pipeThrough(transformStream);
//   } else {
//     return stream.pipeThrough(createCallbacksTransformer(cb))
//       .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData));
//   }
// }