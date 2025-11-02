# Design-to-Code User Flow

## Overview
Visual Claude's Design-to-Code feature uses Claude's vision capabilities to analyze design images and generate production-ready components.

---

## User Flow

### 1. **Open Design Modal**
- **Trigger:** Click the 📷 image icon in bottom-right pill
- **Keyboard:** None (click only)
- **Location:** `inject.js:939` - `openDesignModal()`

### 2. **Upload Design Image**
Three methods to upload:
- **Drag & Drop:** Drop image onto the dashed border zone
- **File Picker:** Click "Browse Files" button
- **Paste:** Cmd+V / Ctrl+V while modal is open

**Supported formats:** PNG, JPEG, GIF, WebP (any browser-supported image)

### 3. **Add Context Prompt**
- **Input:** Text area for describing what to build
- **Examples:**
  - "Create a pricing card component with this design"
  - "Build a hero section based on this mockup"
  - "Implement this login form"

### 4. **Submit for Analysis**
- **Button:** "Analyze & Create Component"
- **Requirements:** Both image AND prompt must be provided

---

## Technical Flow

### Frontend (Browser)
```javascript
// 1. User uploads image
processImage(file) → Base64 encoding

// 2. User submits
analyzeAndExecute() → WebSocket message
{
  type: 'analyze-design',
  image: '<base64>',
  prompt: 'Create a pricing card...'
}
```

### Backend (Go)
```go
// 3. Receive and analyze project
handleAnalyzeDesign()
  ↓
// Detect framework (React/Vue/Svelte/Angular)
analyzer.AnalyzeProject() → { Framework, Styling, TypeScript }
  ↓
// 4. Claude Vision API - Analyze Design
visionPrompt = "Analyze this <Framework> design using <Styling>..."
client.GenerateFromImage(image, visionPrompt)
  ↓
// Response: Detailed design description
{
  layout: "...",
  colors: "...",
  typography: "...",
  interactions: "..."
}
  ↓
// 5. Claude Code - Generate Component
instruction = userPrompt + visualAnalysis
bridge.HandleMessage(instruction) → Claude Code CLI
  ↓
// Claude Code writes component files
// Files auto-reload via file watcher
```

---

## What Happens Behind the Scenes

### Phase 1: Vision Analysis (server.go:190-208)
```
Claude Vision API analyzes the image:
1. Visual layout and structure
2. Colors, typography, spacing
3. Interactive elements (buttons, inputs)
4. Animations/transitions
5. Responsive design considerations
```

### Phase 2: Code Generation (server.go:214-246)
```
Combined instruction sent to Claude Code:
"<User Prompt>

Design Analysis:
<Vision API Description>"

Claude Code:
- Creates component files (jsx/vue/svelte)
- Applies styling (CSS/Tailwind/styled-components)
- Implements interactions
- Follows project conventions
```

### Phase 3: Live Reload (watcher.go)
```
File watcher detects changes → Browser auto-reloads
```

---

## User Experience States

### Loading States (inject.js:1042-1058)
1. **Analyzing** - Claude Vision analyzing design
2. **Sending** - Sending to Claude Code
3. **Processing** - Claude Code generating component
4. **Complete** - Modal closes, status indicator shows progress

### Error Handling
- Missing image/prompt → Validation error
- API key not configured → Configuration error
- Analysis failed → Error displayed in modal
- WebSocket disconnected → Connection error

---

## File Locations

### Frontend
- **Modal UI:** `inject.js:2662-2838`
- **Logic:** `inject.js:939-1058`
- **Image processing:** `inject.js:1001-1012`

### Backend
- **Handler:** `server.go:151-267`
- **Vision API:** `anthropic.go:93-171`
- **Project analysis:** `analyzer/project.go`

---

## Example Prompt Templates

### Landing Page Components
```
"Create a hero section with this design. Include the heading,
subtext, CTA button, and background image."
```

### UI Components
```
"Build a card component matching this design. It should be
reusable with props for title, description, and image."
```

### Forms
```
"Implement this contact form with proper validation. Include
all input fields, labels, and the submit button."
```

### Navigation
```
"Create a responsive navbar based on this design. Include
logo, navigation links, and mobile menu."
```

---

## Tips for Best Results

1. **Clear Images:** Use high-resolution mockups
2. **Specific Prompts:** Describe the component type and purpose
3. **Mention Framework:** If specific patterns needed (though auto-detected)
4. **Include Interactions:** Describe hover states, animations
5. **Responsive Needs:** Mention mobile/tablet requirements

---

## Keyboard Shortcuts

- **Escape:** Close design modal
- **Cmd+V / Ctrl+V:** Paste image from clipboard

---

## Supported Frameworks

Auto-detected from project:
- ✅ React (.jsx, .tsx)
- ✅ Vue (.vue)
- ✅ Svelte (.svelte)
- ✅ Angular (.component.ts)
- ✅ Plain HTML/CSS

Auto-detected styling:
- ✅ Tailwind CSS
- ✅ Styled Components
- ✅ Emotion
- ✅ CSS Modules
- ✅ Plain CSS/SCSS
