# Beginner Audit: What makes a 小白 confused or not "爽"

## Problem 1: No first-run welcome
When I run `devlog` for the first time ever, it just dumps data at me.
No "Hey! Welcome to DevLog", no explanation of what I'm looking at.
A beginner doesn't know what "45 tool calls" means or why they should care.

## Problem 2: The data is there but the STORY is missing
I see numbers. But what do they MEAN to me?
- "45 tool calls" — so what?
- "26 files touched" — which files? why should I care?
- "$0.138 spent" — is that a lot? a little?
The data needs CONTEXT and NARRATIVE.

## Problem 3: No "what can I do next" guidance
After seeing the dashboard, I'm stuck. The footer says "devlog sessions" but WHY would I run that? What's different from what I just saw?
A beginner needs a clear, contextual "try this next" prompt.

## Problem 4: Jargon everywhere
- "↔ turns" — what's a turn?
- "⚡ tools" — what tools?
- "📄 files" — what files?
A beginner needs plain language, or at least tooltips/explanations on first run.

## Problem 5: No way to "drill in"
I see a session card. I want to know MORE about it. But there's no `devlog show <session>` command.
The journey dead-ends at the list level.

## Problem 6: The --help is too sparse
3 lines of help. No examples. No "Quick Start" section.
A beginner who runs --help should get a mini-tutorial.

## Problem 7: No personality
The tool feels like a database query result. No personality, no voice.
The best CLI tools (like gh, railway, vercel) have a VOICE.

## FIXES TO IMPLEMENT:
1. First-run welcome message with explanation
2. Narrative stats ("You and Claude had 68 conversations across 4 projects")
3. `devlog show` command to drill into a session
4. Contextual "try next" that changes based on what you just did
5. Human-readable badges (not jargon)
6. Rich --help with examples
7. A warm, encouraging voice throughout
