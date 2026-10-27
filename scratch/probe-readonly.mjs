import { prerender } from "react-dom/static";
import { createElement } from "react";

const { prelude } = await prerender(
  createElement("input", { type: "email", name: "email", value: "a@b.c", readOnly: true }),
);

const chunks = [];
const decoder = new TextDecoder();
for await (const chunk of prelude) {
  chunks.push(typeof chunk === "string" ? chunk : decoder.decode(chunk));
}

console.log(JSON.stringify(chunks.join("")));
