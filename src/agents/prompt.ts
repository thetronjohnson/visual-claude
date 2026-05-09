import type { PendingEditRequest } from '../server/edit-queue.js';

export function buildPrompt(request: PendingEditRequest): string {
  const { instruction, tagName, className, textContent, selector, sourceLocation, elements } = request;

  let prompt: string;

  if (elements && elements.length > 1) {
    prompt = `The user is visually editing their web app. They selected ${elements.length} UI elements and want to make a change to all of them.

**Selected elements:**`;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      prompt += `

Element ${i + 1}:
- Tag: <${el.tagName}>
- Class: "${el.className}"
- Text: "${el.textContent}"
- Selector: ${el.selector}`;

      if (el.sourceLocation) {
        prompt += `
- File: ${el.sourceLocation.filePath}:${el.sourceLocation.line}
- Code context:
\`\`\`
${el.sourceLocation.context}
\`\`\``;
      }
    }

    prompt += `

**User instruction (apply to ALL selected elements):** "${instruction}"

Read each file, make the minimal edits needed, and save. Apply the same change to all selected elements. Only change what was requested.`;
  } else {
    prompt = `The user is visually editing their web app. They selected a UI element and want to make a change.

**Selected element:**
- Tag: <${tagName}>
- Class: "${className}"
- Text: "${textContent}"
- Selector: ${selector}`;

    if (sourceLocation) {
      prompt += `

**Source location found:**
- File: ${sourceLocation.filePath}
- Line: ${sourceLocation.line}
- Code context:
\`\`\`
${sourceLocation.context}
\`\`\``;
    }

    prompt += `

**User instruction:** "${instruction}"

Read the file, make the minimal edit needed, and save it. Only change what was requested.`;
  }

  return prompt;
}
