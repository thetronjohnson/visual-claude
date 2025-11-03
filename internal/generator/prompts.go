package generator

import (
	"fmt"

	"github.com/thetronjohnson/layrr/internal/analyzer"
)

// BuildPrompt creates a detailed prompt for code generation based on project context
func BuildPrompt(ctx *analyzer.ProjectContext) string {
	lang := "JavaScript"
	if ctx.TypeScript {
		lang = "TypeScript"
	}

	framework := ctx.Framework
	styling := ctx.Styling

	// Build framework-specific instructions
	frameworkInstructions := getFrameworkInstructions(framework, ctx.TypeScript)

	// Build styling-specific instructions
	stylingInstructions := getStylingInstructions(styling)

	return fmt.Sprintf(`You are an expert frontend developer. Generate a production-ready component from the provided design image.

**Project Context:**
- Framework: %s
- Styling: %s
- Language: %s

**Requirements:**
1. Analyze the design image carefully - match colors, spacing, typography, and layout EXACTLY
2. Generate a complete, functional component that matches the design pixel-perfect
3. Use %s syntax and best practices
4. Use %s for all styling
5. Make it fully responsive (mobile-first approach, then tablet and desktop breakpoints)
6. Include proper accessibility attributes (ARIA labels, semantic HTML, keyboard navigation)
7. Add appropriate hover, focus, and active states for interactive elements
8. Use modern %s features and patterns

%s

%s

**Output Format:**
- Return ONLY the component code
- No markdown code blocks (no triple backticks)
- No explanations or comments outside the code
- Complete file content ready to save directly
- Include all necessary imports at the top
- Export the component as default

Generate the component now:`,
		framework,
		styling,
		lang,
		framework,
		styling,
		framework,
		frameworkInstructions,
		stylingInstructions,
	)
}

func getFrameworkInstructions(framework string, typescript bool) string {
	switch framework {
	case "react":
		if typescript {
			return `**React/TypeScript Instructions:**
- Use functional components with hooks
- Define proper TypeScript interfaces for props
- Use React.FC or explicit prop types
- Implement proper error boundaries if needed
- Use React best practices (memoization, proper key props, etc.)`
		}
		return `**React Instructions:**
- Use functional components with hooks (useState, useEffect, etc.)
- Use destructured props
- Implement proper PropTypes if needed
- Follow React best practices`

	case "vue":
		return `**Vue Instructions:**
- Use Vue 3 Composition API syntax
- Define props with proper types
- Use reactive() or ref() for state management
- Emit events properly
- Follow Vue style guide`

	case "svelte":
		return `**Svelte Instructions:**
- Use Svelte 3/4 syntax
- Use reactive declarations ($:)
- Define props properly
- Use Svelte transitions and animations where appropriate
- Follow Svelte best practices`

	case "angular":
		return `**Angular Instructions:**
- Use Angular component syntax
- Define proper TypeScript decorators
- Implement OnInit, OnDestroy as needed
- Use Angular directives (*ngFor, *ngIf, etc.)
- Follow Angular style guide`

	default:
		return `**HTML/JS Instructions:**
- Use semantic HTML5 elements
- Write clean, vanilla JavaScript
- Use ES6+ features
- Implement proper event handling`
	}
}

func getStylingInstructions(styling string) string {
	switch styling {
	case "tailwind":
		return `**Tailwind CSS Instructions:**
- Use Tailwind utility classes for ALL styling
- No custom CSS - only Tailwind classes
- Use responsive modifiers (sm:, md:, lg:, xl:, 2xl:)
- Use Tailwind color palette
- Use Tailwind spacing scale (p-4, m-2, gap-6, etc.)
- Use Tailwind flexbox and grid utilities
- Example: <div className="flex items-center justify-between p-4 bg-blue-500 rounded-lg">`

	case "styled-components":
		return "**Styled Components Instructions:**\n" +
			"- Use styled-components for all styling\n" +
			"- Create styled components at the component level\n" +
			"- Use template literals for dynamic styles\n" +
			"- Use theme values if available\n" +
			"- Example: const Button = styled.button`padding: 1rem; background: blue;`"

	case "emotion":
		return `**Emotion CSS Instructions:**
- Use @emotion/styled or css prop
- Create styled components
- Use theme values if available
- Example: css={{ padding: '1rem', background: 'blue' }}`

	case "css-modules":
		return `**CSS Modules Instructions:**
- Create a separate .module.css file
- Import styles as: import styles from './Component.module.css'
- Use className={styles.className}
- Write CSS in the separate file`

	default:
		return `**CSS Instructions:**
- Use inline styles or separate CSS file
- Write clean, modern CSS
- Use CSS Grid and Flexbox
- Use CSS variables if appropriate`
	}
}
